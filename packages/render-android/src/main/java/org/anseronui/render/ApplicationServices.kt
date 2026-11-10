package org.anseronui.render

import android.app.*
import android.app.job.*
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import org.json.*
import java.util.UUID

/** The provider SDK (FCM/OEM) owns transport. Initialize tokenProvider in Application.onCreate. */
object AnseronUINotifications {
    var tokenProvider: ((NativeCompletion) -> (() -> Unit)?)? = null
    fun receive(context: Context, payload: JSONObject, opened: Boolean = false) {
        Inbox.append(context, "notifications", JSONObject().put("kind", if (opened) "opened" else "received").put("payload", payload))
    }
    fun tokenChanged(context: Context, token: String, provider: String) { Inbox.append(context, "notifications", JSONObject().put("kind", "token").put("payload", JSONObject().put("token", token).put("provider", provider))) }
    fun receiveIntent(context: Context, intent: Intent?) { intent?.getStringExtra("anseronui.notification")?.let { raw -> runCatching { receive(context, JSONObject(raw), true) }; intent.removeExtra("anseronui.notification") } }
}
internal object Inbox {
    @Synchronized fun events(context: Context, name: String): JSONArray = runCatching { JSONArray(context.getSharedPreferences("anseronui.inbox", 0).getString(name, "[]")) }.getOrDefault(JSONArray())
    @Synchronized fun append(context: Context, name: String, event: JSONObject) {
        event.put("id", UUID.randomUUID().toString()).put("timestamp", System.currentTimeMillis())
        val old = events(context, name); val values = (0 until old.length()).map { old.get(it) }.takeLast(99).toMutableList(); values.add(event)
        while (values.isNotEmpty() && JSONArray(values).toString().toByteArray(Charsets.UTF_8).size > 48000) values.removeAt(0)
        val items = JSONArray(values)
        context.getSharedPreferences("anseronui.inbox", 0).edit().putString(name, items.toString()).commit()
    }
    @Synchronized fun acknowledge(context: Context, name: String, ids: JSONArray) {
        val values = (0 until ids.length()).map { ids.getString(it) }.toSet(); val old = events(context, name); val next = JSONArray()
        for (i in 0 until old.length()) if (old.getJSONObject(i).getString("id") !in values) next.put(old.get(i))
        context.getSharedPreferences("anseronui.inbox", 0).edit().putString(name, next.toString()).commit()
    }
}
/** Named native handlers are registered in Application.onCreate so process recreation works. */
object AnseronUIBackground {
    val handlers = mutableMapOf<String, (Context, (Boolean) -> Unit) -> (() -> Unit)?>()
    fun register(identifier: String, handler: (Context, (Boolean) -> Unit) -> (() -> Unit)?) { require(identifier !in handlers) { "Duplicate background identifier" }; handlers[identifier] = handler }
}
class AnseronUIJobService : JobService() {
    private val cancellations = mutableMapOf<Int, () -> Unit>()
    private val active = mutableSetOf<Int>()
    override fun onStartJob(params: JobParameters): Boolean {
        val name = params.extras.getString("identifier") ?: return false
        val handler = AnseronUIBackground.handlers[name] ?: return false
        active.add(params.jobId)
        fun finish(success: Boolean) { Handler(Looper.getMainLooper()).post { if (active.remove(params.jobId)) { cancellations.remove(params.jobId); Inbox.append(this, "background", JSONObject().put("identifier", name).put("success", success)); jobFinished(params, false) } } }
        try { handler(applicationContext, ::finish)?.let { cancellations[params.jobId] = it } } catch (_: Throwable) { finish(false) }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { active.remove(params.jobId); cancellations.remove(params.jobId)?.invoke(); Inbox.append(this, "background", JSONObject().put("identifier", params.extras.getString("identifier")).put("success", false)); return false }
}
class AnseronUINotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val raw = intent.getStringExtra("notification") ?: return
        val args = runCatching { JSONObject(raw) }.getOrNull() ?: return
        ApplicationServices.display(context, args)
    }
}
internal class ApplicationServices(private val context: Context) {
    companion object {
        private fun pending(context: Context, args: JSONObject, flags: Int): PendingIntent? = PendingIntent.getBroadcast(context, 0,
            Intent(context, AnseronUINotificationReceiver::class.java).setData(android.net.Uri.parse("anseronui-notification:" + android.net.Uri.encode(args.getString("id")))).putExtra("notification", args.toString()), flags or PendingIntent.FLAG_IMMUTABLE)
        fun display(context: Context, args: JSONObject) {
            if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(NotificationChannel("anseronui", "Application notifications", NotificationManager.IMPORTANCE_DEFAULT))
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val payload = JSONObject().put("id", args.getString("id")).put("title", args.getString("title")).put("body", args.getString("body"))
            launch?.putExtra("anseronui.notification", payload.toString())?.setData(android.net.Uri.parse("anseronui-notification-open:" + android.net.Uri.encode(args.getString("id"))))
            val click = launch?.let { PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
            val notification = Notification.Builder(context, "anseronui").setSmallIcon(context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.ic_dialog_info).setContentTitle(args.getString("title")).setContentText(args.getString("body")).setContentIntent(click).setAutoCancel(true).build()
            manager.notify(args.getString("id"), 0, notification); AnseronUINotifications.receive(context, payload)
        }
    }
    fun methods(module: String): List<String> = when(module) {
        "notifications" -> listOf("schedule", "cancel", "getEvents", "acknowledge") + if (AnseronUINotifications.tokenProvider != null) listOf("register") else emptyList()
        "background" -> listOf("schedule", "pending", "cancel", "getEvents", "acknowledge")
        else -> emptyList()
    }
    fun invoke(module: String, method: String, args: JSONObject, complete: NativeCompletion): (() -> Unit)? {
        fun done(value: Any? = null): (() -> Unit)? { complete(Result.success(value)); return null }
        if (method == "getEvents") return done(Inbox.events(context, module))
        if (method == "acknowledge") { Inbox.acknowledge(context, module, args.getJSONArray("ids")); return done() }
        if (module == "notifications") {
            if (method == "register") {
                val provider = AnseronUINotifications.tokenProvider ?: throw IllegalStateException("UNSUPPORTED: configure push provider")
                val main = Handler(Looper.getMainLooper()); var finished = false; var cancel: (() -> Unit)? = null
                val timeout = Runnable { if (!finished) { finished = true; cancel?.invoke(); complete(Result.failure(IllegalStateException("TIMEOUT: push registration"))) } }
                main.postDelayed(timeout, 20000)
                try { cancel = provider { result -> main.post { if (!finished) { finished = true; main.removeCallbacks(timeout); complete(result) } } } }
                catch (error: Throwable) { finished = true; main.removeCallbacks(timeout); throw error }
                return { finished = true; main.removeCallbacks(timeout); cancel?.invoke() }
            }
            require(args.getString("id").isNotEmpty()) { "INVALID_ARGUMENT: id" }
            val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (method == "cancel") { pending(context, args, PendingIntent.FLAG_NO_CREATE)?.let { alarms.cancel(it); it.cancel() }; (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(args.getString("id"), 0); return done() }
            if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) throw IllegalStateException("PERMISSION_DENIED: notifications")
            require(args.has("title") && args.has("body")) { "INVALID_ARGUMENT: notification" }
            val delay = args.optDouble("delaySeconds", 1.0); require(delay.isFinite() && delay >= 1 && delay <= 2592000) { "INVALID_ARGUMENT: delaySeconds" }
            // Inexact alarms intentionally avoid the restricted exact-alarm permission.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + (delay * 1000).toLong(), pending(context, args, PendingIntent.FLAG_UPDATE_CURRENT)!!); return done()
        }
        val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
        val jobs = scheduler.allPendingJobs.filter { it.service.className == AnseronUIJobService::class.java.name }
        if (method == "pending") return done(JSONArray(jobs.map { it.extras.getString("identifier") }))
        val name = args.getString("identifier"); val existing = jobs.firstOrNull { it.extras.getString("identifier") == name }
        if (method == "cancel") { existing?.let { scheduler.cancel(it.id) }; return done() }
        require(name in AnseronUIBackground.handlers) { "INVALID_ARGUMENT: register background identifier in Application" }
        val delay = args.optDouble("delaySeconds", 900.0); require(delay.isFinite() && delay >= 0 && delay <= 2592000) { "INVALID_ARGUMENT: delaySeconds" }
        // Choose a stable vacant ID from our reserved range; do not cancel another library's job.
        val used = scheduler.allPendingJobs.map { it.id }.toSet(); val id = existing?.id ?: (0x41550000..0x4155ffff).first { it !in used }
        val extras = PersistableBundle().apply { putString("identifier", name) }
        val builder = JobInfo.Builder(id, ComponentName(context, AnseronUIJobService::class.java)).setExtras(extras).setMinimumLatency((delay * 1000).toLong()).setPersisted(true)
        if (args.optBoolean("requiresNetwork")) builder.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        check(scheduler.schedule(builder.build()) == JobScheduler.RESULT_SUCCESS) { "IO_ERROR: job scheduler rejected request" }; return done()
    }
}
