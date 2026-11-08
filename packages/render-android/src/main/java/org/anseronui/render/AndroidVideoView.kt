package org.anseronui.render

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import android.widget.VideoView
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Styles belong on this container, never on VideoView's SurfaceView overlay. */
internal class AndroidVideoView(context: Context) : FrameLayout(context) {
    val player = object : VideoView(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            setMeasuredDimension(View.MeasureSpec.getSize(widthMeasureSpec), View.MeasureSpec.getSize(heightMeasureSpec))
        }
    }
    var videoWidth = 0
    var videoHeight = 0
    var resizeMode = "contain"
    var prepared = false
    var firstFrame = false
    var appliedControl: String? = null
    var mediaPlayer: android.media.MediaPlayer? = null
    var props = org.json.JSONObject()
    init {
        clipChildren = true
        addView(player, LayoutParams(-1, -1))
    }
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = View.MeasureSpec.getSize(widthMeasureSpec)
        val height = View.MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(width, height)
        var childWidth = width
        var childHeight = height
        if (videoWidth > 0 && videoHeight > 0 && resizeMode != "stretch") {
            val scaleX = width.toDouble() / videoWidth
            val scaleY = height.toDouble() / videoHeight
            val scale = if (resizeMode == "cover") max(scaleX, scaleY) else min(scaleX, scaleY)
            childWidth = (videoWidth * scale).roundToInt()
            childHeight = (videoHeight * scale).roundToInt()
        }
        player.measure(View.MeasureSpec.makeMeasureSpec(childWidth, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(childHeight, View.MeasureSpec.EXACTLY))
    }
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val x = (width - player.measuredWidth) / 2
        val y = (height - player.measuredHeight) / 2
        player.layout(x, y, x + player.measuredWidth, y + player.measuredHeight)
    }
}
