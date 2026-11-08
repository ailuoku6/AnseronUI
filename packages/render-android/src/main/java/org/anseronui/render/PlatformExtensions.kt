package org.anseronui.render

import android.content.Context
import android.view.View
import android.view.ViewGroup
import org.json.JSONObject
import org.json.JSONTokener

/** Main-thread entry; implementations may complete on any thread and return a cancellation action. */
typealias NativeCompletion = (Result<Any?>) -> Unit
typealias NativeModuleHandler = (method: String, args: Any?, complete: NativeCompletion) -> (() -> Unit)?
interface AndroidNativeComponent {
    val view: View
    val contentView: ViewGroup? get() = null
    fun setProps(props: JSONObject)
    fun invoke(method: String, args: Any?, complete: NativeCompletion): (() -> Unit)? = error("UNSUPPORTED_VIEW_METHOD: $method")
    fun dispose() {}
}
typealias NativeComponentFactory = (context: Context, emit: (String, Any?) -> Unit) -> AndroidNativeComponent
class AndroidPlatformExtensions(
    val modules: Map<String, NativeModuleHandler> = emptyMap(),
    val components: Map<String, NativeComponentFactory> = emptyMap()
)
internal fun decodeNativeJSON(value: String): Any? = JSONTokener(value).nextValue().let { if (it === JSONObject.NULL) null else it }
internal fun encodeNativeJSON(value: Any?): String {
    val wrapped = JSONObject.wrap(value) ?: JSONObject.NULL
    val encoded = if (wrapped is String) JSONObject.quote(wrapped) else wrapped.toString()
    require(encoded.toByteArray(Charsets.UTF_8).size <= 65536) { "MODULE_RESULT_TOO_LARGE" }
    return encoded
}
