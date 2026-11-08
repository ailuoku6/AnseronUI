package org.anseronui.render

import org.json.JSONArray

/** Every JNI call runs on the fixed AndroidHost owner thread. */
class NativeCore : AndroidCoreTransport {
    override val bundleBuildId = "anseronui-demo"
    override val runtimeEpoch = 1L
    private var handle = nativeOpen()
    init { check(handle != 0L) { "Unable to create native Core" } }
    override fun post(input: ByteArray) = nativePost(handle, input)
    override fun step(maxMessages: Int): List<ByteArray> {
        require(maxMessages > 0)
        val output = JSONArray(String(nativeStep(handle), Charsets.UTF_8))
        return (0 until output.length()).map { output.getJSONObject(it).toString().toByteArray(Charsets.UTF_8) }
    }
    override fun hasPendingWork() = nativePending(handle)
    override fun dispose() { if (handle != 0L) { val old = handle; handle = 0; nativeClose(old) } }
    private external fun nativeOpen(): Long
    private external fun nativePost(handle: Long, bytes: ByteArray)
    private external fun nativeStep(handle: Long): ByteArray
    private external fun nativePending(handle: Long): Boolean
    private external fun nativeClose(handle: Long)
    companion object { init { System.loadLibrary("anseronui") } }
}
