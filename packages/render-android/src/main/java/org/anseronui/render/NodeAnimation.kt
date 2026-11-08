package org.anseronui.render

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Choreographer
import android.view.View
import android.widget.FrameLayout
import org.json.JSONObject
import kotlin.math.*

internal class AnimationOptions(value: JSONObject) {
    val duration = number(value, "duration", 300.0)
    val delay = number(value, "delay", 0.0)
    val easing = value.opt("easing") ?: "easeInOut"
    val iterations = number(value, "iterations", 1.0)
    val autoreverse = value.opt("autoreverse") ?: false
    init {
        require(value.keys().asSequence().all { it in listOf("duration","delay","easing","iterations","autoreverse") })
        require(duration in 0.0..600000.0 && delay in 0.0..600000.0)
        require(iterations == floor(iterations) && (iterations == -1.0 || iterations in 1.0..10000.0))
        require(easing in listOf("linear","easeIn","easeOut","easeInOut","spring") && autoreverse is Boolean)
        require(duration != 0.0 || iterations != -1.0)
    }
    private fun number(value: JSONObject, key: String, default: Double): Double {
        if (!value.has(key)) return default
        val number = value.get(key); require(number is Number && number.toDouble().isFinite()); return number.toDouble()
    }
}

/** Platform frame clock; no per-frame bridge traffic or Core layout work. */
internal class NodeAnimation(private val view: View) : Choreographer.FrameCallback {
    companion object {
        val defaults = mapOf("opacity" to 1.0,"translateX" to 0.0,"translateY" to 0.0,"scaleX" to 1.0,"scaleY" to 1.0,"rotate" to 0.0,"borderRadius" to 0.0,"r" to 0.0,"g" to 0.0,"b" to 0.0,"a" to 0.0)
    }
    val current = defaults.toMutableMap()
    val declared = mutableMapOf<String, Double>()
    private var target = defaults.toMutableMap()
    private var from = defaults.toMap()
    private val staged = mutableMapOf<String, Double>()
    private var mounted = false
    var options: AnimationOptions? = null
    private var running: AnimationOptions? = null
    private var started = 0.0
    private var completion: ((Boolean) -> Unit)? = null
    private val clock = Choreographer.getInstance()
    private val density get() = view.resources.displayMetrics.density.toDouble()
    fun stage(values: Map<String, Double>) {
        for ((key, value) in values) if (declared[key] != value) { declared[key] = value; staged[key] = value }
    }
    fun commit() {
        if (staged.isNotEmpty()) {
            val next = (target + staged).toMutableMap(); staged.clear()
            val config = options
            if (mounted && config != null) begin(next, config)
            else { cancel(); target = next; current.clear(); current.putAll(next); paint() }
        } else paint()
        mounted = true
    }
    fun animate(args: Any?, complete: (Boolean) -> Unit) {
        require(args is JSONObject)
        val style = args.getJSONObject("style"); require(style.length() > 0)
        val config = AnimationOptions(if (args.has("options")) args.getJSONObject("options") else JSONObject())
        val next = target.toMutableMap()
        for (key in style.keys()) {
            val raw = style.get(key)
            if (key == "backgroundColor") {
                require(raw is String && Regex("#[0-9a-fA-F]{6}").matches(raw))
                val color = Color.parseColor(raw)
                next.putAll(mapOf("r" to Color.red(color).toDouble(),"g" to Color.green(color).toDouble(),"b" to Color.blue(color).toDouble(),"a" to 1.0))
            } else {
                require(key in listOf("opacity","translateX","translateY","scaleX","scaleY","rotate","borderRadius") && raw is Number && raw.toDouble().isFinite())
                val value = raw.toDouble()
                require(!(key == "opacity" && value !in 0.0..1.0) && !(key == "borderRadius" && value < 0))
                next[key] = value
            }
        }
        begin(next, config, complete)
    }
    fun cancel() {
        clock.removeFrameCallback(this); running = null; target = current.toMutableMap()
        val callback = completion; completion = null; callback?.invoke(false)
    }
    private fun begin(next: MutableMap<String, Double>, config: AnimationOptions, complete: ((Boolean) -> Unit)? = null) {
        cancel(); target = next; from = current.toMap(); running = config; completion = complete
        started = System.nanoTime()/1e6 + config.delay
        clock.postFrameCallback(this)
    }
    override fun doFrame(frameTimeNanos: Long) {
        val config = running ?: return
        val elapsed = frameTimeNanos/1e6 - started
        if (elapsed < 0) { clock.postFrameCallback(this); return }
        val reverse = config.autoreverse == true
        val done = config.duration == 0.0 || (config.iterations != -1.0 && elapsed >= config.duration * (if (reverse) 2 else 1) * config.iterations)
        val progress = if (config.duration == 0.0) 1.0 else elapsed/config.duration
        val leg = floor(progress)
        var t = if (done) (if (reverse) 0.0 else 1.0) else progress-leg
        if (!done && reverse && leg.toLong()%2L == 1L) t = 1-t
        val amount = when(config.easing) {
            "linear" -> t; "easeIn" -> t*t*t; "easeOut" -> 1-(1-t).pow(3)
            "spring" -> if (t == 1.0) 1.0 else (1-exp(-6*t)*cos(10*t))/(1-exp(-6.0)*cos(10.0))
            else -> t*t*(3-2*t)
        }
        for ((key, value) in target) { val initial = from[key] ?: value; current[key] = initial+(value-initial)*amount }
        paint()
        if (done) { running = null; target = current.toMutableMap(); val callback = completion; completion = null; callback?.invoke(true) }
        else clock.postFrameCallback(this)
    }
    private fun paint() {
        val v = current
        if (v.containsKey("x")) {
            val width = (max(0.0,v.getValue("width"))*density).roundToInt(); val height = (max(0.0,v.getValue("height"))*density).roundToInt()
            val left = (v.getValue("x")*density).roundToInt(); val top = (v.getValue("y")*density).roundToInt()
            val old = view.layoutParams as? FrameLayout.LayoutParams
            if (old == null || old.width != width || old.height != height || old.leftMargin != left || old.topMargin != top) {
                view.layoutParams = FrameLayout.LayoutParams(width,height).apply { leftMargin = left; topMargin = top }
            }
        }
        // Android's default Button background is replaced by the shared
        // GradientDrawable above, so disabled state does not get the platform
        // tint/alpha treatment automatically. Keep the shared opacity semantics
        // while making disabled buttons visibly distinct from enabled buttons.
        val disabledFactor = if (view is android.widget.Button && !view.isEnabled) 0.5 else 1.0
        view.alpha = (v.getValue("opacity") * disabledFactor).coerceIn(0.0,1.0).toFloat()
        view.translationX = (v.getValue("translateX")*density).toFloat(); view.translationY = (v.getValue("translateY")*density).toFloat()
        view.scaleX = v.getValue("scaleX").toFloat(); view.scaleY = v.getValue("scaleY").toFloat(); view.rotation = v.getValue("rotate").toFloat()
        val color = Color.argb((v.getValue("a")*255).roundToInt().coerceIn(0,255),v.getValue("r").roundToInt().coerceIn(0,255),v.getValue("g").roundToInt().coerceIn(0,255),v.getValue("b").roundToInt().coerceIn(0,255))
        val background = view.background as? GradientDrawable ?: GradientDrawable().also { view.background = it }
        background.setColor(color); background.cornerRadius = (max(0.0,v.getValue("borderRadius"))*density).toFloat()
    }
}
