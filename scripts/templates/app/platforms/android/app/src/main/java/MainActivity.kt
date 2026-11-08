package __APPLICATION_ID__

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.view.WindowInsetsController
import android.os.Bundle
import android.view.View
import android.widget.*
import org.anseronui.render.*
import org.json.JSONObject
import android.content.Context
import java.net.URL

class MainActivity : Activity() {
    private lateinit var content: AnseronUIRenderView

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        // Draw the root background behind transparent system bars; inset only the TSX content.
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false)
        else window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.WHITE)
        root.setOnApplyWindowInsetsListener { view, insets ->
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        content = AnseronUIRenderView(
            this,
            baseUrl = URL("http://127.0.0.1:5175"),
            createCore = { NativeCore("__BUILD_ID__") },
            extensions = org.anseronui.generated.AnseronUIPlugins.makeExtensions(this)
        ).apply {
            onDiagnostic = { code, message -> android.util.Log.w("__APP_NAME__", "$code: $message") }
            onFailure = { error -> android.util.Log.e("__APP_NAME__", "Host failed", error) }
        }
        content.onPageBackgroundColor = { color ->
            val alpha = Color.alpha(color)
            fun opaque(channel: Int) = (channel * alpha + 255 * (255 - alpha)) / 255
            val r = opaque(Color.red(color)); val g = opaque(Color.green(color)); val b = opaque(Color.blue(color))
            root.setBackgroundColor(Color.rgb(r, g, b))
            val lightBackground = 0.2126 * r + 0.7152 * g + 0.0722 * b > 127.5
            if (Build.VERSION.SDK_INT >= 30) {
                val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                window.insetsController?.setSystemBarsAppearance(if (lightBackground) mask else 0, mask)
            } else {
                val mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                val flags = window.decorView.systemUiVisibility
                window.decorView.systemUiVisibility = if (lightBackground) flags or mask else flags and mask.inv()
            }
        }
        root.addView(content, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        content.load(initialPage())
    }

    @Deprecated("Android invokes this callback for system back; AnseronUI handles it before Activity navigation")
    override fun onBackPressed() {
        if (content.handleBackPress()) return
        if (content.pop()) return
        super.onBackPressed()
    }

    override fun onDestroy() { content.destroy(); super.onDestroy() }

    private fun initialPage(): String = runCatching {
        val json = assets.open("core.manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        json.getJSONArray("pages").getJSONObject(0).getString("name").ifBlank { "home" }
    }.getOrDefault("home")
}

