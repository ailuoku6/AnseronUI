package org.anseronui.demo

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.*
import org.anseronui.render.*
import org.json.JSONObject
import android.content.Context
import java.net.URL

class MainActivity : Activity() {
    private lateinit var content: AnseronUIRenderView
    private lateinit var status: TextView
    private val availablePages: List<String> by lazy { readPages() }
    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        layout.setOnApplyWindowInsetsListener { view, insets ->
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        val pages = LinearLayout(this)
        for (page in availablePages) {
            val title = pageTitle(page)
            pages.addView(Button(this).apply { text = title; setOnClickListener { showPage(page) } }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        status = TextView(this).apply { text = "AnseronUI · shared TSX → AOT Core → Android View" }
        content = AnseronUIRenderView(this, baseUrl = URL("http://127.0.0.1:5174"), extensions = demoExtensions()).apply {
            onDiagnostic = { code, message -> status.text = "$code: $message" }
            onFailure = { error -> status.text = "Error: $error"; android.util.Log.e("AnseronUI", "Host failed", error) }
        }
        layout.addView(pages); layout.addView(status); layout.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(layout)
        showPage(availablePages.firstOrNull() ?: "counter")
    }
    private fun showPage(page: String) {
        content.load(page)
    }
    @Deprecated("Android invokes this callback for system back; AnseronUI handles it before Activity navigation")
    override fun onBackPressed() {
        if (content.handleBackPress()) return
        if (content.pop()) return
        super.onBackPressed()
    }
    override fun onDestroy() { content.destroy(); super.onDestroy() }
    private fun readPages(): List<String> = runCatching {
        val json = assets.open("core.manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        val pages = json.getJSONArray("pages")
        (0 until pages.length()).map { pages.getJSONObject(it).optString("name") }.filter { it.isNotBlank() }
    }.getOrDefault(listOf("counter", "async-form", "components", "extensions"))
    private fun pageTitle(page: String): String = mapOf("counter" to "Counter", "async-form" to "Async form", "components" to "组件", "extensions" to "扩展")[page] ?: page
}

private fun demoExtensions() = AndroidPlatformExtensions(
    modules = mapOf("device" to { method, _, complete ->
        require(method == "info") { "UNSUPPORTED_METHOD: $method" }
        complete(Result.success(JSONObject().put("platform", "Android").put("version", android.os.Build.VERSION.RELEASE)))
        null
    }),
    components = mapOf("DemoSwitch" to { context, emit -> DemoSwitch(context, emit) })
)
private class DemoSwitch(context: Context, private val emit: (String, Any?) -> Unit) : AndroidNativeComponent {
    private val control = Switch(context)
    private var applying = false
    override val view: View get() = control
    init { control.setOnCheckedChangeListener { _, value -> if (!applying) emit("change", JSONObject().put("value", value)) } }
    override fun setProps(props: JSONObject) { applying = true; control.isChecked = props.optBoolean("value"); applying = false }
    override fun invoke(method: String, args: Any?, complete: NativeCompletion): (() -> Unit)? {
        require(method == "toggle") { "UNSUPPORTED_METHOD: $method" }
        applying = true; control.isChecked = !control.isChecked; applying = false
        complete(Result.success(JSONObject().put("value", control.isChecked))); return null
    }
    override fun dispose() { control.setOnCheckedChangeListener(null) }
}
