package org.anseronui.render

import android.content.Context
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
    val routeStack: List<String> get() = routes.toList()
    var isDestroyed = false
        private set

    private var host: AndroidHost? = null
    private var renderRoot: FrameLayout? = null
    private var lastSize: Pair<Float, Float>? = null
    private var generation = 0L
    private var failed = false
    private val routes = mutableListOf<String>()

    /** Replaces the previous page. The new instance starts once the view has a nonzero size. */
    fun load(page: String) {
        requireMainThread()
        check(!isDestroyed) { "Container is destroyed" }
        require(page.isNotBlank()) { "Page must not be blank" }
        routes.clear(); routes.add(page)
        loadCurrentPage()
    }

    /** Pushes a page while preserving the current route for pop/back. */
    fun push(page: String) {
        requireMainThread(); check(!isDestroyed); require(page.isNotBlank())
        routes.add(page); loadCurrentPage()
    }

    /** Replaces the current route entry. */
    fun replace(page: String) {
        requireMainThread(); check(!isDestroyed && routes.isNotEmpty()); require(page.isNotBlank())
        routes[routes.lastIndex] = page; loadCurrentPage()
    }

    /** Pops the current route, returning false when already at the root. */
    fun pop(): Boolean {
        requireMainThread()
        if (isDestroyed || routes.size <= 1) return false
        routes.removeAt(routes.lastIndex); loadCurrentPage(); return true
    }

    /** Called by Activity/Fragment before applying its default back behavior. */
    fun handleBackPress(): Boolean = host?.handleBackPress() == true

    private fun loadCurrentPage() {
        val page = routes.lastOrNull() ?: return
        retirePage()
        this.page = page
        renderRoot = FrameLayout(context).also { addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
        requestLayout()
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        synchronizeSize()
    }

    /** Terminal and idempotent. Create another container to load pages after destruction. */
    fun destroy() {
        requireMainThread()
        if (isDestroyed) return
        isDestroyed = true
        retirePage()
        page = null
        routes.clear()
    }

    private fun retirePage() {
        generation++
        host?.destroy()
        host = null
        renderRoot?.let { removeView(it) }
        renderRoot = null
        lastSize = null
        failed = false
    }

    private fun synchronizeSize() {
        if (isDestroyed || failed) return
        val page = page ?: return
        val root = renderRoot ?: return
        val density = resources.displayMetrics.density
        val size = root.width / density to root.height / density
        val currentHost = host
        if (currentHost != null) {
            if (size != lastSize) {
                lastSize = size
                currentHost.resize(size.first, size.second)
            }
            return
        }
        if (size.first <= 0 || size.second <= 0) return
        val currentGeneration = generation
        val nextHost = AndroidHost(root, createCore, baseUrl, extensions = extensions, router = { method, args ->
            val pageArg = (args as? JSONObject)?.optString("page", "")
            when (method) {
                "push" -> { if (pageArg.isNullOrBlank()) error("INVALID_ROUTE"); AndroidRouteResult(JSONObject.NULL) { push(pageArg) } }
                "replace" -> { if (pageArg.isNullOrBlank()) error("INVALID_ROUTE"); AndroidRouteResult(JSONObject.NULL) { replace(pageArg) } }
                "pop", "back" -> { if (routes.size <= 1) error("ROUTER_EMPTY"); AndroidRouteResult(JSONObject.NULL) { pop() } }
                "current" -> AndroidRouteResult(routes.lastOrNull() ?: JSONObject.NULL)
                else -> error("UNSUPPORTED_METHOD: $method")
            }
        },
            onReady = { if (!isDestroyed && generation == currentGeneration) onReady() },
            onDiagnostic = { code, message -> if (!isDestroyed && generation == currentGeneration) onDiagnostic(code, message) },
            onFailure = { error ->
                if (!isDestroyed && generation == currentGeneration) {
                    failed = true
                    onFailure(error)
                }
            })
        host = nextHost
        nextHost.renderer.onPageBackgroundColor = { color ->
            if (!isDestroyed && generation == currentGeneration) onPageBackgroundColor(color)
        }
        lastSize = size
        nextHost.start(page, size.first, size.second)
    }

    private fun requireMainThread() {
        check(Looper.myLooper() == Looper.getMainLooper()) { "Use AnseronUIRenderView on the UI thread" }
    }
}
