package org.anseronui.render

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.content.res.ColorStateList
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ScrollView
import android.widget.ImageView
import android.widget.MediaController
import android.graphics.BitmapFactory
import android.widget.TextView
import android.text.Editable
import android.text.TextWatcher
import android.text.TextPaint
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.text.style.StrikethroughSpan
import android.text.style.AbsoluteSizeSpan
import android.text.style.ClickableSpan
import android.text.method.LinkMovementMethod
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import java.net.URL
import java.net.URI
import java.util.concurrent.atomic.AtomicLong

data class RendererEvent(
    val type: String, val nodeId: Long, val revision: Long,
    val value: String? = null, val inputRevision: Long? = null, val event: String? = null,
    val x: Double? = null, val y: Double? = null, val contentWidth: Double? = null, val contentHeight: Double? = null,
    val source: String? = null, val state: String? = null, val duration: Double? = null, val errorCode: Double? = null,
    val pageX: Double? = null, val pageY: Double? = null, val pointerId: Long? = null, val touches: List<TouchPoint>? = null,
    val targetId: Long? = null
)

data class TextSize(val width: Float, val height: Float, val baseline: Float)
data class TouchPoint(val x: Double, val y: Double, val pageX: Double, val pageY: Double, val pointerId: Long)

private class NodeRecord(val view: View, val content: ViewGroup?, val kind: String) {
    val animation = NodeAnimation(view)
    val events = mutableSetOf<String>()
    var inputRevision = 0L
    var applyingValue = false
    var mediaSource = ""
    var mediaGeneration = AtomicLong(0)
    var timePoll: Runnable? = null
    var touchAction = "auto"
    var native: AndroidNativeComponent? = null
}

/** Main-thread renderer for the shared protocol's Commit payload. */
class AndroidRenderer(val root: FrameLayout, private val extensions: AndroidPlatformExtensions = AndroidPlatformExtensions(), var onEvent: ((RendererEvent) -> Unit)? = null) {
    private val nodes = mutableMapOf<Long, NodeRecord>()
    private var revision = 0L
    private val density get() = root.resources.displayMetrics.density
    private data class TouchSession(val target: Long, val owner: Long?, val startX: Float, val startY: Float,
        val allowX: Boolean, val allowY: Boolean, var x: Float, var y: Float, var axis: String? = null, var cancelled: Boolean = false)
    private val sessions = mutableMapOf<Int, TouchSession>()
    private val surface = object : FrameLayout(root.context) {
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            receiveTouch(event)
            val handled = super.dispatchTouchEvent(event)
            // Retain a stream even when a plain View has no native touch handler.
            return handled || sessions.isNotEmpty() || event.actionMasked == MotionEvent.ACTION_UP
        }
    }
    init { root.addView(surface, FrameLayout.LayoutParams(-1, -1)) }

    private inner class TouchScrollView : ScrollView(root.context) {
        override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
            val relevant = sessions.values.filter { nodes[it.target]?.view?.let { view -> isDescendant(view, this) } == true }
            if (relevant.any { if (it.axis == "x") !it.allowX else if (it.axis == "y") !it.allowY else !it.allowX && !it.allowY }) return false
            val intercept = super.onInterceptTouchEvent(event)
            if (intercept) {
                for (session in relevant.filter { !it.cancelled }) {
                    session.cancelled = true
                    emitTouch("touchCancel", sessions.entries.first { it.value === session }.key, session)
                }
            }
            return intercept
        }
    }

    private fun receiveTouch(event: MotionEvent) {
        val index = event.actionIndex
        if (event.actionMasked == MotionEvent.ACTION_DOWN) sessions.clear()
        // All coordinates are root relative, available even on API levels below 29.
        for (i in 0 until event.pointerCount) sessions[event.getPointerId(i)]?.let { it.x = event.getX(i); it.y = event.getY(i) }
        if (event.actionMasked == MotionEvent.ACTION_DOWN || event.actionMasked == MotionEvent.ACTION_POINTER_DOWN) {
            val target = deepestNodeAt(event.getX(index), event.getY(index)) ?: return
            var ancestor: View? = target.second.view
            var owner: Long? = null
            var allowX = true; var allowY = true; var policyComplete = false
            while (ancestor != null && ancestor !== surface) {
                val record = nodes.entries.firstOrNull { it.value.view === ancestor }
                if (record != null) {
                    if (owner == null && record.value.events.any { it in setOf("touchDown", "touchMove", "touchUp", "touchCancel") }) owner = record.key
                    if (!policyComplete) {
                        allowX = allowX && record.value.touchAction != "none" && record.value.touchAction != "pan-y"
                        allowY = allowY && record.value.touchAction != "none" && record.value.touchAction != "pan-x"
                        if (ancestor is ScrollView) policyComplete = true
                    }
                }
                ancestor = ancestor.parent as? View
            }
            val x = event.getX(index); val y = event.getY(index)
            val session = TouchSession(target.first, owner, x, y, allowX, allowY, x, y)
            sessions[event.getPointerId(index)] = session
            emitTouch("touchDown", event.getPointerId(index), session)
        } else if (event.actionMasked == MotionEvent.ACTION_MOVE) {
            val slop = ViewConfiguration.get(root.context).scaledTouchSlop
            for ((id, session) in sessions.toMap()) {
                val dx = kotlin.math.abs(session.x - session.startX); val dy = kotlin.math.abs(session.y - session.startY)
                if (session.axis == null && max(dx, dy) > slop) session.axis = if (dx > dy) "x" else "y"
                if (!session.cancelled) emitTouch("touchMove", id, session)
            }
        } else if (event.actionMasked == MotionEvent.ACTION_CANCEL) {
            val ended = sessions.toMap(); sessions.clear()
            for ((id, session) in ended) if (!session.cancelled) emitTouch("touchCancel", id, session)
        } else if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_POINTER_UP) {
            val id = event.getPointerId(index)
            val session = sessions.remove(id)
            if (session != null && !session.cancelled) emitTouch("touchUp", id, session)
        }
    }

    private fun emitTouch(name: String, id: Int, session: TouchSession) {
        val target = nodes[session.target]?.view ?: return
        val owner = session.owner ?: return
        if (!isDescendant(target, surface)) return
        fun point(id: Int, session: TouchSession): TouchPoint {
            val local = floatArrayOf(session.x, session.y)
            val chain = mutableListOf<View>()
            var child: View = target
            while (child !== surface) { chain.add(child); child = child.parent as? View ?: break }
            for (item in chain.asReversed()) {
                val parent = item.parent as? View
                local[0] = local[0] + ((parent?.scrollX ?: 0) - item.left).toFloat()
                local[1] = local[1] + ((parent?.scrollY ?: 0) - item.top).toFloat()
                val inverse = android.graphics.Matrix()
                if (item.matrix.invert(inverse)) inverse.mapPoints(local)
            }
            return TouchPoint((local[0]/density).toDouble(), (local[1]/density).toDouble(),
                (session.x/density).toDouble(), (session.y/density).toDouble(), id.toLong())
        }
        val point = point(id, session)
        onEvent?.invoke(RendererEvent("NativeEvent", owner, revision, event = name, x = point.x, y = point.y,
            pageX = point.pageX, pageY = point.pageY, pointerId = point.pointerId,
            touches = sessions.filterValues { !it.cancelled }.map { point(it.key, it.value) }, targetId = session.target))
    }

    fun applyJson(payload: String) {
        require(Looper.myLooper() == Looper.getMainLooper()) { "Renderer must run on the UI thread" }
        val commit = JSONObject(payload)
        require(commit.getString("type") == "Commit") { "Invalid commit" }
        val next = commit.getLong("revision")
        require(next > revision && next <= 0xffffffffL) { "Invalid revision" }
        val commands = commit.getJSONArray("commands")
        require(commands.length() <= 4096) { "Too many commands" }
        validate(commands)
        try {
            for (i in 0 until commands.length()) applyOne(commands.getJSONObject(i))
            nodes.values.forEach { it.animation.commit() }
            revision = next
            updateScrollExtents()
        } catch (error: Exception) {
            clear()
            throw error
        }
    }

    fun clear() { sessions.clear(); nodes.values.forEach { releaseNode(it) }; surface.removeAllViews(); nodes.clear(); revision = 0L }
    fun invoke(nodeId: Long, method: String, args: Any?, complete: NativeCompletion): (() -> Unit)? {
        val record = nodes[nodeId] ?: error("NODE_UNMOUNTED")
        if (method == "measure") {
            val position = IntArray(2); record.view.getLocationInWindow(position)
            val origin = IntArray(2); root.getLocationInWindow(origin)
            complete(Result.success(JSONObject().put("x", (position[0]-origin[0])/density.toDouble()).put("y", (position[1]-origin[1])/density.toDouble())
                .put("width", record.view.width/density.toDouble()).put("height", record.view.height/density.toDouble())))
            return null
        }
        if (method == "animate") {
            record.animation.animate(args) { finished -> complete(Result.success(JSONObject().put("finished", finished))) }
            return { record.animation.cancel() }
        }
        if (method == "cancelAnimation") { record.animation.cancel(); complete(Result.success(null)); return null }
        record.native?.let { return it.invoke(method, args, complete) }
        val view = record.view
        if (method == "focus" && view is EditText) {
            view.requestFocus()
            (root.context.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).showSoftInput(view, 0)
        } else if (method == "blur" && view is EditText) {
            view.clearFocus()
            (root.context.getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(view.windowToken, 0)
        } else if (method == "scrollTo" && view is ScrollView && args is JSONObject) {
            val x = args.getDouble("x"); val y = args.getDouble("y")
            require(x.isFinite() && y.isFinite())
            if (args.optBoolean("animated")) view.smoothScrollTo((x*density).roundToInt(), (y*density).roundToInt())
            else view.scrollTo((x*density).roundToInt(), (y*density).roundToInt())
        } else error("UNSUPPORTED_VIEW_METHOD: $method")
        complete(Result.success(null)); return null
    }

    fun viewFor(nodeId: Long): View? = nodes[nodeId]?.view

    /** Call on the UI thread; real controls measure their own text and padding. */
    fun measure(kind: String, text: String, fontSize: Float, maxWidth: Float, props: JSONObject? = null): TextSize {
        require(Looper.myLooper() == Looper.getMainLooper()) { "Measurement must run on the UI thread" }
        require(fontSize.isFinite() && fontSize >= 0 && maxWidth.isFinite() && maxWidth >= 0)
        val view: TextView = when (kind) {
            "Text", "RichText" -> TextView(root.context)
            "Button" -> Button(root.context)
            "TextInput" -> EditText(root.context)
            else -> error("Unknown text kind")
        }
        view.textSize = fontSize
        view.text = if (text.isEmpty()) " " else text
        if (props != null) setProps(NodeRecord(view, null, kind), props)
        val bound = (maxWidth * density).roundToInt().coerceIn(0, 1_000_000)
        view.measure(
            View.MeasureSpec.makeMeasureSpec(bound, View.MeasureSpec.AT_MOST),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        )
        return TextSize(min(maxWidth, kotlin.math.ceil(view.measuredWidth / density)), kotlin.math.ceil(view.measuredHeight / density), view.baseline / density)
    }

    private fun validate(commands: JSONArray) {
        val known = nodes.keys.toMutableSet()
        for (i in 0 until commands.length()) {
            val command = commands.getJSONObject(i)
            val id = command.getLong("nodeId")
            require(id in 1..0xffffffffL) { "Invalid node ID" }
            when (command.getString("type")) {
                "CreateNode" -> {
                    require(id !in known && command.getString("kind") in setOf("View", "Text", "RichText", "Button", "TextInput", "ScrollView", "Image", "Video", "Native"))
                    known.add(id)
                }
                "InsertChild", "MoveChild" -> {
                    val parent = command.getLong("parentId")
                    require(id in known && (parent == 0L || parent in known) && parent != id && command.getInt("index") >= 0)
                }
                "RemoveNode" -> require(known.remove(id))
                "SetProps" -> require(id in known && command.has("props"))
                "SetFrame" -> {
                    require(id in known)
                    val frame = command.getJSONObject("frame")
                    require((0..3).all { n -> frame.getDouble(arrayOf("x", "y", "width", "height")[n]).isFinite() })
                    require(frame.getDouble("width") >= 0 && frame.getDouble("height") >= 0)
                }
                "BindEvent" -> require(id in known && command.getString("event") in setOf("tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay", "nativeComponent") && command.has("enabled"))
                else -> error("Unknown render command")
            }
        }
    }

    private fun applyOne(command: JSONObject) {
        val id = command.getLong("nodeId")
        if (command.getString("type") == "CreateNode") {
            val kind = command.getString("kind")
            val view: View
            val content: ViewGroup?
            var native: AndroidNativeComponent? = null
            when (kind) {
                "View" -> { view = FrameLayout(root.context); content = view }
                "Text" -> { view = TextView(root.context); content = null }
                "RichText" -> { view = TextView(root.context); content = null }
                "Button" -> { view = Button(root.context); content = null }
                "TextInput" -> { view = EditText(root.context); content = null }
                "ScrollView" -> {
                    val scroll = TouchScrollView().apply { isFillViewport = true }
                    val inner = FrameLayout(root.context)
                    scroll.addView(inner)
                    view = scroll; content = inner
                }
                "Image" -> { view = ImageView(root.context).apply { scaleType = ImageView.ScaleType.FIT_CENTER }; content = null }
                "Native" -> {
                    val name = command.getString("nativeName")
                    val factory = extensions.components[name] ?: error("UNREGISTERED_NATIVE_COMPONENT: $name")
                    native = factory(root.context) { event, data ->
                        root.post {
                            val current = nodes[id]
                            if (current?.native !== native || current == null || "nativeComponent" !in current.events) return@post
                            onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = "nativeComponent", value = encodeNativeJSON(JSONObject().put("name", event).put("data", JSONObject.wrap(data)))))
                        }
                    }
                    view = native.view; content = native.contentView
                }
                "Video" -> { view = AndroidVideoView(root.context); content = null }
                else -> error("Unknown node kind")
            }
            val record = NodeRecord(view, content, kind)
            record.native = native
            nodes[id] = record
            if (view is Button) view.setOnClickListener {
                if ("tap" in record.events) onEvent?.invoke(RendererEvent("Tap", id, revision))
            }
            if (view is EditText) view.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                    if (!record.applyingValue && "changeText" in record.events) {
                        record.inputRevision++
                        onEvent?.invoke(RendererEvent("InputChange", id, revision, s?.toString() ?: "", record.inputRevision))
                    }
                }
                override fun afterTextChanged(s: Editable?) {}
            })
            view.setOnLongClickListener {
                if ("longPress" in record.events) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = "longPress"))
                "longPress" in record.events
            }
            if (view is EditText) {
                view.setOnFocusChangeListener { _, focused ->
                    val name = if (focused) "focus" else "blur"
                    if (name in record.events) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = name))
                }
                view.setOnEditorActionListener { input, _, _ ->
                    if ("submit" in record.events) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, value = input.text.toString(), event = "submit"))
                    "submit" in record.events
                }
            }
            if (view is ScrollView) view.setOnScrollChangeListener { scroll, x, y, _, _ ->
                val sendScroll = { event: String ->
                    if (event in record.events) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = event, x = x.toDouble(), y = y.toDouble(), contentWidth = scroll.width.toDouble(), contentHeight = scroll.height.toDouble()))
                }
                sendScroll("scroll")
                scroll.removeCallbacks(scroll.tag as? Runnable ?: Runnable {})
                val end = Runnable { sendScroll("scrollEnd") }
                scroll.tag = end
                scroll.postDelayed(end, 120)
            }
            if (view is AndroidVideoView) {
                val video = view.player
                video.setOnPreparedListener { player ->
                    if (nodes[id] !== record) return@setOnPreparedListener
                    view.prepared = true; view.mediaPlayer = player
                    view.videoWidth = player.videoWidth; view.videoHeight = player.videoHeight
                    view.requestLayout()
                    applyVideoSettings(view)
                    emitMedia(record, "loadSuccess", record.mediaSource)
                    // Setting playbackParams may start MediaPlayer. Restore the requested state last.
                    applyVideoControl(record, view, force = true)
                    record.timePoll?.let { root.removeCallbacks(it) }
                    val poll = object : Runnable {
                        override fun run() {
                            if (nodes[id] !== record || !view.prepared) return
                            emitMedia(record, "playTimeDidChanged", time = video.currentPosition.toDouble(), duration = video.duration.coerceAtLeast(0).toDouble())
                            root.postDelayed(this, 500)
                        }
                    }
                    record.timePoll = poll
                    root.post(poll)
                }
                video.setOnCompletionListener {
                    emitMedia(record, "playStateDidChanged", state = "ended")
                    emitMedia(record, "playTimeDidChanged", time = video.duration.coerceAtLeast(0).toDouble(), duration = video.duration.coerceAtLeast(0).toDouble())
                }
                video.setOnErrorListener { _, what, _ ->
                    view.prepared = false; view.mediaPlayer = null
                    record.timePoll?.let { root.removeCallbacks(it) }; record.timePoll = null
                    emitMedia(record, "loadFailure", record.mediaSource, what)
                    emitMedia(record, "playStateDidChanged", state = "error")
                    true
                }
                video.setOnInfoListener { _, what, _ ->
                    if (what == android.media.MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && !view.firstFrame) {
                        view.firstFrame = true
                        emitMedia(record, "firstFrameDidDisplay")
                    }
                    false
                }
            }
            return
        }
        val record = nodes[id] ?: error("Unknown node")
        when (command.getString("type")) {
            "RemoveNode" -> {
                val subtree = mutableSetOf<View>()
                fun collect(view: View) {
                    subtree.add(view)
                    if (view is ViewGroup) for (index in 0 until view.childCount) collect(view.getChildAt(index))
                }
                collect(record.view)
                nodes.values.filter { it.view in subtree }.forEach { releaseNode(it) }
                nodes.entries.removeAll { it.value.view in subtree }
                (record.view.parent as? ViewGroup)?.removeView(record.view)
            }
            "InsertChild", "MoveChild" -> {
                val parentId = command.getLong("parentId")
                val target = if (parentId == 0L) surface else nodes[parentId]?.content ?: error("Invalid parent")
                val index = min(command.getInt("index"), target.childCount)
                val current = record.view.parent as? ViewGroup
                if (current !== target || target.indexOfChild(record.view) != index) {
                    current?.removeView(record.view)
                    target.addView(record.view, index)
                }
            }
            "SetProps" -> setProps(record, command.getJSONObject("props"))
            "SetFrame" -> {
                val frame = command.getJSONObject("frame")
                record.animation.stage(listOf("x","y","width","height").associateWith { frame.getDouble(it) })
                if ("layout" in record.events) record.view.post {
                    onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = "layout", x = frame.getDouble("x"), y = frame.getDouble("y"), contentWidth = frame.getDouble("width"), contentHeight = frame.getDouble("height")))
                }
            }
            "BindEvent" -> if (command.getBoolean("enabled")) record.events.add(command.getString("event")) else record.events.remove(command.getString("event"))
            else -> error("Unknown command")
        }
    }

    private fun setProps(record: NodeRecord, props: JSONObject) {
        record.native?.setProps(JSONObject(props.optString("nativeProps", "{}")))
        record.touchAction = props.optString("touchAction", "auto")
        val view = record.view
        record.animation.options = if (props.has("animation")) AnimationOptions(JSONObject(props.getString("animation"))) else null
        val color = parseColor(props.optString("backgroundColor", ""), Color.TRANSPARENT)
        val visual = NodeAnimation.defaults.toMutableMap()
        for (key in listOf("opacity","translateX","translateY","scaleX","scaleY","rotate","borderRadius")) if (props.has(key)) visual[key] = props.getDouble(key)
        visual.putAll(mapOf("r" to Color.red(color).toDouble(), "g" to Color.green(color).toDouble(), "b" to Color.blue(color).toDouble(), "a" to Color.alpha(color)/255.0))
        record.animation.stage(visual)
        view.contentDescription = props.optString("accessibilityLabel").takeIf { it.isNotEmpty() }
        view.transitionName = props.optString("testID").takeIf { it.isNotEmpty() }
        view.isEnabled = props.optBoolean("editable", true)
        view.visibility = if (props.optString("visibility") == "hidden") View.INVISIBLE else View.VISIBLE
        val background = view.background as? GradientDrawable ?: GradientDrawable().also { view.background = it }
        background.setStroke((props.optDouble("borderWidth", 0.0) * density).roundToInt(), parseColor(props.optString("borderColor", ""), Color.TRANSPARENT))
        if (view is TextView) {
            view.textSize = props.optDouble("fontSize", 16.0).toFloat()
            view.setTextColor(parseColor(props.optString("color", ""), Color.BLACK))
            view.typeface = android.graphics.Typeface.create(view.typeface, if (props.optString("fontWeight") == "bold") android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
            if (props.optString("fontStyle") == "italic") view.setTypeface(view.typeface, android.graphics.Typeface.ITALIC)
            view.gravity = when (props.optString("textAlign")) { "center" -> android.view.Gravity.CENTER_HORIZONTAL; "right" -> android.view.Gravity.RIGHT; else -> android.view.Gravity.LEFT }
            if (props.has("numberOfLines")) { view.maxLines = props.optInt("numberOfLines"); view.ellipsize = android.text.TextUtils.TruncateAt.END }
            when (record.kind) {
                "Text" -> view.text = props.optString("text", "")
                "RichText" -> {
                    // RenderProps crosses the protocol as JSON scalars, so Core's
                    // serialized span list arrives as a String rather than a
                    // nested JSONArray. Accept both forms for direct renderer
                    // callers and the real Core transport.
                    val items = richTextSpans(props)
                    val content = StringBuilder()
                    for (i in 0 until items.length()) content.append(items.optJSONObject(i)?.optString("text", "") ?: "")
                    val rich = SpannableString(content.toString())
                    var offset = 0
                    for (i in 0 until items.length()) {
                        val item = items.optJSONObject(i) ?: continue
                        val text = item.optString("text", ""); val end = offset + text.length
                        if (end > offset) {
                            if (item.has("color")) rich.setSpan(ForegroundColorSpan(parseColor(item.optString("color"), Color.BLACK)), offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            val style = (if (item.optString("fontWeight") == "bold") android.graphics.Typeface.BOLD else 0) or (if (item.optString("fontStyle") == "italic") android.graphics.Typeface.ITALIC else 0)
                            if (style != 0) rich.setSpan(StyleSpan(style), offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            if (item.has("fontSize")) rich.setSpan(AbsoluteSizeSpan((item.optDouble("fontSize") * density).roundToInt()), offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            if (item.optString("textDecorationLine") == "underline") rich.setSpan(UnderlineSpan(), offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            if (item.optString("textDecorationLine") == "line-through") rich.setSpan(StrikethroughSpan(), offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                            // A default ClickableSpan changes the draw state to the
                            // platform link color and adds an underline. Only add
                            // it for spans that are actually clickable, and keep
                            // the color/decoration supplied by the RichText span.
                            val clickable = if (item.has("clickable")) item.optBoolean("clickable") else "spanClick" in record.events
                            if (clickable) rich.setSpan(object : ClickableSpan() {
                                override fun updateDrawState(ds: TextPaint) { /* preserve ForegroundColorSpan/UnderlineSpan */ }
                                override fun onClick(widget: View) {
                                    val nodeId = nodes.entries.firstOrNull { it.value === record }?.key ?: return
                                    if ("spanClick" in record.events) onEvent?.invoke(RendererEvent("NativeEvent", nodeId, revision, value = i.toString(), event = "spanClick"))
                                }
                            }, offset, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                        }
                        offset = end
                    }
                    view.text = rich
                    view.movementMethod = LinkMovementMethod.getInstance()
                }
                "Button" -> {
                    view.text = props.optString("title", "")
                    val normal = parseColor(props.optString("color", ""), Color.BLACK)
                    val disabled = Color.argb((Color.alpha(normal) * 0.45f).roundToInt(), Color.red(normal), Color.green(normal), Color.blue(normal))
                    view.setTextColor(ColorStateList(
                        arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
                        intArrayOf(disabled, normal)
                    ))
                    view.isEnabled = !props.optBoolean("disabled", false)
                }
                "TextInput" -> {
                    val input = view as EditText
                    input.hint = props.optString("placeholder", "")
                    input.isEnabled = props.optBoolean("editable", true)
                    input.isSingleLine = true
                    input.inputType = if (props.optBoolean("secureTextEntry")) android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD else when (props.optString("keyboardType")) {
                        "numeric" -> android.text.InputType.TYPE_CLASS_NUMBER
                        "decimal-pad" -> android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
                        "phone-pad" -> android.text.InputType.TYPE_CLASS_PHONE
                        "email-address" -> android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                        else -> android.text.InputType.TYPE_CLASS_TEXT
                    }
                    input.imeOptions = when (props.optString("returnKeyType")) { "done" -> android.view.inputmethod.EditorInfo.IME_ACTION_DONE; "go" -> android.view.inputmethod.EditorInfo.IME_ACTION_GO; "next" -> android.view.inputmethod.EditorInfo.IME_ACTION_NEXT; "search" -> android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH; "send" -> android.view.inputmethod.EditorInfo.IME_ACTION_SEND; else -> android.view.inputmethod.EditorInfo.IME_ACTION_UNSPECIFIED }
                    val value = props.optString("value", "")
                    if (props.optLong("inputRevision", 0) >= record.inputRevision && input.text.toString() != value && !hasComposition(input)) {
                        record.applyingValue = true
                        input.setText(value)
                        input.setSelection(value.length)
                        record.applyingValue = false
                    }
                }
            }
        }
        if (view is ScrollView) {
            view.isEnabled = props.optBoolean("scrollEnabled", true)
            view.isVerticalScrollBarEnabled = props.optBoolean("showsVerticalScrollIndicator", true)
        }
        if (view is ImageView) {
            view.contentDescription = props.optString("accessibilityLabel").takeIf { it.isNotEmpty() }
            view.scaleType = when (props.optString("resizeMode")) {
                "contain" -> ImageView.ScaleType.FIT_CENTER
                "stretch" -> ImageView.ScaleType.FIT_XY
                else -> ImageView.ScaleType.CENTER_CROP
            }
            val source = props.optString("src", "")
            if (source != record.mediaSource) {
                record.mediaSource = source
                val generation = record.mediaGeneration.incrementAndGet()
                view.setImageDrawable(null)
                val placeholder = props.optString("placeholderSrc", "")
                if (placeholder.isNotEmpty()) loadBitmap(placeholder) { bitmap, _ -> if (bitmap != null && generation == record.mediaGeneration.get()) view.setImageBitmap(bitmap) }
                loadBitmap(source) { bitmap, error ->
                    if (generation != record.mediaGeneration.get()) return@loadBitmap
                    if (bitmap != null) {
                        view.setImageBitmap(bitmap)
                        emitMedia(record, "loadSuccess", source)
                    } else emitMedia(record, "loadFailure", source, 1)
                }
            }
        }
        if (view is AndroidVideoView) {
            val previous = view.props
            view.props = JSONObject(props.toString())
            view.resizeMode = props.optString("resizeMode", "contain")
            view.clipToOutline = props.optDouble("borderRadius", 0.0) > 0
            view.requestLayout()
            val video = view.player
            if (previous.optBoolean("controls", true) != props.optBoolean("controls", true) || previous.length() == 0) {
                if (props.optBoolean("controls", true)) {
                    val controller = MediaController(view.context)
                    controller.setAnchorView(view); video.setMediaController(controller)
                } else video.setMediaController(null)
            }
            val source = props.optString("src", "")
            if (source != record.mediaSource) {
                record.timePoll?.let { root.removeCallbacks(it) }; record.timePoll = null
                video.stopPlayback()
                view.prepared = false; view.mediaPlayer = null; view.firstFrame = false; view.appliedControl = null
                view.videoWidth = 0; view.videoHeight = 0
                record.mediaSource = source
                try {
                    if (source.startsWith("asset://") && Regex("[A-Za-z0-9_.-]+").matches(source.removePrefix("asset://"))) {
                        val name = source.removePrefix("asset://")
                        val file = java.io.File(view.context.cacheDir, "anseronui-$name")
                        view.context.assets.open(name).use { input -> file.outputStream().use { input.copyTo(it) } }
                        video.setVideoURI(android.net.Uri.fromFile(file))
                    } else if (source.startsWith("http://") || source.startsWith("https://") || source.startsWith("file://")) {
                        video.setVideoURI(android.net.Uri.parse(source))
                    } else if (source.isNotEmpty()) error("INVALID_VIDEO_SOURCE")
                } catch (_: Exception) {
                    emitMedia(record, "loadFailure", source, 1)
                    emitMedia(record, "playStateDidChanged", state = "error")
                }
            } else if (view.prepared) {
                val settingsChanged = previous.optBoolean("loop") != props.optBoolean("loop") ||
                    previous.optBoolean("muted") != props.optBoolean("muted") || previous.optDouble("rate", 1.0) != props.optDouble("rate", 1.0)
                if (settingsChanged) applyVideoSettings(view)
                applyVideoControl(record, view, force = settingsChanged)
            }
        }
    }

    private fun richTextSpans(props: JSONObject): JSONArray {
        val raw = props.opt("spans")
        if (raw is JSONArray) return raw
        if (raw is String && raw.isNotBlank()) return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return JSONArray()
    }

    private fun applyVideoSettings(view: AndroidVideoView) {
        val player = view.mediaPlayer ?: return
        player.isLooping = view.props.optBoolean("loop", false)
        val volume = if (view.props.optBoolean("muted", false)) 0f else 1f
        player.setVolume(volume, volume)
        val rate = view.props.optDouble("rate", 1.0).toFloat()
        if (rate > 0 && rate.isFinite() && player.playbackParams.speed != rate) player.playbackParams = player.playbackParams.setSpeed(rate)
    }

    private fun applyVideoControl(record: NodeRecord, view: AndroidVideoView, force: Boolean = false) {
        if (!view.prepared) return
        val control = view.props.optString("playControl").takeIf { it.isNotEmpty() }
            ?: if (view.props.optBoolean("autoplay", false)) "play" else "pause"
        if (!force && control == view.appliedControl) return
        val video = view.player
        when (control) {
            "play" -> { video.start(); emitMedia(record, "playStateDidChanged", state = "playing") }
            "pause", "stop" -> {
                video.pause()
                if (control == "stop") video.seekTo(0)
                // Decode a preview for an initially paused source without starting playback.
                else if (!view.firstFrame && video.currentPosition == 0) video.seekTo(1)
                emitMedia(record, "playStateDidChanged", state = "paused")
            }
        }
        view.appliedControl = control
    }

    private fun releaseNode(record: NodeRecord) {
        record.animation.cancel()
        record.mediaGeneration.incrementAndGet()
        record.timePoll?.let { root.removeCallbacks(it) }; record.timePoll = null
        (record.view as? AndroidVideoView)?.let {
            it.prepared = false; it.mediaPlayer = null
            it.player.setOnPreparedListener(null); it.player.setOnCompletionListener(null)
            it.player.setOnInfoListener(null); it.player.setOnErrorListener(null)
            it.player.stopPlayback()
        }
        record.native?.dispose()
    }

    private fun deepestNodeAt(x: Float, y: Float): Pair<Long, NodeRecord>? {
        var target = deepestView(surface, x, y)
        while (target !== surface) {
            val found = nodes.entries.firstOrNull { it.value.view === target }
            if (found != null) return found.key to found.value
            target = target.parent as? View ?: break
        }
        return null
    }

    private fun isDescendant(candidate: View, ancestor: View): Boolean {
        var current: View? = candidate
        while (current != null) { if (current === ancestor) return true; current = current.parent as? View }
        return false
    }

    private fun deepestView(parent: ViewGroup, x: Float, y: Float): View {
        for (index in parent.childCount - 1 downTo 0) {
            val child = parent.getChildAt(index)
            val point = floatArrayOf(x - child.left + parent.scrollX, y - child.top + parent.scrollY)
            val inverse = android.graphics.Matrix()
            if (!child.matrix.invert(inverse)) continue
            inverse.mapPoints(point)
            val childX = point[0]; val childY = point[1]
            if (child.visibility == View.VISIBLE && childX >= 0 && childY >= 0 && childX < child.width && childY < child.height) {
                return if (child is ViewGroup) deepestView(child, childX, childY) else child
            }
        }
        return parent
    }

    private fun loadBitmap(source: String, complete: (android.graphics.Bitmap?, Throwable?) -> Unit) {
        Thread {
            try {
                val input = if (source.startsWith("asset://") && Regex("[A-Za-z0-9_.-]+").matches(source.removePrefix("asset://"))) root.context.assets.open(source.removePrefix("asset://"))
                    else if (source.startsWith("http://") || source.startsWith("https://")) URL(source).openStream() else java.io.File(URI(source)).inputStream()
                val bitmap = input.use { BitmapFactory.decodeStream(it) }
                root.post { complete(bitmap, null) }
            } catch (error: Throwable) { root.post { complete(null, error) } }
        }.start()
    }

    private fun emitMedia(record: NodeRecord, event: String, source: String? = null, errorCode: Int? = null, state: String? = null, time: Double? = null, duration: Double? = null) {
        if (event !in record.events) return
        val id = nodes.entries.firstOrNull { it.value === record }?.key ?: return
        onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = event, source = source, state = state,
            x = time, duration = duration, errorCode = errorCode?.toDouble()))
    }

    private fun hasComposition(input: EditText): Boolean {
        val editable = input.text ?: return false
        return android.view.inputmethod.BaseInputConnection.getComposingSpanStart(editable) >= 0
    }

    private fun updateScrollExtents() {
        for (record in nodes.values) if (record.view is ScrollView) {
            val content = record.content ?: continue
            var width = 0
            var height = 0
            for (i in 0 until content.childCount) {
                val child = content.getChildAt(i)
                val params = child.layoutParams as? FrameLayout.LayoutParams ?: continue
                val model = nodes.values.firstOrNull { it.view === child }?.animation?.declared
                width = max(width, if (model != null) (((model["x"] ?: 0.0) + (model["width"] ?: 0.0))*density).roundToInt() else params.leftMargin + params.width)
                height = max(height, if (model != null) (((model["y"] ?: 0.0) + (model["height"] ?: 0.0))*density).roundToInt() else params.topMargin + params.height)
            }
            content.layoutParams = FrameLayout.LayoutParams(max(record.view.layoutParams?.width ?: 0, width), max(record.view.layoutParams?.height ?: 0, height))
        }
    }

    private fun parseColor(value: String, fallback: Int): Int =
        if (Regex("^#[0-9a-fA-F]{6}$").matches(value)) Color.parseColor(value) else fallback
}
