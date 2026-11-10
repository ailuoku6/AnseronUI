package org.anseronui.render

import android.content.Context
import android.content.res.Configuration
import android.os.Looper
import android.util.AttributeSet
import android.widget.FrameLayout
import org.json.JSONObject
import java.net.URL

data class AndroidRouteResult(val value: Any?, val navigate: (() -> Unit)? = null)

/** Embeddable page container. Its owner must call [destroy] when finished.
 * Detaching the view preserves the page so temporary removal and reparenting are supported.
 */
class AnseronUIRenderView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
    private val baseUrl: URL? = null,
    private val createCore: () -> AndroidCoreTransport = { NativeCore() },
    private val extensions: AndroidPlatformExtensions = AndroidPlatformExtensions()
) : FrameLayout(context, attrs, defStyleAttr) {
    var onReady: () -> Unit = {}
    /** Lets the owning app extend the page background into system bars and insets. */
    var onPageBackgroundColor: (Int) -> Unit = {}
    var onDiagnostic: (String, String) -> Unit = { _, _ -> }
    var onFailure: (Throwable) -> Unit = {}
    var page: String? = null
        private set
    val routeStack: List<String> get() = routes.map { it.page }
    val routeParams: JSONObject get() = JSONObject(routes.lastOrNull()?.params ?: "{}")
    var isDestroyed = false
        private set

    private val host: AndroidHost? get() = routes.lastOrNull()?.host
    private val renderRoot: FrameLayout? get() = routes.lastOrNull()?.root
    private class Route(val page: String, val params: String) {
        var host: AndroidHost? = null
        var root: FrameLayout? = null
        var lastSize: Pair<Float, Float>? = null
        var failed = false
        var disposed = false
        var color: Int? = null
    }
    private val routes = mutableListOf<Route>()
    private fun snapshot(params: JSONObject): String {
        val encoded = params.toString()
        require(encoded.toByteArray(Charsets.UTF_8).size <= 48000) { "ROUTE_PARAMS_TOO_LARGE" }
        return encoded
    }

    /** Replaces the previous page. The new instance starts once the view has a nonzero size. */
    @JvmOverloads fun load(page: String, params: JSONObject = JSONObject()) {
        requireMainThread()
        check(!isDestroyed) { "Container is destroyed" }
        require(page.isNotBlank()) { "Page must not be blank" }
        val entry = Route(page, snapshot(params)); retireAllPages(); routes.add(entry)
        loadCurrentPage()
    }

    /** Pushes a page while preserving the current route for pop/back. */
    @JvmOverloads fun push(page: String, params: JSONObject = JSONObject()) {
        requireMainThread(); check(!isDestroyed); require(page.isNotBlank())
        val entry = Route(page, snapshot(params))
        renderRoot?.let { removeView(it) }; routes.add(entry); loadCurrentPage()
    }

    /** Replaces the current route entry. */
    @JvmOverloads fun replace(page: String, params: JSONObject = JSONObject()) {
        requireMainThread(); check(!isDestroyed && routes.isNotEmpty()); require(page.isNotBlank())
        val entry = Route(page, snapshot(params))
        retirePage(routes.removeAt(routes.lastIndex)); routes.add(entry); loadCurrentPage()
    }

    /** Pops the current route, returning false when already at the root. */
    fun pop(): Boolean {
        requireMainThread()
        if (isDestroyed || routes.size <= 1) return false
        retirePage(routes.removeAt(routes.lastIndex)); loadCurrentPage(); return true
    }

    /** Called by Activity/Fragment before applying its default back behavior. */
    fun handleBackPress(): Boolean = host?.handleBackPress() == true

    private fun loadCurrentPage() {
        val entry = routes.lastOrNull() ?: return
        page = entry.page
        val root = entry.root ?: FrameLayout(context).also { entry.root = it }
        if (root.parent == null) addView(root, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        host?.renderer?.appearanceChanged()
        entry.color?.let { onPageBackgroundColor(it) }
        requestLayout()
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        synchronizeSize()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        routes.forEach { it.host?.renderer?.appearanceChanged() }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        routes.forEach { it.host?.renderer?.appearanceChanged() }
    }

    /** Terminal and idempotent. Create another container to load pages after destruction. */
    fun destroy() {
        requireMainThread()
        if (isDestroyed) return
        isDestroyed = true
        retireAllPages()
        page = null
    }

    private fun retirePage(entry: Route) {
        entry.disposed = true
        entry.host?.destroy(); entry.host = null
        entry.root?.let { removeView(it) }; entry.root = null
    }
    private fun retireAllPages() {
        val old = routes.toList(); routes.clear(); old.forEach { retirePage(it) }
    }

    private fun synchronizeSize() {
        if (isDestroyed) return
        val entry = routes.lastOrNull() ?: return
        if (entry.failed) return
        val page = entry.page
        val root = entry.root ?: return
        val density = resources.displayMetrics.density
        val size = root.width / density to root.height / density
        val currentHost = host
        if (currentHost != null) {
            if (size != entry.lastSize) {
                entry.lastSize = size
                currentHost.resize(size.first, size.second)
            }
            return
        }
        if (size.first <= 0 || size.second <= 0) return
        val nextHost = AndroidHost(root, createCore, baseUrl, extensions = extensions, router = { method, args ->
            check(!isDestroyed && !entry.disposed) { "SURFACE_DISPOSED" }
            if (method == "getParams") AndroidRouteResult(JSONObject(entry.params))
            else if (method == "current") AndroidRouteResult(entry.page)
            else {
                check(routes.lastOrNull() === entry) { "INACTIVE_ROUTE" }
                val pageArg = (args as? JSONObject)?.optString("page", "")
                val rawParams = (args as? JSONObject)?.opt("params")
                require(rawParams == null || rawParams is JSONObject) { "INVALID_ROUTE_PARAMS" }
                val params = rawParams as? JSONObject ?: JSONObject()
                snapshot(params)
                when (method) {
                    "push" -> { if (pageArg.isNullOrBlank()) error("INVALID_ROUTE"); AndroidRouteResult(JSONObject.NULL) { if (routes.lastOrNull() === entry) push(pageArg, params) } }
                    "replace" -> { if (pageArg.isNullOrBlank()) error("INVALID_ROUTE"); AndroidRouteResult(JSONObject.NULL) { if (routes.lastOrNull() === entry) replace(pageArg, params) } }
                    "pop", "back" -> { if (routes.size <= 1) error("ROUTER_EMPTY"); AndroidRouteResult(JSONObject.NULL) { if (routes.lastOrNull() === entry) pop() } }
                    "getParams" -> AndroidRouteResult(routeParams)
                    "current" -> AndroidRouteResult(routes.lastOrNull()?.page ?: JSONObject.NULL)
                    else -> error("UNSUPPORTED_METHOD: $method")
                }
            }
        },
            onReady = { if (!isDestroyed && routes.lastOrNull() === entry) onReady() },
            onDiagnostic = { code, message -> if (!isDestroyed && routes.lastOrNull() === entry) onDiagnostic(code, message) },
            onFailure = { error ->
                if (!isDestroyed && !entry.disposed) {
                    entry.failed = true
                    if (routes.lastOrNull() === entry) onFailure(error)
                }
            })
        entry.host = nextHost
        nextHost.renderer.onPageBackgroundColor = { color ->
            if (!entry.disposed) { entry.color = color; if (!isDestroyed && routes.lastOrNull() === entry) onPageBackgroundColor(color) }
        }
        entry.lastSize = size
        nextHost.start(page, size.first, size.second)
    }

    private fun requireMainThread() {
        check(Looper.myLooper() == Looper.getMainLooper()) { "Use AnseronUIRenderView on the UI thread" }
    }
}
