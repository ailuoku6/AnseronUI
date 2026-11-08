package org.anseronui.demo

import android.view.MotionEvent
import android.os.SystemClock
import android.widget.ScrollView
import org.anseronui.render.AndroidRenderer
import org.anseronui.render.RendererEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.anseronui.render.AndroidCoreTransport
import org.anseronui.render.AnseronUIRenderView
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class RenderViewTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun ui(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun layout(view: View, width: Int, height: Int) {
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, width, height)
    }

    @Test fun richTextParsesCoreSpanPayloadAndDisabledButtonHasDistinctStyle() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root)
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"RichText"},
            {"type":"CreateNode","nodeId":2,"kind":"Button"},
            {"type":"CreateNode","nodeId":3,"kind":"Button"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"InsertChild","nodeId":2,"parentId":0,"index":1},
            {"type":"InsertChild","nodeId":3,"parentId":0,"index":2},
            {"type":"SetProps","nodeId":1,"props":{"fontSize":16,"spans":"[{\"text\":\"普通 \"},{\"text\":\"粗体\",\"fontWeight\":\"bold\",\"color\":\"#275de5\",\"clickable\":true}]"}},
            {"type":"SetProps","nodeId":2,"props":{"title":"禁用","disabled":true,"color":"#275de5"}},
            {"type":"SetProps","nodeId":3,"props":{"title":"可用","color":"#275de5"}}
        ]}""")
        val rich = renderer.viewFor(1) as TextView
        assertEquals("普通 粗体", rich.text.toString())
        assertTrue(rich.text is android.text.Spanned)
        val spans = (rich.text as android.text.Spanned).getSpans(3, 5, android.text.style.ForegroundColorSpan::class.java)
        assertEquals(1, spans.size)
        assertEquals(0, (rich.text as android.text.Spanned).getSpans(0, 3, android.text.style.ClickableSpan::class.java).size)
        assertEquals(1, (rich.text as android.text.Spanned).getSpans(3, 5, android.text.style.ClickableSpan::class.java).size)
        val disabled = renderer.viewFor(2) as android.widget.Button
        val enabled = renderer.viewFor(3) as android.widget.Button
        assertFalse(disabled.isEnabled)
        assertTrue("disabled alpha=${disabled.alpha}", disabled.alpha < enabled.alpha)
        assertNotEquals(enabled.textColors.defaultColor, disabled.textColors.getColorForState(intArrayOf(-android.R.attr.state_enabled), enabled.textColors.defaultColor))
        renderer.clear()
    }


    @Test fun animationFramesCancellationAndDisposal() {
        lateinit var root: FrameLayout
        lateinit var renderer: AndroidRenderer
        lateinit var view: View
        val outcomes = mutableListOf<Boolean>()
        fun commit(revision: Int, commands: String) = renderer.applyJson("{\"type\":\"Commit\",\"revision\":$revision,\"commands\":$commands}")
        ui {
            root = FrameLayout(instrumentation.targetContext)
            renderer = AndroidRenderer(root)
            commit(1, """[{"type":"CreateNode","nodeId":1,"kind":"View"},
                {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
                {"type":"SetProps","nodeId":1,"props":{"backgroundColor":"#0000ff","animation":"{\"duration\":400,\"easing\":\"linear\"}"}},
                {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":50,"height":50}}]""")
            view = renderer.viewFor(1)!!
            val density = root.resources.displayMetrics.density
            assertEquals((50*density).toInt(), view.layoutParams.width)
            commit(2,"""[{"type":"SetFrame","nodeId":1,"frame":{"x":100,"y":20,"width":150,"height":80}}]""")
        }
        Thread.sleep(180)
        ui {
            val x = (view.layoutParams as FrameLayout.LayoutParams).leftMargin/root.resources.displayMetrics.density
            assertTrue("Intermediate x=$x", x > 5 && x < 95)
        }
        Thread.sleep(300)
        ui {
            val density = root.resources.displayMetrics.density
            assertEquals(100f, (view.layoutParams as FrameLayout.LayoutParams).leftMargin/density,1f)
            renderer.invoke(1,"animate",JSONObject("""{"style":{"translateX":100,"opacity":0.5},"options":{"duration":500,"easing":"linear"}}""")) { result -> outcomes.add((result.getOrThrow() as JSONObject).getBoolean("finished")) }
        }
        Thread.sleep(200)
        ui {
            val before = view.translationX
            assertTrue(before/root.resources.displayMetrics.density in 5f..95f)
            commit(3,"""[{"type":"SetProps","nodeId":1,"props":{"backgroundColor":"#0000ff","testID":"updated","animation":"{\"duration\":400,\"easing\":\"linear\"}"}}]""")
            assertEquals(before,view.translationX,0.01f)
            renderer.invoke(1,"cancelAnimation",null) { it.getOrThrow() }
            assertEquals(listOf(false),outcomes)
            renderer.invoke(1,"animate",JSONObject("""{"style":{"rotate":180},"options":{"duration":80,"iterations":2,"autoreverse":true}}""")) { result -> outcomes.add((result.getOrThrow() as JSONObject).getBoolean("finished")) }
        }
        Thread.sleep(450)
        ui {
            assertEquals(listOf(false,true),outcomes); assertEquals(0f,view.rotation,0.01f)
            renderer.invoke(1,"animate",JSONObject("""{"style":{"scaleX":2},"options":{"iterations":-1}}""")) { result -> outcomes.add((result.getOrThrow() as JSONObject).getBoolean("finished")) }
            renderer.clear(); assertEquals(listOf(false,true,false),outcomes)
        }
    }

    @Test fun deferredStartResizeReparentAndDestroy() {
        val core = RecordingCore()
        lateinit var view: AnseronUIRenderView
        ui {
            view = AnseronUIRenderView(instrumentation.targetContext, createCore = { core })
            view.load("counter")
            layout(view, 0, 0)
            assertTrue(core.messages.isEmpty())
            layout(view, 320, 480)
        }
        try {
            assertTrue(core.committed.await(5, TimeUnit.SECONDS))
            val create = core.messages.first { it.getString("type") == "CreateSurface" }
            val density = instrumentation.targetContext.resources.displayMetrics.density
            assertEquals("counter", create.getString("page"))
            assertEquals((320 / density).toDouble(), create.getDouble("width"), 0.001)
            assertEquals((480 / density).toDouble(), create.getDouble("height"), 0.001)
            ui { layout(view, 200, 300); view.requestLayout(); layout(view, 200, 300) }
            assertTrue(core.resized.await(5, TimeUnit.SECONDS))
            val sizes = core.messages.filter { it.getString("type") == "Resize" }
            assertEquals(1, sizes.size)
            assertEquals((200 / density).toDouble(), sizes.single().getDouble("width"), 0.001)
            assertEquals((300 / density).toDouble(), sizes.single().getDouble("height"), 0.001)
            ui {
                val parent = FrameLayout(instrumentation.targetContext)
                parent.addView(view); parent.removeView(view); parent.addView(view)
                assertFalse(view.isDestroyed)
                assertEquals("counter", view.page)
                assertFalse(core.messages.any { it.getString("type") == "DestroySurface" })
                view.destroy(); view.destroy()
                assertTrue(view.isDestroyed)
                assertNull(view.page)
                assertEquals(0, view.childCount)
            }
            assertTrue(core.disposed.await(5, TimeUnit.SECONDS))
            assertEquals(1, core.messages.count { it.getString("type") == "DestroySurface" })
        } finally { ui { view.destroy() } }
    }

    @Test fun replacementKeepsNewRootAndSuppressesOldCallbacks() {
        val first = RecordingCore()
        val second = RecordingCore()
        val creations = AtomicInteger()
        val readyCount = AtomicInteger()
        lateinit var view: AnseronUIRenderView
        lateinit var newRoot: View
        ui {
            view = AnseronUIRenderView(instrumentation.targetContext, createCore = { if (creations.getAndIncrement() == 0) first else second })
            view.onReady = { readyCount.incrementAndGet() }
            view.load("counter"); layout(view, 320, 480)
            val oldRoot = view.getChildAt(0)
            view.load("async-form"); layout(view, 320, 480)
            newRoot = view.getChildAt(0)
            assertNotSame(oldRoot, newRoot)
        }
        try {
            assertTrue(first.disposed.await(5, TimeUnit.SECONDS))
            assertTrue(second.committed.await(5, TimeUnit.SECONDS))
            ui {
                assertEquals(1, readyCount.get())
                assertSame(newRoot, view.getChildAt(0))
                assertEquals("async-form", (((newRoot as FrameLayout).getChildAt(0) as FrameLayout).getChildAt(0) as TextView).text.toString())
                view.destroy()
            }
            assertTrue(second.disposed.await(5, TimeUnit.SECONDS))
        } finally { ui { view.destroy() } }
    }

    @Test fun destroyBeforeLayoutDoesNotCreateCore() {
        ui {
            val view = AnseronUIRenderView(instrumentation.targetContext, createCore = { error("Destroyed pending page must not create Core") })
            view.load("counter")
            view.destroy(); view.destroy()
            layout(view, 320, 480)
            assertTrue(view.isDestroyed)
            assertNull(view.page)
            assertEquals(0, view.childCount)
        }
    }

    @Test fun failureAllowsLayoutAndReload() {
        val attempts = AtomicInteger()
        val failed = CountDownLatch(1)
        val core = RecordingCore()
        lateinit var view: AnseronUIRenderView
        ui {
            view = AnseronUIRenderView(instrumentation.targetContext, createCore = {
                if (attempts.getAndIncrement() == 0) error("Expected startup failure") else core
            })
            view.onFailure = { failed.countDown() }
            view.load("counter"); layout(view, 320, 480)
        }
        try {
            assertTrue(failed.await(5, TimeUnit.SECONDS))
            ui {
                layout(view, 200, 300)
                view.load("async-form"); layout(view, 200, 300)
            }
            assertTrue(core.committed.await(5, TimeUnit.SECONDS))
            assertEquals(2, attempts.get())
        } finally { ui { view.destroy() } }
        assertTrue(core.disposed.await(5, TimeUnit.SECONDS))
    }

    @Test fun touchTargetLockAndScrollPolicy() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root)
        val events = mutableListOf<RendererEvent>()
        renderer.onEvent = { events.add(it) }
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"ScrollView"},
            {"type":"CreateNode","nodeId":2,"kind":"View"},
            {"type":"CreateNode","nodeId":3,"kind":"View"},
            {"type":"CreateNode","nodeId":4,"kind":"Text"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
            {"type":"InsertChild","nodeId":3,"parentId":2,"index":0},
            {"type":"InsertChild","nodeId":4,"parentId":3,"index":0},
            {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":320,"height":480}},
            {"type":"SetFrame","nodeId":2,"frame":{"x":0,"y":0,"width":320,"height":1200}},
            {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":0,"width":180,"height":220}},
            {"type":"SetFrame","nodeId":4,"frame":{"x":0,"y":0,"width":80,"height":80}},
            {"type":"SetProps","nodeId":3,"props":{"touchAction":"pan-y"}},
            {"type":"BindEvent","nodeId":3,"event":"touchMove","enabled":true}
        ]}""")
        val density = root.resources.displayMetrics.density
        layout(root, (320*density).toInt(), (480*density).toInt())
        var time = SystemClock.uptimeMillis()
        var down = time
        fun touch(action: Int, x: Float, y: Float) {
            time += 25
            if (action == MotionEvent.ACTION_DOWN) down = time
            val event = MotionEvent.obtain(down, time, action, x*density, y*density, 0)
            root.dispatchTouchEvent(event); event.recycle()
        }
        touch(MotionEvent.ACTION_DOWN, 40f, 40f)
        touch(MotionEvent.ACTION_MOVE, 260f, 50f)
        touch(MotionEvent.ACTION_UP, 270f, 50f)
        assertEquals(listOf("touchDown", "touchMove", "touchUp"), events.map { it.event })
        assertTrue(events.all { it.targetId == 4L && it.nodeId == 3L })
        assertTrue(events.last().touches!!.isEmpty())
        assertEquals(270.0, events.last().x!!, 1.0)
        events.clear()
        renderer.applyJson("""{"type":"Commit","revision":2,"commands":[{"type":"SetProps","nodeId":3,"props":{"touchAction":"none"}}]}""")
        touch(MotionEvent.ACTION_DOWN, 40f, 60f)
        touch(MotionEvent.ACTION_MOVE, 40f, 180f)
        touch(MotionEvent.ACTION_UP, 40f, 180f)
        assertFalse(events.any { it.event == "touchCancel" })
        assertEquals("touchUp", events.last().event)
        assertEquals(0, (renderer.viewFor(1) as ScrollView).scrollY)
        events.clear()
        renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":3,"props":{"touchAction":"pan-y"}}]}""")
        touch(MotionEvent.ACTION_DOWN, 40f, 60f)
        touch(MotionEvent.ACTION_MOVE, 40f, 20f)
        touch(MotionEvent.ACTION_MOVE, 40f, -40f)
        touch(MotionEvent.ACTION_UP, 40f, -40f)
        assertEquals(1, events.count { it.event == "touchCancel" })
        assertFalse(events.any { it.event == "touchUp" })
        renderer.clear()
    }

    private class RecordingCore : AndroidCoreTransport {
        override val bundleBuildId = "container-test"
        override val runtimeEpoch = 1L
        val messages = ConcurrentLinkedQueue<JSONObject>()
        val disposed = CountDownLatch(1)
        val committed = CountDownLatch(1)
        val resized = CountDownLatch(1)
        private val outputs = ConcurrentLinkedQueue<ByteArray>()
        private var sequence = 0

        override fun post(input: ByteArray) {
            val envelope = JSONObject(String(input, Charsets.UTF_8))
            val payload = envelope.getJSONObject("payload")
            messages.add(payload)
            when (payload.getString("type")) {
                "Handshake" -> emit(JSONObject().put("type", "Ready").put("supportedNodes", payload.getJSONArray("requiredNodes")), envelope)
                "CreateSurface" -> {
                    val commit = JSONObject("""{"type":"Commit","revision":1,"commands":[{"type":"CreateNode","nodeId":1,"kind":"Text"},{"type":"SetProps","nodeId":1,"props":{}},{"type":"InsertChild","nodeId":1,"parentId":0,"index":0}]}""")
                    commit.getJSONArray("commands").getJSONObject(1).getJSONObject("props").put("text", payload.getString("page"))
                    emit(commit, envelope)
                }
                "CommitAck" -> committed.countDown()
                "Resize" -> resized.countDown()
                "DestroySurface" -> emit(JSONObject().put("type", "SurfaceDisposed"), envelope)
            }
        }

        private fun emit(payload: JSONObject, envelope: JSONObject) {
            val ack = envelope.getLong("sequence")
            envelope.put("sequence", ++sequence).put("ackSequence", ack).put("payload", payload)
            outputs.add(envelope.toString().toByteArray(Charsets.UTF_8))
        }

        override fun step(maxMessages: Int): List<ByteArray> {
            val result = mutableListOf<ByteArray>()
            while (true) result.add(outputs.poll() ?: return result)
        }
        override fun hasPendingWork() = false
        override fun dispose() { disposed.countDown() }
    }
}
