package org.anseronui.render

import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.content.res.Configuration
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.MotionEvent
import android.view.ViewConfiguration
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
    val scrollAdjustment: Double? = null, val source: String? = null, val state: String? = null, val duration: Double? = null, val errorCode: Double? = null,
    val pageX: Double? = null, val pageY: Double? = null, val pointerId: Long? = null, val touches: List<TouchPoint>? = null,
    val targetId: Long? = null
)

data class TextSize(val width: Float, val height: Float, val baseline: Float)
data class TouchPoint(val x: Double, val y: Double, val pageX: Double, val pageY: Double, val pointerId: Long)

private class NodeRecord(val view: View, val content: ViewGroup?, val kind: String, val nodeId: Long = 0) {
    val defaultAccessibilityDelegate = if (android.os.Build.VERSION.SDK_INT >= 29) view.accessibilityDelegate else null
    var accessibilityOverridden = false
    val defaultAccessibilityImportance = view.importantForAccessibility
    val defaultTypeface = (view as? TextView)?.typeface
    var declaredProps: JSONObject? = null
    var resolvedProps: JSONObject? = null
    var shadowKey = ""
    var shadowBitmap: Bitmap? = null
    var shadowPadding = 0
    var backdropBlur: BackdropBlur? = null
    var pageBackgroundColor = Color.TRANSPARENT
    val animation = NodeAnimation(view)
    val events = mutableSetOf<String>()
    var inputRevision = 0L
    var applyingValue = false
    var mediaSource = ""
    var mediaGeneration = AtomicLong(0)
    val imageLoads = mutableListOf<() -> Unit>()
    var timePoll: Runnable? = null
    var touchAction = "auto"
    var native: AndroidNativeComponent? = null
}

/** Main-thread renderer for the shared protocol's Commit payload. */
class AndroidRenderer(val root: FrameLayout, private val extensions: AndroidPlatformExtensions = AndroidPlatformExtensions(), var onEvent: ((RendererEvent) -> Unit)? = null) {
    // ANSERONUI_DEVTOOLS_BEGIN
    private var devtoolsImage = ""
    private var devtoolsImageRect = android.graphics.RectF()
    fun devtoolsCapture(args: JSONObject): JSONObject {
        val offset = args.optInt("offset", 0)
        if (offset == 0) {
            val id = args.optLong("id", 0)
            val view = if (id == 0L) root else nodes[id]?.view ?: error("UNKNOWN_NODE")
            require(view.width > 0 && view.height > 0) { "EMPTY_CAPTURE" }
            val sample = args.optInt("sample", 1).coerceIn(1, 2)
            val scale = minOf(1f / sample, 2048f / view.width, 2048f / view.height)
            val bitmap = android.graphics.Bitmap.createBitmap((view.width * scale).toInt().coerceAtLeast(1), (view.height * scale).toInt().coerceAtLeast(1), android.graphics.Bitmap.Config.ARGB_8888)
            try {
                val canvas = android.graphics.Canvas(bitmap); canvas.scale(scale, scale); view.draw(canvas)
                val bytes = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bytes)
                require(bytes.size() < 1_500_000) { "CAPTURE_TOO_LARGE" }
                devtoolsImage = "data:image/png;base64," + android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP)
                val origin = IntArray(2); root.getLocationInWindow(origin)
                val point = IntArray(2); view.getLocationInWindow(point)
                devtoolsImageRect = android.graphics.RectF((point[0]-origin[0])/density, (point[1]-origin[1])/density, view.width/density, view.height/density)
            } finally { bitmap.recycle() }
        }
        require(offset >= 0 && offset < devtoolsImage.length) { "INVALID_CAPTURE_OFFSET" }
        val end = minOf(offset + 24000, devtoolsImage.length)
        return JSONObject().put("chunk", devtoolsImage.substring(offset,end)).put("next", if (end < devtoolsImage.length) end else 0)
            .put("ox", devtoolsImageRect.left).put("oy", devtoolsImageRect.top).put("ow", devtoolsImageRect.right).put("oh", devtoolsImageRect.bottom)
    }
    // ANSERONUI_DEVTOOLS_END

    /** The first surface child's target background, after a successful commit. */
    var onPageBackgroundColor: ((Int) -> Unit)? = null
    private val topology = RenderTopology()
    private var lastCommands = ""
    private val nodes = mutableMapOf<Long, NodeRecord>()
    private val recordsByView = java.util.IdentityHashMap<View, NodeRecord>()
    private val textPool = java.util.ArrayDeque<TextView>()
    private val textMeasurements = object : android.util.LruCache<String, TextSize>(128 * 1024) {
        override fun sizeOf(key: String, value: TextSize) = key.length * 2 + 24
    }
    private var revision = 0L
    private val density get() = root.resources.displayMetrics.density
    private data class TouchSession(val target: Long, val owner: Long?, val startX: Float, val startY: Float,
        val allowX: Boolean, val allowY: Boolean, var x: Float, var y: Float, var axis: String? = null, var cancelled: Boolean = false)
    private val sessions = mutableMapOf<Int, TouchSession>()
    private var backdropTarget: View? = null
    private var backdropReached = false
    private fun drawBackdrop(canvas: Canvas, record: NodeRecord, drawingTime: Long) {
        val view = record.view
        val radius = record.resolvedProps?.optDouble("backgroundBlurRadius", 0.0) ?: 0.0
        if (radius <= 0 || view.width <= 0 || view.height <= 0 || view.alpha <= 0 || view.visibility != View.VISIBLE) return
        if (android.os.Build.VERSION.SDK_INT >= 31 && canvas.isHardwareAccelerated) {
            val blur = record.backdropBlur ?: BackdropBlur().also { record.backdropBlur = it }
            val saved = canvas.save()
            try {
                canvas.translate((view.left - (view.parent as View).scrollX).toFloat(), (view.top - (view.parent as View).scrollY).toFloat())
                canvas.concat(view.matrix)
                if (canvas.quickReject(0f, 0f, view.width.toFloat(), view.height.toFloat(), Canvas.EdgeType.AA)) return
                val corner = ((record.animation.current["borderRadius"] ?: 0.0).coerceAtLeast(0.0) * density).toFloat()
                canvas.clipPath(android.graphics.Path().apply { addRoundRect(RectF(0f, 0f, view.width.toFloat(), view.height.toFloat()), corner, corner, android.graphics.Path.Direction.CW) })
                blur.drawHardware(canvas, (radius * density).toFloat(), view.width, view.height, view.alpha) { output ->
                    recordBackdrop(output, view, drawingTime)
                }
            } finally { canvas.restoreToCount(saved) }
            return
        }
        // Sample only pixels behind this node. Never include its own content or
        // following siblings, and keep the temporary bitmap downsampled/bounded.
        val sample = max(4f, max(view.width, view.height) / 256f)
        val padding = min(32f, (radius * density / sample).toFloat() * 2).roundToInt()
        val width = (view.width / sample).roundToInt().coerceAtLeast(1) + padding * 2
        val height = (view.height / sample).roundToInt().coerceAtLeast(1) + padding * 2
        val blur = record.backdropBlur ?: BackdropBlur().also { record.backdropBlur = it }
        val capture = blur.beginCapture(width, height)
        val targetPosition = IntArray(2); val origin = IntArray(2)
        view.getLocationInWindow(targetPosition); surface.getLocationInWindow(origin)
        capture.translate(padding.toFloat(), padding.toFloat())
        capture.scale(1 / sample, 1 / sample)
        capture.translate((origin[0] - targetPosition[0]).toFloat(), (origin[1] - targetPosition[1]).toFloat())
        backdropTarget = view; backdropReached = false
        try { surface.draw(capture) } finally { backdropTarget = null; backdropReached = false }
        val saved = canvas.save()
        canvas.translate((view.left - (view.parent as View).scrollX).toFloat(), (view.top - (view.parent as View).scrollY).toFloat())
        canvas.concat(view.matrix)
        val bounds = RectF(0f, 0f, view.width.toFloat(), view.height.toFloat())
        val corner = ((record.animation.current["borderRadius"] ?: 0.0).coerceAtLeast(0.0) * density).toFloat()
        canvas.clipPath(android.graphics.Path().apply { addRoundRect(bounds, corner, corner, android.graphics.Path.Direction.CW) })
        blur.draw(canvas, (radius * density / sample).toFloat().coerceIn(0.01f, 25f), RectF(-padding * sample, -padding * sample, (width - padding) * sample, (height - padding) * sample), view.alpha)
        canvas.restoreToCount(saved)
    }

    /** Record only ancestor backgrounds and earlier siblings as cached GPU display lists.
     * Never call surface.draw here: that rasterizes the whole tree once per glass node. */
    private fun recordBackdrop(canvas: Canvas, target: View, drawingTime: Long) {
        val path = mutableListOf<View>(target)
        while (path.last() !== surface) {
            val parent = path.last().parent as? View ?: return
            path.add(parent)
        }
        path.reverse()
        val matrix = android.graphics.Matrix()
        surface.transformMatrixToGlobal(matrix)
        target.transformMatrixToLocal(matrix)
        canvas.concat(matrix)
        for (i in 0 until path.lastIndex) {
            val parent = path[i] as? ViewGroup ?: return
            val next = path[i + 1]
            parent.background?.draw(canvas)
            if (parent.clipChildren) canvas.clipRect(0, 0, parent.width, parent.height)
            canvas.translate(-parent.scrollX.toFloat(), -parent.scrollY.toFloat())
            if (parent is ShadowLayout) parent.drawBefore(canvas, next, drawingTime)
            canvas.translate(next.left.toFloat(), next.top.toFloat())
            canvas.concat(next.matrix)
        }
    }

    private inner open class ShadowLayout : FrameLayout(root.context) {
        init { clipChildren = false; clipToPadding = false }
        fun drawBefore(canvas: Canvas, target: View, drawingTime: Long) {
            for (i in 0 until indexOfChild(target)) {
                val child = getChildAt(i)
                if (child.visibility != View.VISIBLE) continue
                super.drawChild(canvas, child, drawingTime)
            }
        }
        override fun drawChild(canvas: Canvas, child: View, drawingTime: Long): Boolean {
            if (backdropTarget != null) {
                if (child === backdropTarget) backdropReached = true
                if (backdropReached) return false
            } else recordsByView[child]?.let { drawBackdrop(canvas, it, drawingTime); drawShadow(canvas, it) }
            return super.drawChild(canvas, child, drawingTime)
        }
    }
    private val surface = object : ShadowLayout() {
        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            receiveTouch(event)
            val handled = super.dispatchTouchEvent(event)
            // Retain a stream even when a plain View has no native touch handler.
            return handled || sessions.isNotEmpty() || event.actionMasked == MotionEvent.ACTION_UP
        }
    }
    init { root.addView(surface, FrameLayout.LayoutParams(-1, -1)) }

    private fun isDark() = root.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    private fun themed(raw: JSONObject): JSONObject {
        if (!isDark()) return raw
        val props = JSONObject()
        raw.keys().forEach { key -> props.put(key, raw.get(key)) }
        for (key in listOf("backgroundColor", "color", "borderColor", "shadowColor", "placeholderTextColor", "src")) {
            val dm = "dm" + key.replaceFirstChar { it.uppercaseChar() }
            if (raw.has(dm)) props.put(key, raw.get(dm))
        }
        if (raw.has("spans")) {
            val spans = richTextSpans(raw)
            for (i in 0 until spans.length()) spans.optJSONObject(i)?.let { if (it.has("dmColor")) it.put("color", it.get("dmColor")) }
            props.put("spans", spans.toString())
        }
        return props
    }

    /** Reapply only visual declarations: never replay media/native commands or controlled input. */
    fun appearanceChanged() {
        textMeasurements.evictAll()
        nodes.values.forEach { record -> record.declaredProps?.let { setProps(record, it, true); record.animation.setActive(pageActive); record.animation.commit() } }
        val page = surface.getChildAt(0)
        onPageBackgroundColor?.invoke(topology.rootId()?.let { nodes[it] }?.pageBackgroundColor ?: Color.TRANSPARENT)
        surface.invalidate()
    }

    // Rasterize only the outer shadow on a software bitmap, then composite with the normal
    // hardware view tree. Drawing in the parent avoids clipping a view's own outer shadow.
    private fun drawShadow(canvas: Canvas, record: NodeRecord) {
        val view = record.view
        val props = record.resolvedProps ?: return
        val opacity = props.optDouble("shadowOpacity", 0.0).coerceIn(0.0, 1.0)
        if (opacity == 0.0 || view.visibility != View.VISIBLE || view.width <= 0 || view.height <= 0) return
        val radius = (props.optDouble("shadowRadius", 0.0) * density).toFloat().coerceAtLeast(0f)
        val dx = (props.optDouble("shadowOffsetX", 0.0) * density).toFloat()
        val dy = (props.optDouble("shadowOffsetY", 0.0) * density).toFloat()
        val corner = (record.animation.current["borderRadius"] ?: 0.0).toFloat() * density
        val color = parseColor(props.optString("shadowColor", "#000000"), Color.BLACK)
        val tint = Color.argb((Color.alpha(color) * opacity).roundToInt(), Color.red(color), Color.green(color), Color.blue(color))
        val key = "${view.width}/${view.height}/$radius/$dx/$dy/$corner/$tint"
        if (record.shadowKey != key) {
            val padding = kotlin.math.ceil(radius * 3 + max(kotlin.math.abs(dx), kotlin.math.abs(dy)) + 1).toInt()
            val width = view.width.toLong() + padding * 2L; val height = view.height.toLong() + padding * 2L
            // Avoid unbounded allocations for pathological values or very large surfaces.
            if (width > 8192 || height > 8192 || width * height > 16_777_216) return
            val bitmap = Bitmap.createBitmap(width.toInt(), height.toInt(), Bitmap.Config.ARGB_8888)
            val output = Canvas(bitmap)
            val rect = RectF(padding.toFloat(), padding.toFloat(), padding + view.width.toFloat(), padding + view.height.toFloat())
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = Color.BLACK; setShadowLayer(max(0.001f, radius), dx, dy, tint) }
            output.drawRoundRect(rect, corner, corner, paint)
            paint.clearShadowLayer(); paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
            output.drawRoundRect(rect, corner, corner, paint)
            record.shadowBitmap = bitmap; record.shadowPadding = padding; record.shadowKey = key
        }
        val bitmap = record.shadowBitmap ?: return
        val saved = canvas.save()
        canvas.translate(view.left.toFloat(), view.top.toFloat()); canvas.concat(view.matrix)
        canvas.drawBitmap(bitmap, -record.shadowPadding.toFloat(), -record.shadowPadding.toFloat(), Paint().apply { alpha = (255 * view.alpha).roundToInt() })
        canvas.restoreToCount(saved)
    }

    private inner class TouchScrollView : ScrollView(root.context) {
        private val flingScroller = android.widget.OverScroller(context)
        private var flingAdjustment = 0
        private var anchorValue = 0
        private var anchorPixels = 0
        var appliedAnchorPixels = 0
            private set
        private var anchors = emptyList<Pair<View, Double>>()
        var anchorsEnabled = false
        fun captureAnchor() {
            if (!anchorsEnabled) return
            val document = (getChildAt(0) as? ViewGroup)?.getChildAt(0) as? ViewGroup ?: return
            anchors = (0 until document.childCount).map { document.getChildAt(it) }
                .filter { it.bottom > scrollY && it.top < scrollY + height }
                .sortedBy { it.top }.map { child -> child to (recordsByView[child]?.animation?.declared?.get("y") ?: child.top / density.toDouble()) }
        }
        fun reconcileAnchor(proposedPixels: Int) {
            // Core may be a few frames behind the native fling. Anchor the row
            // actually visible now, rather than its last reported viewport.
            val retained = anchors.firstOrNull { (child, _) -> recordsByView.containsKey(child) }
            if (retained != null) {
                val top = recordsByView.getValue(retained.first).animation.declared["y"] ?: retained.second
                anchorPixels += ((top - retained.second) * density).roundToInt() - proposedPixels
            }
            anchors = emptyList()
        }
        fun pendingAnchor(): Int = anchorPixels
        fun stageAnchor(value: Double) {
            val pixels = (value * density).roundToInt()
            anchorPixels += pixels - anchorValue
            anchorValue = pixels
            if (anchorPixels != 0) requestLayout()
        }
        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val previous = scrollY
            super.onLayout(changed, l, t, r, b)
            if (anchorPixels != 0) {
                val delta = anchorPixels; anchorPixels = 0
                // Change the viewport and row frames in the same layout pass.
                // Shift the fling's coordinate origin, preserving its velocity.
                flingAdjustment += delta
                appliedAnchorPixels += delta
                super.scrollTo(scrollX, previous + delta)
            }
        }
        override fun fling(velocityY: Int) {
            flingAdjustment = 0
            flingScroller.fling(scrollX, scrollY, 0, velocityY, 0, 0, 0,
                max(0, (getChildAt(0)?.height ?: 0) - height), 0, 0)
            postInvalidateOnAnimation()
        }
        override fun computeScroll() {
            if (flingScroller.computeScrollOffset()) {
                val desired = flingScroller.currY + flingAdjustment
                var next = desired
                if (anchorsEnabled) {
                    val document = (getChildAt(0) as? ViewGroup)?.getChildAt(0) as? ViewGroup
                    if (document != null && document.childCount > 0) {
                        var first = Int.MAX_VALUE; var last = 0
                        for (index in 0 until document.childCount) {
                            val row = document.getChildAt(index)
                            first = min(first, row.top); last = max(last, row.bottom)
                        }
                        val delta = desired - scrollY
                        // Preserve Android's velocity/deceleration until the
                        // mounted window is actually exhausted. Scaling every
                        // frame by runway made even a fully covered fling lag.
                        // Discard only travel beyond the window, so a delayed
                        // commit cannot release an accumulated catch-up jump.
                        if (delta != 0) {
                            next = if (delta > 0) min(desired, max(scrollY, last - height))
                                else max(desired, min(scrollY, first))
                            flingAdjustment += next - desired
                        }
                    }
                }
                super.scrollTo(flingScroller.currX, next)
                postInvalidateOnAnimation()
            } else super.computeScroll()
        }
        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (event.actionMasked == MotionEvent.ACTION_DOWN) flingScroller.abortAnimation()
            return super.onTouchEvent(event)
        }
        fun stopFling() { flingScroller.abortAnimation() }
        override fun dispatchDraw(canvas: Canvas) {
            // Shared View parents permit overflow for shadows. ScrollView's
            // child is the full document, so clipChildren alone does not bound
            // it to this viewport when the parent does not clip this view.
            val saved = canvas.save()
            canvas.clipRect(scrollX, scrollY, scrollX + width, scrollY + height)
            super.dispatchDraw(canvas)
            canvas.restoreToCount(saved)
        }
        override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
            if (event.actionMasked == MotionEvent.ACTION_DOWN && !flingScroller.isFinished) {
                flingScroller.abortAnimation()
                super.onInterceptTouchEvent(event)
                return true
            }
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
                val record = recordsByView[ancestor]
                if (record != null) {
                    if (owner == null && record.events.any { it in setOf("touchDown", "touchMove", "touchUp", "touchCancel") }) owner = record.nodeId
                    if (!policyComplete) {
                        allowX = allowX && record.touchAction != "none" && record.touchAction != "pan-y"
                        allowY = allowY && record.touchAction != "none" && record.touchAction != "pan-x"
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

    fun applyJson(payload: String) = applyCommit(JSONObject(payload))

    internal fun applyCommit(commit: JSONObject) {
        require(Looper.myLooper() == Looper.getMainLooper()) { "Renderer must run on the UI thread" }
        require(commit.getString("type") == "Commit") { "Invalid commit" }
        val next = commit.getLong("revision")
        val signature = commit.getJSONArray("commands").toString()
        if (next == revision) { require(signature == lastCommands) { "CONFLICTING_COMMIT" }; return }
        require(next > revision && next <= 0xffffffffL) { "Invalid revision" }
        val commands = commit.getJSONArray("commands")
        require(commands.length() <= 65536) { "Too many commands" }
        validate(commands)
        val publishTopology = topology.prepare(commands)
        try {
            val geometryChanged = (0 until commands.length()).any { val c = commands.getJSONObject(it); c.getString("type") in setOf("CreateNode", "RemoveNode", "InsertChild", "MoveChild", "DetachChild", "SetFrame") || c.optJSONObject("set")?.has("scrollAnchorOffset") == true }
            val affected = mutableSetOf<Long>()
            fun collectAncestors() {
                for (i in 0 until commands.length()) {
                    val c = commands.getJSONObject(i)
                    affected.addAll(topology.ancestors(c.getLong("nodeId")))
                    if (c.has("parentId")) affected.addAll(topology.ancestors(c.getLong("parentId")))
                }
            }
            if (geometryChanged) collectAncestors()
            val scrollAnchors = affected.mapNotNull { nodes[it]?.view as? TouchScrollView }
            val pendingAnchors = scrollAnchors.associateWith { it.pendingAnchor() }
            scrollAnchors.forEach { it.captureAnchor() }
            for (i in 0 until commands.length()) applyOne(commands.getJSONObject(i))
            scrollAnchors.forEach { it.reconcileAnchor(it.pendingAnchor() - pendingAnchors.getValue(it)) }
            val touched = (0 until commands.length()).mapNotNull { nodes[commands.getJSONObject(it).getLong("nodeId")] }.toSet()
            touched.forEach { it.animation.setActive(pageActive); it.animation.commit() }
            publishTopology(); lastCommands = signature; revision = next
            if (!pageActive) for (record in touched) {
                val video = record.view as? AndroidVideoView ?: continue
                if (video.player.isPlaying) { resumeVideos.add(video); video.player.pause() }
            }
            if (geometryChanged) { collectAncestors(); updateScrollExtents(affected) }
            if (geometryChanged || (0 until commands.length()).any { commands.getJSONObject(it).optJSONObject("set")?.has("backgroundColor") == true }) {
            val page = surface.getChildAt(0)
            onPageBackgroundColor?.invoke(topology.rootId()?.let { nodes[it] }?.pageBackgroundColor ?: Color.TRANSPARENT)
            }
        } catch (error: Exception) {
            clear()
            throw error
        }
    }

    fun clear() {
        topology.clear(); lastCommands = ""
        sessions.clear(); textMeasurements.evictAll()
        val records = nodes.values.toList(); nodes.clear(); recordsByView.clear(); textPool.clear(); revision = 0L
        records.forEach { cleanup { releaseNode(it) } }
        cleanup { surface.removeAllViews() }
    }
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
        if (method == "accessibilityAnnounce") {
            val message = (args as? JSONObject)?.opt("message") as? String ?: error("INVALID_ACCESSIBILITY_MESSAGE")
            require(message.isNotEmpty() && message.length <= 16384) { "INVALID_ACCESSIBILITY_MESSAGE" }
            record.view.announceForAccessibility(message); complete(Result.success(null)); return null
        }
        if (method == "accessibilityFocus") {
            require(record.view.importantForAccessibility != View.IMPORTANT_FOR_ACCESSIBILITY_NO && record.view.importantForAccessibility != View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) { "NOT_ACCESSIBLE" }
            var ancestor: View? = record.view
            while (ancestor != null) {
                require(ancestor.importantForAccessibility != View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS && ancestor.visibility == View.VISIBLE) { "NOT_ACCESSIBLE" }
                ancestor = ancestor.parent as? View
            }
            record.view.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
            complete(Result.success(null)); return null
        }
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
            (view as? TouchScrollView)?.stopFling()
            if (args.optBoolean("animated")) view.smoothScrollTo((x*density).roundToInt(), (y*density).roundToInt())
            else view.scrollTo((x*density).roundToInt(), (y*density).roundToInt())
        } else error("UNSUPPORTED_VIEW_METHOD: $method")
        complete(Result.success(null)); return null
    }

    fun viewFor(nodeId: Long): View? = nodes[nodeId]?.view

    private fun themeColor(attribute: Int, fallback: Int): Int {
        val value = TypedValue()
        return if (root.context.theme.resolveAttribute(attribute, value, true)) {
            if (value.resourceId != 0) runCatching { root.context.getColor(value.resourceId) }.getOrDefault(fallback)
            else value.data
        } else fallback
    }

    /** Call on the UI thread; real controls measure their own text and padding. */
    fun measure(kind: String, text: String, fontSize: Float, maxWidth: Float, props: JSONObject? = null): TextSize {
        require(Looper.myLooper() == Looper.getMainLooper()) { "Measurement must run on the UI thread" }
        require(fontSize.isFinite() && fontSize >= 0 && maxWidth.isFinite() && maxWidth >= 0)
        val cacheKey = JSONArray().put(kind).put(text).put(fontSize.toDouble()).put(maxWidth.toDouble())
            .put(density.toDouble()).put(root.resources.configuration.fontScale.toDouble()).put(props?.toString()).toString()
        textMeasurements.get(cacheKey)?.let { return it }
        val view: TextView = when (kind) {
            "Text", "RichText" -> TextView(root.context)
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
        val result = TextSize(min(maxWidth, kotlin.math.ceil(view.measuredWidth / density)), kotlin.math.ceil(view.measuredHeight / density), view.baseline / density)
        if (cacheKey.length <= 4096) textMeasurements.put(cacheKey, result)
        return result
    }

    private fun validate(commands: JSONArray) {
        val added = mutableSetOf<Long>(); val removed = mutableSetOf<Long>()
        fun known(id: Long): Boolean = id !in removed && (id in added || nodes.containsKey(id))
        for (i in 0 until commands.length()) {
            val command = commands.getJSONObject(i)
            val id = command.getLong("nodeId")
            require(id in 1..0xffffffffL) { "Invalid node ID" }
            when (command.getString("type")) {
                "CreateNode" -> {
                    require(!known(id) && command.getString("kind") in setOf("View", "Text", "RichText", "TextInput", "ScrollView", "Image", "Video", "Native"))
                    added.add(id)
                }
                "InsertChild", "MoveChild" -> {
                    val parent = command.getLong("parentId")
                    require(known(id) && (parent == 0L || known(parent)) && parent != id && command.getInt("index") >= 0)
                }
                "RemoveNode" -> require(known(id)).also { removed.add(id) }
                "DetachChild" -> require(known(id))
                "PatchProps" -> {
                    require(known(id) && command.has("set") && command.has("unset"))
                    val set = command.getJSONObject("set"); val unset = command.getJSONArray("unset")
                    require(set.has("value") == set.has("inputRevision"))
                    require((0 until unset.length()).all { !set.has(unset.getString(it)) })
                }
                "SetProps" -> require(known(id) && command.has("props"))
                "SetFrame" -> {
                    require(known(id))
                    val frame = command.getJSONObject("frame")
                    require((0..3).all { n -> frame.getDouble(arrayOf("x", "y", "width", "height")[n]).isFinite() })
                    require(frame.getDouble("width") >= 0 && frame.getDouble("height") >= 0)
                }
                "BindEvent" -> require(known(id) && command.getString("event") in setOf("tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay", "nativeComponent") && command.has("enabled"))
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
                "View" -> { view = ShadowLayout(); content = view }
                "Text" -> { view = textPool.pollFirst() ?: TextView(root.context); content = null }
                "RichText" -> { view = TextView(root.context); content = null }
                "TextInput" -> { view = EditText(root.context); content = null }
                "ScrollView" -> {
                    val scroll = TouchScrollView().apply { isFillViewport = true }
                    val inner = ShadowLayout()
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
            val record = NodeRecord(view, content, kind, id)
            record.native = native
            nodes[id] = record
            recordsByView[view] = record
            val sharedInteraction = kind in setOf("View", "Text", "RichText", "ScrollView", "Image")
            if (sharedInteraction) {
                // A shared touch owner must also retain Android's native stream.
                // Otherwise a non-clickable overlay rejects DOWN and ViewGroup
                // tries the next sibling (possibly the page's ScrollView).
                // Keep native click/long-press behavior and let ancestor scroll
                // views arbitrate touchAction through onInterceptTouchEvent.
                var retainsTouch = false
                view.setOnTouchListener { target, event ->
                    if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                        retainsTouch = sessions.values.any { it.owner == id }
                    }
                    val retain = retainsTouch
                    if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) retainsTouch = false
                    if (retain) { target.onTouchEvent(event); true } else false
                }
                view.setOnClickListener {
                    if (view.isEnabled && "tap" in record.events) onEvent?.invoke(RendererEvent("Tap", id, revision))
                }
                // A label without a tap handler must let its parent receive the click.
                view.isClickable = false
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
            if (sharedInteraction) {
                view.setOnLongClickListener {
                    val enabled = view.isEnabled && "longPress" in record.events
                    if (enabled) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = "longPress"))
                    enabled
                }
                view.isLongClickable = false
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
                    if (event in record.events) onEvent?.invoke(RendererEvent("NativeEvent", id, revision, event = event, x = x.toDouble() / density, y = y.toDouble() / density, scrollAdjustment = (scroll as? TouchScrollView)?.appliedAnchorPixels?.div(density.toDouble()), contentWidth = (record.content?.width ?: scroll.width).toDouble() / density, contentHeight = (record.content?.height ?: scroll.height).toDouble() / density))
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
                            if (nodes[id] !== record || !view.prepared || !pageActive) return
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
                val retired = subtree.mapNotNull { recordsByView[it] }
                retired.forEach { releaseNode(it) }
                retired.forEach { nodes.remove(it.nodeId) }
                subtree.forEach { recordsByView.remove(it) }
                (record.view.parent as? ViewGroup)?.removeView(record.view)
                retired.forEach { recycleLeaf(it) }
            }
            "InsertChild", "MoveChild" -> {
                val parentId = command.getLong("parentId")
                val target = if (parentId == 0L) surface else nodes[parentId]?.content ?: error("Invalid parent")
                val index = min(command.getInt("index"), target.childCount - if (record.view.parent === target) 1 else 0)
                val current = record.view.parent as? ViewGroup
                if (current !== target || target.indexOfChild(record.view) != index) {
                    current?.removeView(record.view)
                    target.addView(record.view, index)
                }
            }
            "DetachChild" -> (record.view.parent as? ViewGroup)?.removeView(record.view)
            "PatchProps" -> {
                val props = JSONObject((record.declaredProps ?: JSONObject()).toString())
                val set = command.getJSONObject("set"); val unset = command.getJSONArray("unset")
                set.keys().forEach { props.put(it, set.get(it)) }
                for (i in 0 until unset.length()) props.remove(unset.getString(i))
                val changed = set.keys().asSequence().toSet() + (0 until unset.length()).map { unset.getString(it) }
                val visual = setOf("opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius")
                if (changed.all { it in visual }) {
                    record.declaredProps = props; record.resolvedProps = themed(props)
                    record.animation.stage(changed.associateWith { props.optDouble(it, NodeAnimation.defaults[it] ?: 0.0) })
                } else setProps(record, props, changed = changed)
            }
            "SetProps" -> setProps(record, command.getJSONObject("props"))
            "SetFrame" -> {
                val frame = command.getJSONObject("frame")
                record.animation.stage(listOf("x","y","width","height").associateWith { frame.getDouble(it) })
                // Core dispatches the committed layout after CommitAck.
            }
            "BindEvent" -> {
                val event = command.getString("event")
                val enabled = command.getBoolean("enabled")
                if (enabled) record.events.add(event) else record.events.remove(event)
                updateAccessibility(record)
                if (record.kind in setOf("View", "Text", "RichText", "ScrollView", "Image")) {
                    if (event == "tap") record.view.isClickable = enabled
                    if (event == "longPress") record.view.isLongClickable = enabled
                }
            }
            else -> error("Unknown command")
        }
    }

    private fun updateAccessibility(record: NodeRecord) {
        val p = record.declaredProps ?: return
        val view = record.view
        val overrides = p.keys().asSequence().any { it == "accessible" || it.startsWith("accessibility") }
        // Native extensions own their default delegate and virtual accessibility tree.
        if (record.kind == "Native" && !overrides) {
            if (record.accessibilityOverridden) {
                view.accessibilityDelegate = record.defaultAccessibilityDelegate
                view.importantForAccessibility = record.defaultAccessibilityImportance
            }
            record.accessibilityOverridden = false
            return
        }
        record.accessibilityOverridden = true
        val role = p.optString("accessibilityRole")
        val excluded = role == "none" || (p.has("accessible") && !p.optBoolean("accessible"))
        val explicit = p.optBoolean("accessible") || role.isNotEmpty() || p.has("accessibilityLabel")
        view.contentDescription = if (excluded) null else p.optString("accessibilityLabel").takeIf { it.isNotEmpty() }
        view.importantForAccessibility = when {
            p.optBoolean("accessibilityHidden") -> View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            excluded -> View.IMPORTANT_FOR_ACCESSIBILITY_NO
            explicit -> View.IMPORTANT_FOR_ACCESSIBILITY_YES
            else -> record.defaultAccessibilityImportance
        }
        if (record.kind == "View") view.isFocusable = !excluded && (explicit || record.events.contains("tap") || record.events.contains("longPress"))
        if (android.os.Build.VERSION.SDK_INT >= 28) view.isScreenReaderFocusable = !excluded && (p.optBoolean("accessible") || role.isNotEmpty())
        view.isSelected = p.optBoolean("accessibilitySelected")
        view.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = when (role) {
                    "button" -> "android.widget.Button"
                    "text" -> "android.widget.TextView"
                    "image" -> "android.widget.ImageView"
                    "checkbox" -> "android.widget.CheckBox"
                    "search" -> "android.widget.EditText"
                    else -> info.className
                }
                info.isCheckable = role == "checkbox"
                info.isChecked = p.optBoolean("accessibilityChecked")
                info.isSelected = p.optBoolean("accessibilitySelected")
                if (p.has("accessibilityHint")) info.hintText = p.optString("accessibilityHint")
                if (android.os.Build.VERSION.SDK_INT >= 30) info.stateDescription = p.optString("accessibilityValue").takeIf { it.isNotEmpty() }
                else if (p.has("accessibilityValue")) info.contentDescription = listOfNotNull(view.contentDescription, p.optString("accessibilityValue")).joinToString(", ")
                if (p.has("accessibilityClickable")) {
                    info.isClickable = p.optBoolean("accessibilityClickable")
                    if (!info.isClickable) info.removeAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)
                    else info.addAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)
                }
                if (p.has("accessibilityLongClickable")) {
                    info.isLongClickable = p.optBoolean("accessibilityLongClickable")
                    if (!info.isLongClickable) info.removeAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_LONG_CLICK)
                    else info.addAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_LONG_CLICK)
                }
            }
            override fun performAccessibilityAction(host: View, action: Int, args: android.os.Bundle?): Boolean {
                if (action == android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK && (!host.isEnabled || !p.optBoolean("accessibilityClickable", true))) return false
                if (action == android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK && (!host.isEnabled || !p.optBoolean("accessibilityLongClickable", true))) return false
                return super.performAccessibilityAction(host, action, args)
            }
        }
    }

    private fun setProps(record: NodeRecord, raw: JSONObject, appearanceOnly: Boolean = false, changed: Set<String>? = null) {
        fun affects(vararg fields: String): Boolean = changed == null || fields.any { it in changed }
        record.declaredProps = raw // Commit payloads are immutable after handoff to the UI thread.
        var props = themed(raw)
        if (record.kind == "View" && props.optBoolean("glassEffect") && !props.optBoolean("glassEffectContainer")) {
            props = JSONObject(props.toString())
            if (!props.has("backgroundColor")) props.put("backgroundColor", if (isDark()) "#20242bcc" else "#f2f5facc")
            if (!props.has("opacity")) props.put("opacity", 0.88)
            if (!props.has("backgroundBlurRadius")) props.put("backgroundBlurRadius", if (android.os.Build.VERSION.SDK_INT < 31) 0.0 else if (props.optString("glassEffectStyle") == "clear") 12.0 else 20.0)
        }
        record.resolvedProps = props
        if (props.optDouble("backgroundBlurRadius", 0.0) <= 0) {
            record.backdropBlur?.clear(); record.backdropBlur = null
        }
        if (!appearanceOnly && affects("nativeProps")) record.native?.setProps(JSONObject(props.optString("nativeProps", "{}")))
        if (affects("touchAction")) { record.touchAction = props.optString("touchAction", "auto") }
        val view = record.view
        if (affects("animation")) { record.animation.options = if (props.has("animation")) AnimationOptions(JSONObject(props.getString("animation"))) else null }
        if (affects("opacity", "translateX", "translateY", "scaleX", "scaleY", "rotate", "borderRadius", "backgroundColor", "dmBackgroundColor", "glassEffect", "glassEffectStyle", "glassEffectContainer")) {
        val color = parseColor(props.optString("backgroundColor", ""), Color.TRANSPARENT)
        record.pageBackgroundColor = color
        val visual = NodeAnimation.defaults.toMutableMap()
        for (key in listOf("opacity","translateX","translateY","scaleX","scaleY","rotate","borderRadius")) if (props.has(key)) visual[key] = props.getDouble(key)
        visual.putAll(mapOf("r" to Color.red(color).toDouble(), "g" to Color.green(color).toDouble(), "b" to Color.blue(color).toDouble(), "a" to Color.alpha(color)/255.0))
        record.animation.stage(visual)
        }
        if (affects("testID")) { view.transitionName = props.optString("testID").takeIf { it.isNotEmpty() } }
        if (affects("editable","disabled")) { view.isEnabled = props.optBoolean("editable", true) && !props.optBoolean("disabled", false) }
        if (affects("accessible","accessibilityRole","accessibilityLabel","accessibilityHint","accessibilityValue","accessibilityHidden","accessibilityChecked","accessibilitySelected","accessibilityClickable","accessibilityLongClickable","disabled")) { updateAccessibility(record) }
        if (affects("visibility")) { view.visibility = if (props.optString("visibility") == "hidden") View.INVISIBLE else View.VISIBLE }
        val background = view.background as? GradientDrawable ?: GradientDrawable().also { view.background = it }
        if (affects("borderWidth","borderColor","dmBorderColor")) { background.setStroke((props.optDouble("borderWidth", 0.0) * density).roundToInt(), parseColor(props.optString("borderColor", ""), Color.TRANSPARENT)) }
        if (affects("overflow")) { view.clipToOutline = props.optString("overflow") == "hidden" }
        if (affects("overflow")) { if (view is ShadowLayout) view.clipChildren = props.optString("overflow") == "hidden" }
        (view.parent as? View)?.invalidate()
        if (view is TextView && affects("text", "spans", "fontSize", "fontWeight", "fontStyle", "color", "dmColor", "textAlign", "numberOfLines", "ellipsizeMode", "lineHeight", "textDecorationLine", "value", "inputRevision", "placeholder", "placeholderTextColor", "dmPlaceholderTextColor", "editable", "secureTextEntry", "keyboardType", "returnKeyType", "autoCapitalize", "autoCorrect", "maxLength")) {
            view.textSize = props.optDouble("fontSize", 16.0).toFloat()
            view.setTextColor(parseColor(props.optString("color", ""), themeColor(android.R.attr.textColorPrimary, Color.BLACK)))
            view.typeface = android.graphics.Typeface.create(view.typeface, (if (props.optString("fontWeight") == "bold") android.graphics.Typeface.BOLD else 0) or (if (props.optString("fontStyle") == "italic") android.graphics.Typeface.ITALIC else 0))
            view.gravity = when (props.optString("textAlign")) { "center" -> android.view.Gravity.CENTER_HORIZONTAL; "right" -> android.view.Gravity.RIGHT; else -> android.view.Gravity.LEFT }
            if (affects("numberOfLines", "ellipsizeMode")) { view.maxLines = props.optInt("numberOfLines", Int.MAX_VALUE).takeIf { it > 0 } ?: Int.MAX_VALUE; view.ellipsize = if (props.optString("ellipsizeMode") == "clip") null else android.text.TextUtils.TruncateAt.END }
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
                "TextInput" -> {
                    val input = view as EditText
                    input.setPadding(0, 0, 0, 0)
                    input.hint = props.optString("placeholder", "")
                    input.setHintTextColor(parseColor(props.optString("placeholderTextColor", ""), themeColor(android.R.attr.textColorHint, Color.GRAY)))
                    if (!appearanceOnly) {
                        if (affects("editable")) input.isEnabled = props.optBoolean("editable", true)
                        if (affects("keyboardType", "secureTextEntry")) input.isSingleLine = true
                        if (affects("keyboardType", "secureTextEntry")) input.inputType = if (props.optBoolean("secureTextEntry")) android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD else when (props.optString("keyboardType")) {
                            "numeric" -> android.text.InputType.TYPE_CLASS_NUMBER
                            "decimal-pad" -> android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_FLAG_DECIMAL
                            "phone-pad" -> android.text.InputType.TYPE_CLASS_PHONE
                            "email-address" -> android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                            else -> android.text.InputType.TYPE_CLASS_TEXT
                        }
                        if (affects("returnKeyType")) input.imeOptions = when (props.optString("returnKeyType")) { "done" -> android.view.inputmethod.EditorInfo.IME_ACTION_DONE; "go" -> android.view.inputmethod.EditorInfo.IME_ACTION_GO; "next" -> android.view.inputmethod.EditorInfo.IME_ACTION_NEXT; "search" -> android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH; "send" -> android.view.inputmethod.EditorInfo.IME_ACTION_SEND; else -> android.view.inputmethod.EditorInfo.IME_ACTION_UNSPECIFIED }
                        val value = props.optString("value", "")
                        if (affects("value", "inputRevision") && props.optLong("inputRevision", 0) >= record.inputRevision && input.text.toString() != value && !hasComposition(input)) {
                            record.applyingValue = true
                            input.setText(value)
                            input.setSelection(value.length)
                            record.applyingValue = false
                        }
                    }
                }
            }
        }
        if (view is TextView && record.kind in setOf("Text", "RichText") && affects("text", "spans", "fontSize", "fontWeight", "fontStyle", "lineHeight", "textAlign", "textDecorationLine")) {
            view.includeFontPadding = !props.has("lineHeight")
            if (props.has("lineHeight")) {
                val text = android.text.SpannableString(view.text)
                val height = (props.getDouble("lineHeight") * density).roundToInt().coerceAtLeast(0)
                text.setSpan(object : android.text.style.LineHeightSpan {
                    override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, v: Int, fm: android.graphics.Paint.FontMetricsInt) {
                        val extra = height - (fm.descent - fm.ascent)
                        fm.ascent -= extra / 2; fm.descent = fm.ascent + height
                        fm.top = fm.ascent; fm.bottom = fm.descent
                    }
                }, 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
                view.text = text
            }
        }
        if (view is ScrollView && affects("scrollAnchorOffset", "scrollEnabled", "showsVerticalScrollIndicator")) {
            if (!appearanceOnly && view is TouchScrollView) {
                view.anchorsEnabled = props.has("scrollAnchorOffset")
                view.stageAnchor(props.optDouble("scrollAnchorOffset", 0.0))
            }
            if (affects("scrollEnabled")) { view.isEnabled = props.optBoolean("scrollEnabled", true) }
            view.isVerticalScrollBarEnabled = props.optBoolean("showsVerticalScrollIndicator", true)
        }
        if (view is ImageView && affects("src", "dmSrc", "placeholderSrc", "resizeMode")) {
            view.scaleType = when (props.optString("resizeMode")) {
                "contain" -> ImageView.ScaleType.FIT_CENTER
                "stretch" -> ImageView.ScaleType.FIT_XY
                else -> ImageView.ScaleType.CENTER_CROP
            }
            val source = props.optString("src", "")
            if (source != record.mediaSource) {
                record.mediaSource = source
                val generation = record.mediaGeneration.incrementAndGet()
                val previousLoads = record.imageLoads.toList(); record.imageLoads.clear(); previousLoads.forEach { cleanup(it) }
                view.setImageDrawable(null)
                val placeholder = props.optString("placeholderSrc", "")
                if (placeholder.isNotEmpty()) record.imageLoads.add(loadBitmap(placeholder) { bitmap, _ -> if (bitmap != null && view.drawable == null && generation == record.mediaGeneration.get()) view.setImageBitmap(bitmap) })
                record.imageLoads.add(loadBitmap(source) { bitmap, error ->
                    if (generation != record.mediaGeneration.get()) return@loadBitmap
                    if (bitmap != null) {
                        view.setImageBitmap(bitmap)
                        emitMedia(record, "loadSuccess", source)
                    } else emitMedia(record, "loadFailure", source, 1)
                })
            }
        }
        if (view is AndroidVideoView && !appearanceOnly && affects("src", "dmSrc", "resizeMode", "controls", "autoplay", "loop", "muted", "rate", "playControl")) {
            val previous = view.props
            view.props = JSONObject(props.toString())
            view.resizeMode = props.optString("resizeMode", "cover")
            if (affects("overflow")) { view.clipToOutline = props.optDouble("borderRadius", 0.0) > 0 }
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
                resumeVideos.remove(view)
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
            "play" -> { if (pageActive) video.start() else resumeVideos.add(view); emitMedia(record, "playStateDidChanged", state = "playing") }
            "pause", "stop" -> {
                resumeVideos.remove(view)
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
        record.shadowBitmap = null
        record.backdropBlur?.clear(); record.backdropBlur = null
        cleanup { record.animation.cancel() }
        record.mediaGeneration.incrementAndGet()
        val loads = record.imageLoads.toList(); record.imageLoads.clear(); loads.forEach { cleanup(it) }
        record.timePoll?.let { root.removeCallbacks(it) }; record.timePoll = null
        (record.view as? AndroidVideoView)?.let {
            resumeVideos.remove(it)
            it.prepared = false; it.mediaPlayer = null
            it.player.setOnPreparedListener(null); it.player.setOnCompletionListener(null)
            it.player.setOnInfoListener(null); it.player.setOnErrorListener(null)
            cleanup { it.player.stopPlayback() }
        }
        val native = record.native; record.native = null; cleanup { native?.dispose() }
    }

    private fun recycleLeaf(record: NodeRecord) {
        // Only stateless controls participate. Inputs, media and native
        // components retain their existing disposal/creation semantics.
        val view = record.view as? TextView ?: return
        if (record.kind != "Text") return
        if (textPool.size >= 64) return
        (view.parent as? ViewGroup)?.removeView(view)
        view.setOnTouchListener(null); view.setOnClickListener(null); view.setOnLongClickListener(null)
        view.isClickable = false; view.isLongClickable = false
        view.isPressed = false; view.isSelected = false; view.clearFocus()
        view.text = ""; view.typeface = record.defaultTypeface
        view.maxLines = Int.MAX_VALUE; view.ellipsize = null
        view.contentDescription = null; view.transitionName = null
        view.importantForAccessibility = record.defaultAccessibilityImportance
        view.accessibilityDelegate = null
        if (android.os.Build.VERSION.SDK_INT >= 28) view.isScreenReaderFocusable = false
        textPool.addLast(view)
    }

    private fun deepestNodeAt(x: Float, y: Float): Pair<Long, NodeRecord>? {
        var target = deepestView(surface, x, y)
        while (target !== surface) {
            val found = recordsByView[target]
            if (found != null) return found.nodeId to found
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

    private fun loadBitmap(source: String, complete: (android.graphics.Bitmap?, Throwable?) -> Unit): () -> Unit {
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
        val stream = java.util.concurrent.atomic.AtomicReference<java.io.InputStream?>()
        val connection = java.util.concurrent.atomic.AtomicReference<java.net.HttpURLConnection?>()
        val worker = Thread {
            try {
                if (cancelled.get()) return@Thread
                val input = if (source.startsWith("asset://") && Regex("[A-Za-z0-9_.-]+").matches(source.removePrefix("asset://"))) root.context.assets.open(source.removePrefix("asset://"))
                    else if (source.startsWith("http://") || source.startsWith("https://")) {
                        val request = URL(source).openConnection() as java.net.HttpURLConnection
                        request.connectTimeout = 15000; request.readTimeout = 15000; connection.set(request)
                        if (cancelled.get()) { request.disconnect(); return@Thread }
                        request.inputStream
                    } else java.io.File(URI(source)).inputStream()
                stream.set(input)
                val bitmap = input.use { if (cancelled.get()) null else BitmapFactory.decodeStream(it) }
                root.post { if (!cancelled.get()) complete(bitmap, null) }
            } catch (error: Throwable) { root.post { if (!cancelled.get()) complete(null, error) } }
            finally { stream.set(null); cleanup { connection.getAndSet(null)?.disconnect() } }
        }
        worker.start()
        return {
            cancelled.set(true)
            cleanup { stream.getAndSet(null)?.close() }
            cleanup { connection.getAndSet(null)?.disconnect() }
            worker.interrupt()
        }
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

    private var pageActive = true
    private val resumeVideos = mutableSetOf<AndroidVideoView>()
    fun setPageActive(active: Boolean) {
        if (pageActive == active) return
        pageActive = active
        for (record in nodes.values) {
            record.animation.setActive(active)
            record.timePoll?.let { root.removeCallbacks(it); if (active) root.post(it) }
            val video = record.view as? AndroidVideoView ?: continue
            if (!active && video.player.isPlaying) { resumeVideos.add(video); video.player.pause() }
            else if (active && resumeVideos.remove(video)) video.player.start()
        }
    }

    private fun updateScrollExtents(ids: Set<Long>) {
        for (id in ids) {
            val record = nodes[id] ?: continue
            if (record.view !is ScrollView) continue
            val content = record.content ?: continue
            var width = 0
            var height = 0
            for (i in 0 until content.childCount) {
                val child = content.getChildAt(i)
                val params = child.layoutParams as? FrameLayout.LayoutParams ?: continue
                val model = recordsByView[child]?.animation?.declared
                width = max(width, if (model != null) (((model["x"] ?: 0.0) + (model["width"] ?: 0.0))*density).roundToInt() else params.leftMargin + params.width)
                height = max(height, if (model != null) (((model["y"] ?: 0.0) + (model["height"] ?: 0.0))*density).roundToInt() else params.topMargin + params.height)
            }
            val nextWidth = max(record.view.layoutParams?.width ?: 0, width)
            val nextHeight = max(record.view.layoutParams?.height ?: 0, height)
            if (content.layoutParams?.width != nextWidth || content.layoutParams?.height != nextHeight) {
                content.layoutParams = FrameLayout.LayoutParams(nextWidth, nextHeight)
            }
        }
    }

    private fun parseColor(value: String, fallback: Int): Int = when {
        value == "transparent" -> Color.TRANSPARENT
        Regex("^#[0-9a-fA-F]{6}$").matches(value) -> Color.parseColor(value)
        Regex("^#[0-9a-fA-F]{8}$").matches(value) -> value.substring(1).toLong(16).let { ((it ushr 8) or (it shl 24)).toInt() }
        else -> fallback
    }
}
