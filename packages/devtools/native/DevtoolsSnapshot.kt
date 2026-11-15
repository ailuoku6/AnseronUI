package org.anseronui.devtools

import org.json.JSONObject

/** Platform-neutral native snapshot encoder. The caller owns transport and lifecycle. */
class AnseronUIDevtoolsReporter(
    private val pagerId: String,
    private val platform: String,
    private val sink: (String) -> Unit,
) {
    private var sequence = 0L

    init { require(pagerId.isNotBlank() && platform.isNotBlank()) }

    @Synchronized
    fun snapshot(page: String, stats: JSONObject = JSONObject(), diagnostics: List<JSONObject> = emptyList()) {
        val values = JSONObject()
            .put("protocol", 1)
            .put("type", "snapshot")
            .put("pagerId", pagerId)
            .put("page", page)
            .put("platform", platform)
            .put("ts", System.currentTimeMillis())
            .put("seq", ++sequence)
            .put("stats", stats)
            .put("diagnostics", diagnostics)
        sink(values.toString())
    }
}
