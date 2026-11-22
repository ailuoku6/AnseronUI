package org.anseronui.render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Hardware path reuses View display lists; only old/software renderers need a bitmap. */
internal class BackdropBlur {
    private var bitmap: Bitmap? = null
    private var hardware: HardwareBackdropBlur? = null
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

    fun drawHardware(canvas: Canvas, radius: Float, width: Int, height: Int, alpha: Float, record: (Canvas) -> Unit) {
        if (Build.VERSION.SDK_INT < 31) return
        val effect = hardware ?: HardwareBackdropBlur().also { hardware = it }
        effect.draw(canvas, radius, width, height, alpha, record)
    }

    fun beginCapture(width: Int, height: Int): Canvas {
        val current = bitmap
        if (current == null || current.width != width || current.height != height) {
            // Software fallback only. Retire replaced images through GC so a queued
            // display list on pre-31 hardware never sees a recycled bitmap.
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        }
        return Canvas(bitmap!!).also { it.drawColor(Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR) }
    }

    fun draw(canvas: Canvas, radius: Float, bounds: RectF, alpha: Float) {
        val source = bitmap ?: return
        blurBackdrop(source, radius.roundToInt().coerceIn(1, 25))
        paint.alpha = (alpha * 255).roundToInt()
        canvas.drawBitmap(source, null, bounds, paint)
    }

    fun clear() {
        if (Build.VERSION.SDK_INT >= 31) hardware?.clear()
        hardware = null; bitmap = null
    }
}

/** API 31 classes stay isolated so Android 8–11 can load the software renderer. */
@android.annotation.TargetApi(31)
private class HardwareBackdropBlur {
    private val node = RenderNode("AnseronUI backdrop blur")
    private var radius = -1f

    fun draw(canvas: Canvas, requestedRadius: Float, width: Int, height: Int, alpha: Float, record: (Canvas) -> Unit) {
        // Bound the GPU layer for large panels without rasterizing the View tree on the CPU.
        val scale = maxOf(4f, maxOf(width, height) / 512f)
        val blurRadius = (requestedRadius / scale).coerceIn(0.01f, 128f)
        val padding = kotlin.math.ceil(blurRadius * 3).toInt()
        if (radius != blurRadius) {
            node.setRenderEffect(RenderEffect.createBlurEffect(blurRadius, blurRadius, Shader.TileMode.CLAMP))
            radius = blurRadius
        }
        node.setPosition(0, 0, kotlin.math.ceil(width / scale).toInt() + padding * 2, kotlin.math.ceil(height / scale).toInt() + padding * 2)
        node.alpha = alpha
        val recording = node.beginRecording()
        try {
            recording.translate(padding.toFloat(), padding.toFloat())
            recording.scale(1 / scale, 1 / scale)
            record(recording)
        } finally { node.endRecording() }
        val saved = canvas.save()
        try {
            canvas.translate(-padding * scale, -padding * scale)
            canvas.scale(scale, scale)
            canvas.drawRenderNode(node)
        } finally { canvas.restoreToCount(saved) }
    }

    fun clear() { node.discardDisplayList(); node.setRenderEffect(null) }
}

/** Three separable box passes approximate a Gaussian on the sampled backdrop. */
internal fun blurBackdrop(bitmap: Bitmap, sigma: Int) {
    val width = bitmap.width; val height = bitmap.height
    var source = IntArray(width * height)
    var target = IntArray(source.size)
    bitmap.getPixels(source, 0, width, 0, 0, width, height)
    val radius = ((sqrt(4.0 * sigma * sigma + 1) - 1) / 2).roundToInt().coerceAtLeast(1)
    repeat(3) {
        for (horizontal in listOf(true, false)) {
            val lines = if (horizontal) height else width
            val length = if (horizontal) width else height
            val stride = if (horizontal) 1 else width
            val count = radius * 2 + 1
            for (line in 0 until lines) {
                val base = if (horizontal) line * width else line
                var a = 0; var r = 0; var g = 0; var b = 0
                for (offset in -radius..radius) {
                    val color = source[base + offset.coerceIn(0, length - 1) * stride]
                    a += color ushr 24; r += (color ushr 16) and 255; g += (color ushr 8) and 255; b += color and 255
                }
                for (position in 0 until length) {
                    target[base + position * stride] = ((a / count) shl 24) or ((r / count) shl 16) or ((g / count) shl 8) or (b / count)
                    val remove = source[base + (position - radius).coerceIn(0, length - 1) * stride]
                    val add = source[base + (position + radius + 1).coerceIn(0, length - 1) * stride]
                    a += (add ushr 24) - (remove ushr 24)
                    r += ((add ushr 16) and 255) - ((remove ushr 16) and 255)
                    g += ((add ushr 8) and 255) - ((remove ushr 8) and 255)
                    b += (add and 255) - (remove and 255)
                }
            }
            val swap = source; source = target; target = swap
        }
    }
    bitmap.setPixels(source, 0, width, 0, 0, width, height)
}
