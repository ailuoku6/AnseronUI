package org.anseronui.device

import android.content.Context
import android.os.Build
import org.anseronui.render.AndroidPlatformExtensions
import org.json.JSONObject

object DevicePlugin {
    fun createExtensions(context: Context): AndroidPlatformExtensions = AndroidPlatformExtensions(
        modules = mapOf("example.device" to { method, _, complete ->
            require(method == "info") { "UNSUPPORTED_METHOD: $method" }
            complete(Result.success(JSONObject().put("platform", "Android").put("version", Build.VERSION.RELEASE)))
            null
        })
    )
}
