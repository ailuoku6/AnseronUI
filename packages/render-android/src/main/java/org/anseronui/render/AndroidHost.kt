package org.anseronui.render

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.nio.charset.CodingErrorAction
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Implemented by the compiled Core binding. Every method runs on one owner thread. */
interface AndroidCoreTransport {
    val bundleBuildId: String
    val runtimeEpoch: Long
    fun post(input: ByteArray)
    fun step(maxMessages: Int): List<ByteArray>
    fun hasPendingWork(): Boolean
    fun dispose()
}

/** Serializes Core calls on a fixed thread and applies view work on the main thread. */
class AndroidHost(
    root: FrameLayout,
    private val createCore: () -> AndroidCoreTransport,
    private val baseUrl: URL? = null,
    private val onReady: () -> Unit = {},
    private val onDiagnostic: (String, String) -> Unit = { _, _ -> },
    private val onFailure: (Throwable) -> Unit = {},
    private val extensions: AndroidPlatformExtensions = AndroidPlatformExtensions(),
    private val router: ((method: String, args: Any?) -> Any?)? = null
) {
    private val ui = Handler(Looper.getMainLooper())
    private val thread = HandlerThread("AnseronUICore").apply { start() }
    private val owner = Handler(thread.looper)
    private val network = Executors.newSingleThreadExecutor()
    val renderer = AndroidRenderer(root, extensions) { event ->
        enqueue {
            val payload = JSONObject().put("type", event.type).put("nodeId", event.nodeId).put("revision", event.revision)
            if (event.type == "InputChange") payload.put("value", event.value).put("inputRevision", event.inputRevision)
            if (event.type == "NativeEvent") {
                payload.put("event", event.event)
                event.value?.let { payload.put("value", it) }
                event.x?.let { payload.put("x", it) }; event.y?.let { payload.put("y", it) }
                event.contentWidth?.let { payload.put("contentWidth", it) }; event.contentHeight?.let { payload.put("contentHeight", it) }
                event.source?.let { payload.put("source", it) }; event.state?.let { payload.put("state", it) }
                event.duration?.let { payload.put("duration", it) }; event.errorCode?.let { payload.put("errorCode", it) }
                event.pageX?.let { payload.put("pageX", it) }; event.pageY?.let { payload.put("pageY", it) }; event.pointerId?.let { payload.put("pointerId", it) }
                event.touches?.let { points -> payload.put("touches", JSONArray().also { array -> points.forEach { point -> array.put(JSONObject().put("x", point.x).put("y", point.y).put("pageX", point.pageX).put("pageY", point.pageY).put("pointerId", point.pointerId)) } }) }
                event.targetId?.let { payload.put("targetId", it) }
            }
            send(payload)
        }
    }
    private var core: AndroidCoreTransport? = null
    private var started = false
    private var ready = false
    private var pendingPage = ""
    private var pendingWidth = 0.0
    private var pendingHeight = 0.0
    @Volatile private var closed = false
    private var inputSequence = 0L
    private var outputSequence = 0L
    private val extensionRequests = mutableMapOf<Long, () -> Unit>() // main thread only
    private val requests = mutableMapOf<Long, () -> Unit>()
    private val surfaceId = 1L
    private val generation = 1L
    // Optional renderer nodes must not prevent loading pages from a basic-node Core.
    private val requiredNodes = listOf("View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video")
    @Volatile private var backWaiter: ((Boolean) -> Unit)? = null

    init { require(Looper.myLooper() == Looper.getMainLooper()) { "Create the host on the UI thread" } }

    fun start(page: String, width: Float, height: Float) {
        require(!started && !closed && page.isNotBlank() && width.isFinite() && width >= 0 && height.isFinite() && height >= 0)
        started = true
        pendingPage = page
        pendingWidth = width.toDouble()
        pendingHeight = height.toDouble()
        enqueue {
            core = createCore().also {
                require(it.bundleBuildId.isNotEmpty() && it.bundleBuildId.length <= 128 && it.runtimeEpoch in 1..0xffffffffL)
            }
            send(JSONObject().put("type", "Handshake").put("requiredNodes", JSONArray(requiredNodes)))
        }
    }

    fun resize(width: Float, height: Float) {
        require(started && width.isFinite() && width >= 0 && height.isFinite() && height >= 0)
        if (closed) return
        enqueue { if (core != null) send(JSONObject().put("type", "Resize").put("width", width.toDouble()).put("height", height.toDouble())) }
    }

    /** Call after an out-of-band Core wake; no Core entry occurs on this calling thread. */
    fun wake() { enqueue {} }

    /** Synchronously asks Core whether the current TSX page consumed system back. */
    fun handleBackPress(): Boolean {
        if (closed || !started || Looper.myLooper() == thread.looper) return false
        val latch = CountDownLatch(1)
        val consumed = AtomicBoolean(false)
        owner.post {
            if (closed || core == null) { latch.countDown(); return@post }
            backWaiter = { value -> consumed.set(value); latch.countDown() }
            try { send(JSONObject().put("type", "BackPress")); drain() }
            catch (error: Throwable) { backWaiter = null; ui.post { onFailure(error) }; latch.countDown(); finish() }
        }
        latch.await(750, TimeUnit.MILLISECONDS)
        backWaiter = null
        return consumed.get()
    }

    fun destroy() {
        if (closed) return
        if (!started) { enqueue { finish() }; return }
        enqueue { if (core != null) send(JSONObject().put("type", "DestroySurface")) else finish() }
    }

    private fun enqueue(action: () -> Unit) {
        if (closed) return
        owner.post {
            if (closed) return@post
            try { action(); drain() }
            catch (error: Throwable) { ui.post { onFailure(error) }; finish() }
        }
    }

    private fun send(payload: JSONObject) {
        val runtime = core ?: error("Core not initialized")
        require(inputSequence < 0xffffffffL) { "Input sequence overflow" }
        val envelope = JSONObject()
            .put("protocolMajor", 1).put("protocolMinor", 0)
            .put("bundleBuildId", runtime.bundleBuildId).put("runtimeEpoch", runtime.runtimeEpoch)
            .put("surfaceId", surfaceId).put("surfaceGeneration", generation)
            .put("sequence", ++inputSequence).put("ackSequence", outputSequence).put("payload", payload)
        val bytes = envelope.toString().toByteArray(StandardCharsets.UTF_8)
        require(bytes.size <= 1_048_576) { "Input message too large" }
        runtime.post(bytes)
    }

    private fun drain() {
        val runtime = core ?: return
        repeat(32) {
            val output = runtime.step(64)
            if (output.isEmpty()) {
                if (runtime.hasPendingWork()) owner.post { enqueue {} }
                return
            }
            for (bytes in output) handle(bytes)
        }
        if (runtime.hasPendingWork()) owner.post { enqueue {} }
    }

    private fun handle(bytes: ByteArray) {
        require(bytes.size <= 1_048_576) { "Output message too large" }
        val envelope = JSONObject(String(bytes, StandardCharsets.UTF_8))
        val runtime = core ?: error("Core disposed")
        require(envelope.getInt("protocolMajor") == 1 && envelope.getInt("protocolMinor") >= 0)
        require(envelope.getString("bundleBuildId") == runtime.bundleBuildId)
        require(envelope.getLong("runtimeEpoch") == runtime.runtimeEpoch)
        require(envelope.getLong("surfaceId") == surfaceId && envelope.getLong("surfaceGeneration") == generation)
        require(envelope.getLong("sequence") == outputSequence + 1 && outputSequence < 0xffffffffL)
        require(envelope.getLong("ackSequence") in 0..inputSequence)
        outputSequence++
        val payload = envelope.getJSONObject("payload")
        when (payload.getString("type")) {
            "Ready" -> {
                require(!ready && (0 until payload.getJSONArray("supportedNodes").length()).map { payload.getJSONArray("supportedNodes").getString(it) }
                    .containsAll(requiredNodes))
                ready = true
                send(JSONObject().put("type", "CreateSurface").put("page", pendingPage).put("width", pendingWidth).put("height", pendingHeight))
                ui.post { onReady() }
            }
            "Commit" -> ui.post {
                try {
                    renderer.applyJson(payload.toString())
                    enqueue { send(JSONObject().put("type", "CommitAck").put("revision", payload.getLong("revision"))) }
                } catch (error: Throwable) {
                    enqueue { send(JSONObject().put("type", "CommitFailed").put("revision", payload.getLong("revision")).put("reason", error.toString().take(4096))) }
                }
            }
            "MeasureRequest" -> ui.post {
                try {
                    val size = renderer.measure(payload.getString("kind"), payload.getString("text"), payload.getDouble("fontSize").toFloat(), payload.getDouble("maxWidth").toFloat(), payload.optJSONObject("props"))
                    enqueue {
                        send(JSONObject().put("type", "MeasureResult").put("requestId", payload.getLong("requestId"))
                            .put("nodeId", payload.getLong("nodeId")).put("width", size.width.toDouble())
                            .put("height", size.height.toDouble()).put("baseline", size.baseline.toDouble()))
                    }
                } catch (error: Throwable) { enqueue { throw error } }
            }
            "InvokeModule" -> invoke(payload)
            "CancelRequest" -> {
                requests.remove(payload.getLong("requestId"))?.invoke()
                ui.post { extensionRequests.remove(payload.getLong("requestId"))?.invoke() }
            }
            "BackPressResult" -> backWaiter?.invoke(payload.getBoolean("consumed"))
            "Diagnostic" -> {
                ui.post { onDiagnostic(payload.getString("code"), payload.getString("message")) }
                if (!ready) finish()
            }
            "SurfaceDisposed" -> finish()
            else -> error("Unknown Core output: "+ payload.getString("type"))
        }
    }

    private fun invoke(payload: JSONObject) {
        val id = payload.getLong("requestId")
        require(id in 1..0xffffffffL && !requests.containsKey(id))
        when (payload.getString("module") to payload.getString("method")) {
            "timer" to "sleep" -> {
                val delay = payload.getString("argument").toLong()
                require(delay in 0..2_147_483_647L)
                val task = Runnable { complete(id, true, "") }
                owner.postDelayed(task, delay)
                requests[id] = { owner.removeCallbacks(task) }
            }
            "http" to "getText" -> {
                var connection: HttpURLConnection? = null
                val task: Future<*> = network.submit {
                    try {
                        val url = if (baseUrl == null) URL(payload.getString("argument")) else URL(baseUrl, payload.getString("argument"))
                        connection = (url.openConnection() as HttpURLConnection).apply { connectTimeout = 10_000; readTimeout = 10_000 }
                        val response = connection!!
                        if (response.responseCode !in 200..299) error("HTTP "+response.responseCode)
                        val bytes = response.inputStream.use { input ->
                            val buffer = ByteArray(8192)
                            val output = ByteArrayOutputStream()
                            while (output.size() <= 65_536) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                output.write(buffer, 0, count)
                            }
                            output.toByteArray()
                        }
                        require(bytes.size <= 65_536) { "Response too large" }
                        val value = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString()
                        owner.post { complete(id, true, value) }
                    } catch (error: Throwable) { owner.post { complete(id, false, error.toString()) } }
                    finally { connection?.disconnect() }
                }
                requests[id] = { task.cancel(true); connection?.disconnect() }
            }
            else -> { ui.post { invokeExtension(payload) }; return }
        }
    }

    private fun invokeExtension(payload: JSONObject) {
        if (closed) return
        val id = payload.getLong("requestId")
        extensionRequests[id] = {}
        val completion: NativeCompletion = { result ->
            ui.post {
                if (!closed && extensionRequests.remove(id) != null) {
                    val encoded = result.mapCatching { encodeNativeJSON(it) }
                    enqueue { send(JSONObject().put("type", "ModuleResult").put("requestId", id)
                        .put("ok", encoded.isSuccess).put("value", encoded.getOrElse { it.toString().take(4096) })) }
                }
            }
        }
        try {
            val module = payload.getString("module"); val method = payload.getString("method")
            val args = decodeNativeJSON(payload.getString("argument"))
            val cancel = if (module == "__view") {
                val request = args as JSONObject
                renderer.invoke(request.getLong("nodeId"), method, request.opt("args"), completion)
            } else if (module == "router") {
                val result = router?.invoke(method, args) as? AndroidRouteResult ?: error("ROUTER_UNAVAILABLE")
                completion(Result.success(result.value))
                result.navigate?.let { ui.post(it) }
                null
            } else {
                val handler = extensions.modules[module] ?: error("UNSUPPORTED_MODULE: $module")
                handler(method, args, completion)
            }
            if (extensionRequests.containsKey(id)) extensionRequests[id] = cancel ?: {}
        } catch (error: Throwable) { completion(Result.failure(error)) }
    }

    private fun complete(id: Long, ok: Boolean, value: String) {
        if (closed || requests.remove(id) == null) return
        enqueue { send(JSONObject().put("type", "ModuleResult").put("requestId", id).put("ok", ok).put("value", value.take(65_536))) }
    }

    private fun finish() {
        if (closed) return
        closed = true
        requests.values.forEach { it() }
        requests.clear()
        network.shutdownNow()
        core?.dispose()
        core = null
        ui.post {
            val cancellations = extensionRequests.values.toList(); extensionRequests.clear()
            cancellations.forEach { it() }
            renderer.clear()
        }
        thread.quitSafely()
    }
}
