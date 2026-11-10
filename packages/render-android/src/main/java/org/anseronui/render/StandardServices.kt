package org.anseronui.render

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.app.Fragment
import android.content.*
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Rect
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.*
import android.os.*
import android.provider.OpenableColumns
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.view.View
import android.view.inputmethod.InputMethodManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.Future
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Application owners forward launch/new-intent URLs using [receive]. */
object AnseronUILinks {
    var initialURL: String? = null
    internal val listeners = mutableSetOf<(String) -> Unit>()
    fun receive(intent: Intent?) { intent?.dataString?.let { url -> if (initialURL == null) initialURL = url; listeners.toList().forEach { it(url) } } }
}

/** Framework-owned result fragment avoids requiring Activity subclass overrides. */
class ServiceResultFragment : Fragment() {
    private var nextCode = 3000
    private val results = mutableMapOf<Int, (Int, Intent?) -> Unit>()
    private val permissions = mutableMapOf<Int, (IntArray) -> Unit>()
    fun pick(intent: Intent, callback: (Int, Intent?) -> Unit): () -> Unit {
        val code = nextCode++; results[code] = callback
        try { startActivityForResult(intent, code) } catch (error: Throwable) { results.remove(code); throw error }
        return { results.remove(code); Unit }
    }
    fun permission(names: Array<String>, callback: (IntArray) -> Unit): () -> Unit {
        val code = nextCode++; permissions[code] = callback; requestPermissions(names, code)
        return { permissions.remove(code); Unit }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) { results.remove(requestCode)?.invoke(resultCode, data) }
    override fun onRequestPermissionsResult(requestCode: Int, names: Array<out String>, grantResults: IntArray) { permissions.remove(requestCode)?.invoke(grantResults) }
    override fun onDestroy() { results.clear(); permissions.clear(); super.onDestroy() }
}

/** Shares only files explicitly registered by a service instance. */
class AnseronUIFileProvider : ContentProvider() {
    companion object {
        internal val files = java.util.concurrent.ConcurrentHashMap<String, Pair<File, String>>()
        internal fun register(context: Context, file: File, name: String): Uri { val id = UUID.randomUUID().toString(); files[id] = file to name; return Uri.parse("content://${context.packageName}.anseronui.files/$id") }
    }
    override fun onCreate() = true
    override fun getType(uri: Uri): String = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(files[uri.lastPathSegment]?.second?.substringAfterLast('.', "")) ?: "application/octet-stream"
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor { require(mode == "r"); val file = files[uri.lastPathSegment]?.first ?: throw java.io.FileNotFoundException(); return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY) }
    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val item = files[uri.lastPathSegment] ?: throw java.io.FileNotFoundException(); val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns).apply { addRow(columns.map { if (it == OpenableColumns.DISPLAY_NAME) item.second else if (it == OpenableColumns.SIZE) item.first.length() else null }.toTypedArray()) }
    }
    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
}

internal class StandardServices(private val root: View, private val baseUrl: URL?, private val sources: Map<String, NativeEventSource> = emptyMap()) {
    private val context = root.context
    private val application = ApplicationServices(context.applicationContext)
    private val radio = RadioServices(context, { activity }, { fragment() })
    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()
    private val activity: Activity? get() { var current: Context = context; while (current is ContextWrapper) { if (current is Activity) return current; current = current.baseContext }; return null }
    private data class Stream(val module: String, val queue: java.util.ArrayDeque<Any> = java.util.ArrayDeque(), var value: Any? = null, var waiting: NativeCompletion? = null, val stops: MutableList<() -> Unit> = mutableListOf(), var last: String? = null)
    private val streams = mutableMapOf<String, Stream>()
    private val files = mutableMapOf<String, Pair<File, String>>()
    private data class Transfer(var connection: HttpURLConnection? = null, var future: Future<*>? = null, @Volatile var cancelled: Boolean = false)
    private val tasks = java.util.concurrent.ConcurrentHashMap<String, Transfer>()
    private val cancellations = mutableSetOf<() -> Unit>()
    private var disposed = false
    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private fun error(code: String): Nothing = throw IllegalStateException(code)
    private fun methods(module: String): List<String> {
        val extra = application.methods(module) + radio.methods(module)
        if (extra.isNotEmpty()) return extra
        return when (module) {
        "http" -> listOf("request", "getText")
        "storage", "secureStorage" -> listOf("get", "set", "remove", "keys", "clear")
        "app", "device", "locale" -> listOf("getInfo")
        "clipboard" -> listOf("readText", "writeText")
        "dialogs" -> listOf("alert", "confirm", "actionSheet")
        "linking" -> listOf("openURL", "canOpenURL", "openSettings", "getInitialURL", "subscribe")
        "share" -> listOf("text", "file")
        "haptics" -> listOf("impact", "notification", "selection")
        "appState", "appearance" -> listOf("get", "subscribe")
        "network" -> listOf("getStatus", "subscribe")
        "window" -> listOf("getMetrics", "subscribe")
        "keyboard" -> listOf("dismiss", "subscribe")
        "permissions" -> listOf("check", "request")
        "location" -> listOf("getCurrentPosition", "watchPosition", "subscribe")
        "media" -> listOf("pickPhoto")
        "files" -> listOf("pickDocument", "release")
        "transfers" -> listOf("download", "upload", "cancel", "subscribe")
        "capabilities" -> listOf("has")
        else -> if (sources.containsKey(module)) listOf("subscribe") else emptyList()
    }
    }
    fun handles(module: String, method: String) = module == "events" || methods(module).contains(method)
    private fun metrics(): JSONObject {
        val density = context.resources.displayMetrics.density
        val inset = root.rootWindowInsets?.systemWindowInsetTop ?: 0
        return JSONObject().put("width", root.width / density).put("height", root.height / density).put("scale", density)
            .put("safeArea", JSONObject().put("top", inset / density).put("bottom", (root.rootWindowInsets?.systemWindowInsetBottom ?: 0) / density).put("left", (root.rootWindowInsets?.systemWindowInsetLeft ?: 0) / density).put("right", (root.rootWindowInsets?.systemWindowInsetRight ?: 0) / density))
    }
    private fun appearance() = if (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
    private fun appState() = if (root.hasWindowFocus()) "active" else "background"
    private fun network(): JSONObject {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val caps = manager.getNetworkCapabilities(manager.activeNetwork)
        return JSONObject().put("connected", caps?.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
            .put("type", when { caps == null -> "none"; caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"; caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"; else -> "unknown" })
    }
    private fun emit(module: String, value: Any?) { if (!disposed) streams.values.filter { it.module == module }.forEach { deliver(it, value) } }
    private fun deliver(stream: Stream, value: Any?) {
        if (stream.module == "bluetooth") {
            val waiting = stream.waiting
            if (waiting != null) { stream.waiting = null; waiting(Result.success(value)) }
            else if (stream.queue.size < 64) stream.queue.addLast(value ?: JSONObject.NULL)
            else stream.value = IllegalStateException("IO_ERROR: Bluetooth event queue overflow")
            return
        }
        val encoded = value.toString(); if (stream.last == encoded) return; stream.last = encoded
        val waiting = stream.waiting; if (waiting != null) { stream.waiting = null; waiting(Result.success(value)) } else stream.value = value
    }
    private fun close(id: String) { streams.remove(id)?.stops?.toList()?.forEach { it() } }
    private fun next(args: JSONObject, complete: NativeCompletion): () -> Unit {
        val id = args.getString("id"); val module = args.getString("module")
        require(methods(module).contains("subscribe")) { "UNSUPPORTED: $module.subscribe" }
        val stream = streams[id] ?: Stream(module).also { stream ->
            streams[id] = stream
            sources[module]?.let { source ->
                try { source { result -> ui.post {
                    if (streams[id] === stream) {
                        val waiting = stream.waiting
                        if (waiting != null) { stream.waiting = null; waiting(result); if (result.isFailure) close(id) }
                        else stream.value = result.getOrElse { it }
                    }
                } }?.let { stream.stops.add(it) } }
                catch (error: Throwable) { close(id); throw error }
            }
            if (module == "bluetooth") stream.stops.add(radio.listen { if (streams[id] === stream) deliver(stream, it) })
            when (module) {
                "window", "appearance", "keyboard" -> {
                    val update = android.view.ViewTreeObserver.OnGlobalLayoutListener {
                        when (module) {
                            "window" -> emit(module, metrics())
                            "appearance" -> emit(module, appearance())
                            else -> { val rect = Rect(); root.getWindowVisibleDisplayFrame(rect); val height = (root.rootView.height - rect.bottom).coerceAtLeast(0) / context.resources.displayMetrics.density; emit(module, JSONObject().put("visible", height > 100).put("height", if (height > 100) height else 0)) }
                        }
                    }
                    root.viewTreeObserver.addOnGlobalLayoutListener(update); stream.stops.add { if (root.viewTreeObserver.isAlive) root.viewTreeObserver.removeOnGlobalLayoutListener(update) }
                    stream.value = if (module == "window") metrics() else if (module == "appearance") appearance() else JSONObject().put("visible", false).put("height", 0)
                }
                "appState" -> {
                    val app = context.applicationContext as Application
                    val callback = object : Application.ActivityLifecycleCallbacks {
                        override fun onActivityResumed(a: Activity) { if (a == activity) emit(module, "active") }
                        override fun onActivityPaused(a: Activity) { if (a == activity) emit(module, "background") }
                        override fun onActivityCreated(a: Activity, state: Bundle?) {}; override fun onActivityStarted(a: Activity) {}; override fun onActivityStopped(a: Activity) {}; override fun onActivitySaveInstanceState(a: Activity, state: Bundle) {}; override fun onActivityDestroyed(a: Activity) {}
                    }; app.registerActivityLifecycleCallbacks(callback); stream.stops.add { app.unregisterActivityLifecycleCallbacks(callback) }; stream.value = appState()
                }
                "network" -> {
                    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
                    val callback = object : android.net.ConnectivityManager.NetworkCallback() {
                        override fun onAvailable(n: android.net.Network) { ui.post { emit(module, network()) } }
                        override fun onLost(n: android.net.Network) { ui.post { emit(module, network()) } }
                        override fun onCapabilitiesChanged(n: android.net.Network, caps: android.net.NetworkCapabilities) { ui.post { emit(module, network()) } }
                    }; manager.registerDefaultNetworkCallback(callback); stream.stops.add { manager.unregisterNetworkCallback(callback) }; stream.value = network()
                }
                "linking" -> { val listener: (String) -> Unit = { emit(module, it) }; AnseronUILinks.listeners.add(listener); stream.stops.add { AnseronUILinks.listeners.remove(listener); Unit } }
                "location" -> { try { stream.stops.add(watchLocation { result -> result.fold({ emit(module, it) }, { error -> streams.values.filter { it.module == module }.forEach { it.waiting?.invoke(Result.failure(error)); it.waiting = null }; close(id) }) }) } catch (error: Throwable) { close(id); throw error } }
            }
        }
        require(stream.module == module && stream.waiting == null) { "INVALID_ARGUMENT: subscription" }
        if (stream.value is Throwable) { val error = stream.value as Throwable; close(id); complete(Result.failure(error)) }
        else if (stream.queue.isNotEmpty()) complete(Result.success(stream.queue.removeFirst()))
        else if (stream.value != null) { val value = stream.value; stream.value = null; stream.last = value.toString(); if (value is Throwable) { close(id); complete(Result.failure(value)) } else complete(Result.success(value)) } else stream.waiting = complete
        return { close(id) }
    }
    fun invoke(module: String, method: String, raw: Any?, complete: NativeCompletion): (() -> Unit)? {
        check(!disposed) { "CANCELLED" }; val args = raw as? JSONObject ?: JSONObject()
        fun done(value: Any? = null): (() -> Unit)? { complete(Result.success(value)); return null }
        if (module == "events") { if (method == "next") return next(args, complete); if (method == "close") { close(args.getString("id")); return done() }; error("UNSUPPORTED") }
        if (module == "capabilities") { val list = methods(args.getString("module")); return done(if (args.has("method")) list.contains(args.getString("method")) else list.isNotEmpty()) }
        require(methods(module).contains(method)) { "UNSUPPORTED: $module.$method" }
        if (application.methods(module).isNotEmpty()) return application.invoke(module, method, args, complete)
        if (radio.methods(module).isNotEmpty()) return radio.invoke(module, method, args, complete)
        when (module) {
            "storage", "secureStorage" -> return done(storage(module, method, args))
            "app" -> { val info = context.packageManager.getPackageInfo(context.packageName, 0); return done(JSONObject().put("name", context.applicationInfo.loadLabel(context.packageManager).toString()).put("version", info.versionName ?: "").put("build", if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else info.versionCode.toString()).put("applicationId", context.packageName)) }
            "device" -> return done(JSONObject().put("platform", "Android").put("version", Build.VERSION.RELEASE).put("model", Build.MODEL))
            "locale" -> return done(JSONObject().put("language", Locale.getDefault().toLanguageTag()).put("timezone", TimeZone.getDefault().id))
            "clipboard" -> { val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager; if (method == "readText") return done(manager.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString() ?: ""); manager.setPrimaryClip(ClipData.newPlainText("AnseronUI", args.getString("text"))); return done() }
            "dialogs" -> {
                val a = activity ?: error("UNSUPPORTED: Activity required"); val builder = AlertDialog.Builder(a).setTitle(args.optString("title")).setMessage(args.optString("message"))
                var settled = false
                val finish: (Any?) -> Unit = { if (!settled) { settled = true; complete(Result.success(it)) } }
                if (method == "actionSheet") { builder.setMessage(null); val options = args.getJSONArray("options"); builder.setItems(Array(options.length()) { options.getString(it) }) { _, index -> finish(index) } }
                else builder.setPositiveButton("确定") { _, _ -> finish(if (method == "confirm") true else null) }
                if (method != "alert") builder.setNegativeButton("取消") { _, _ -> finish(if (method == "confirm") false else null) }
                val dialog = builder.create(); dialog.setOnCancelListener { finish(if (method == "confirm") false else null) }; dialog.show()
                return tracked { settled = true; dialog.dismiss() }
            }
            "linking" -> {
                if (method == "getInitialURL") return done(AnseronUILinks.initialURL)
                val intent = if (method == "openSettings") Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")) else {
                    val uri = Uri.parse(args.getString("url")); require(uri.scheme != null && uri.scheme!!.lowercase() !in listOf("javascript", "data", "file", "content", "intent")) { "INVALID_ARGUMENT: URL" }; Intent(Intent.ACTION_VIEW, uri)
                }
                if (method == "canOpenURL") return done(intent.resolveActivity(context.packageManager) != null)
                context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return done()
            }
            "share" -> {
                val intent = Intent(Intent.ACTION_SEND)
                if (method == "text") { intent.type = "text/plain"; intent.putExtra(Intent.EXTRA_TEXT, args.getString("text")) }
                else { val item = file(args); val uri = AnseronUIFileProvider.register(context, item.first, item.second); intent.type = context.contentResolver.getType(uri); intent.putExtra(Intent.EXTRA_STREAM, uri); intent.clipData = ClipData.newRawUri(item.second, uri); intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                context.startActivity(Intent.createChooser(intent, "分享").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return done(JSONObject().put("status", "unknown"))
            }
            "haptics" -> { val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator; if (!vibrator.hasVibrator()) error("UNSUPPORTED: haptics"); vibrator.vibrate(VibrationEffect.createOneShot(if (method == "selection") 5 else if (args.optString("style") == "heavy") 30 else 15, VibrationEffect.DEFAULT_AMPLITUDE)); return done() }
            "appState" -> return done(appState())
            "appearance" -> return done(appearance())
            "window" -> return done(metrics())
            "network" -> return done(network())
            "keyboard" -> { (context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(root.windowToken, 0); root.clearFocus(); return done() }
            "permissions" -> {
                val name = args.getString("permission"); val names = permissionNames(name); if (names.isEmpty()) return done(if (name == "notifications" && Build.VERSION.SDK_INT < 33) "granted" else "unsupported")
                val status = permissionStatus(name); if (method == "check" || status == "granted") return done(status)
                val requested = context.getSharedPreferences("anseronui.permissions", Context.MODE_PRIVATE); requested.edit().putBoolean(name, true).apply()
                return tracked(fragment().permission(names) { complete(Result.success(permissionStatus(name))) })
            }
            "location" -> {
                var stop: (() -> Unit)? = null; var settled = false
                val finish: (Result<Any?>) -> Unit = { if (!settled) { settled = true; stop?.invoke(); complete(it) } }
                stop = watchLocation(finish); val timeout = Runnable { finish(Result.failure(IllegalStateException("TIMEOUT"))) }; ui.postDelayed(timeout, 15000)
                return tracked { settled = true; ui.removeCallbacks(timeout); stop?.invoke() }
            }
            "media", "files" -> {
                if (method == "release") { val item = files.remove(args.getJSONObject("file").getString("id")); item?.first?.delete(); AnseronUIFileProvider.files.entries.removeIf { it.value.first == item?.first }; return done() }
                var cancelled = false
                val cancel = fragment().pick(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type = if (module == "media") "image/*" else "*/*"; addCategory(Intent.CATEGORY_OPENABLE) }) { result, intent ->
                    val uri = intent?.data; if (result != Activity.RESULT_OK || uri == null) complete(Result.success(null))
                    else io.submit {
                        try {
                            var name = "document"; context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) name = it.getString(0) }
                            val target = File.createTempFile("anseronui-", ".file", context.cacheDir)
                            try { context.contentResolver.openInputStream(uri)!!.use { input -> target.outputStream().use { input.copyTo(it) } }; ui.post { if (disposed || cancelled) target.delete() else complete(Result.success(remember(target, name, context.contentResolver.getType(uri) ?: "application/octet-stream"))) } }
                            catch (error: Throwable) { target.delete(); throw error }
                        } catch (error: Throwable) { ui.post { if (!disposed) complete(Result.failure(error)) } }
                    }
                }; return tracked { cancelled = true; cancel() }
            }
            "http", "transfers" -> return transfer(module, method, args, complete)
        }
        error("UNSUPPORTED")
    }
    private fun tracked(action: () -> Unit): () -> Unit { lateinit var stop: () -> Unit; stop = { cancellations.remove(stop); action() }; cancellations.add(stop); return stop }
    private fun fragment(): ServiceResultFragment {
        val a = activity ?: error("UNSUPPORTED: Activity required"); val manager = a.fragmentManager
        return manager.findFragmentByTag("anseronui.results") as? ServiceResultFragment ?: ServiceResultFragment().also { manager.beginTransaction().add(it, "anseronui.results").commitAllowingStateLoss(); manager.executePendingTransactions() }
    }
    private fun permissionNames(name: String): Array<String> = when (name) {
        "location" -> arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)
        "camera" -> arrayOf(Manifest.permission.CAMERA)
        "microphone" -> arrayOf(Manifest.permission.RECORD_AUDIO)
        "photos" -> if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.READ_MEDIA_IMAGES) else arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        "notifications" -> if (Build.VERSION.SDK_INT >= 33) arrayOf(Manifest.permission.POST_NOTIFICATIONS) else emptyArray()
        else -> emptyArray()
    }
    private fun permissionStatus(name: String): String {
        val names = permissionNames(name); if (names.isEmpty()) return if (name == "notifications" && Build.VERSION.SDK_INT < 33) "granted" else "unsupported"
        val granted = names.count { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
        if (granted == names.size || name == "location" && granted > 0) return "granted"
        if (name == "photos" && Build.VERSION.SDK_INT >= 34 && context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED) return "limited"
        return if (context.getSharedPreferences("anseronui.permissions", Context.MODE_PRIVATE).getBoolean(name, false)) "denied" else "prompt"
    }
    private fun watchLocation(complete: NativeCompletion): () -> Unit {
        if (permissionStatus("location") != "granted") error("PERMISSION_DENIED")
        val provider = if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) && context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
        if (!locationManager.isProviderEnabled(provider)) error("IO_ERROR: location disabled")
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) { complete(Result.success(JSONObject().put("latitude", location.latitude).put("longitude", location.longitude).put("accuracy", location.accuracy).put("timestamp", location.time))) }
            override fun onProviderDisabled(provider: String) { complete(Result.failure(IllegalStateException("IO_ERROR: location disabled"))) }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}; override fun onProviderEnabled(provider: String) {}
        }; locationManager.requestLocationUpdates(provider, 1000L, 1f, listener, Looper.getMainLooper()); return { locationManager.removeUpdates(listener) }
    }
    private fun storage(module: String, method: String, args: JSONObject): Any? {
        val prefs = context.getSharedPreferences("anseronui.$module", Context.MODE_PRIVATE); val prefix = Base64.encodeToString(args.optString("namespace", "default").toByteArray(), Base64.NO_WRAP) + ":"; val key = prefix + args.optString("key")
        val keys = prefs.all.keys.filter { it.startsWith(prefix) }
        if (method == "keys") return JSONArray(keys.map { it.removePrefix(prefix) }.sorted())
        if (method == "clear") { val edit = prefs.edit(); keys.forEach { edit.remove(it) }; check(edit.commit()) { "IO_ERROR: storage" }; return null }
        if (method == "remove") { check(prefs.edit().remove(key).commit()); return null }
        if (method == "set") {
            var value = args.getString("value")
            if (module == "secureStorage") { val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey()); value = Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP) }
            check(prefs.edit().putString(key, value).commit()) { "IO_ERROR: storage" }; return null
        }
        val value = prefs.getString(key, null) ?: return null
        if (module != "secureStorage") return value
        val bytes = Base64.decode(value, Base64.NO_WRAP); val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
    private fun secretKey(): SecretKey {
        val alias = context.packageName + ".anseronui.storage"; val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }; (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()) }.generateKey()
    }
    private fun remember(file: File, name: String, mime: String): JSONObject { val id = UUID.randomUUID().toString(); files[id] = file to name; return JSONObject().put("id", id).put("name", name).put("size", file.length()).put("mimeType", mime) }
    private fun file(args: JSONObject): Pair<File, String> = files[args.getJSONObject("file").getString("id")] ?: error("INVALID_ARGUMENT: file")
    private fun transfer(module: String, method: String, args: JSONObject, complete: NativeCompletion): (() -> Unit)? {
        if (method == "cancel") { tasks[args.getString("taskId")]?.let { it.cancelled = true; it.connection?.disconnect() }; complete(Result.success(null)); return null }
        val id = if (module == "transfers") args.getString("taskId") else UUID.randomUUID().toString(); require(id.isNotBlank() && !tasks.containsKey(id)) { "INVALID_ARGUMENT: duplicate taskId" }
        val url = if (baseUrl == null) URL(args.getString("url")) else URL(baseUrl, args.getString("url")); require(url.protocol in listOf("http", "https")) { "INVALID_ARGUMENT: URL" }
        val timeout = args.optLong("timeout", 30000); require(timeout in 1..Int.MAX_VALUE) { "INVALID_ARGUMENT: timeout" }
        val upload = if (method == "upload") file(args).first else null; val task = Transfer(); tasks[id] = task
        task.future = io.submit {
            var downloaded: File? = null
            try {
                if (task.cancelled) error("CANCELLED")
                val connection = (url.openConnection() as HttpURLConnection).also { task.connection = it }; connection.connectTimeout = timeout.toInt(); connection.readTimeout = timeout.toInt(); connection.requestMethod = if (upload != null) "POST" else args.optString("method", "GET")
                args.optJSONObject("headers")?.let { headers -> headers.keys().forEach { connection.setRequestProperty(it, headers.getString(it)) } }
                var lastProgress = 0L
                fun progress(count: Long, total: Long) { val now = SystemClock.elapsedRealtime(); if (count != total && now - lastProgress < 100) return; lastProgress = now; if (module == "transfers") ui.post { emit("transfers", JSONObject().put("taskId", id).put("transferred", count).put("total", total.coerceAtLeast(0))) } }
                if (upload != null) { connection.doOutput = true; connection.setFixedLengthStreamingMode(upload.length()); upload.inputStream().use { input -> connection.outputStream.use { output -> val buffer = ByteArray(32768); var count = 0L; while (true) { if (task.cancelled) error("CANCELLED"); val n = input.read(buffer); if (n < 0) break; output.write(buffer, 0, n); count += n; progress(count, upload.length()) } } } }
                else if (args.has("body")) { val body = args.getString("body").toByteArray(); connection.doOutput = true; connection.setFixedLengthStreamingMode(body.size); connection.outputStream.use { it.write(body) } }
                val status = connection.responseCode; if (method == "download" && status !in 200..299) error("IO_ERROR: HTTP $status")
                val headers = JSONObject(); connection.headerFields.forEach { (key, values) -> if (key != null) headers.put(key, values.joinToString(", ")) }
                val input = if (status >= 400) connection.errorStream else connection.inputStream
                val result: Any?
                if (method == "download") {
                    val target = File.createTempFile("anseronui-", ".download", context.cacheDir); downloaded = target
                    input?.use { source -> target.outputStream().use { output -> val buffer = ByteArray(32768); var count = 0L; while (true) { if (task.cancelled) error("CANCELLED"); val n = source.read(buffer); if (n < 0) break; output.write(buffer, 0, n); count += n; progress(count, connection.contentLengthLong) } } }
                    result = target
                } else {
                    val bytes = java.io.ByteArrayOutputStream(); input?.use { source -> val buffer = ByteArray(8192); while (true) { if (task.cancelled) error("CANCELLED"); val n = source.read(buffer); if (n < 0) break; if (bytes.size() + n > 48000) error("IO_ERROR: RESPONSE_TOO_LARGE"); bytes.write(buffer, 0, n) } }
                    result = JSONObject().put("status", status).put("headers", headers).put("body", bytes.toString("UTF-8"))
                }
                ui.post { tasks.remove(id, task); if (disposed || task.cancelled) { downloaded?.delete(); if (!disposed) complete(Result.failure(IllegalStateException("CANCELLED"))) } else complete(Result.success(if (result is File) remember(result, url.path.substringAfterLast('/').ifEmpty { "download" }, connection.contentType ?: "application/octet-stream") else result)) }
            } catch (error: Throwable) { downloaded?.delete(); ui.post { tasks.remove(id, task); if (!disposed) complete(Result.failure(if (task.cancelled) IllegalStateException("CANCELLED") else if (error is java.net.SocketTimeoutException) IllegalStateException("TIMEOUT") else error)) } }
            finally { task.connection?.disconnect() }
        }
        return { task.cancelled = true; task.connection?.disconnect(); task.future?.cancel(true); tasks.remove(id, task); Unit }
    }
    fun dispose() {
        if (disposed) return; disposed = true; radio.dispose()
        streams.keys.toList().forEach { close(it) }; cancellations.toList().forEach { it() }; cancellations.clear()
        tasks.values.forEach { it.cancelled = true; it.connection?.disconnect(); it.future?.cancel(true) }; tasks.clear(); io.shutdownNow()
        val owned = files.values.map { it.first }.toSet(); AnseronUIFileProvider.files.entries.removeIf { it.value.first in owned }; owned.forEach { it.delete() }; files.clear()
    }
}
