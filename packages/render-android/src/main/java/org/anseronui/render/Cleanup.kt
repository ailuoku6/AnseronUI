package org.anseronui.render

/** Terminal cleanup must keep releasing resources after a platform/plugin failure. */
internal fun cleanup(action: () -> Unit) {
    try { action() } catch (error: Throwable) {
        android.util.Log.e("AnseronUI", "Resource cleanup failed", error)
    }
}
