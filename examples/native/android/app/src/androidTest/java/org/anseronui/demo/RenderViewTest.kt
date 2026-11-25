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
import org.anseronui.render.AndroidHost
import org.anseronui.render.AnseronUIRenderView
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@RunWith(AndroidJUnit4::class)
class RenderViewTest {
    @Test fun fieldPatchPreservesNativeInputAndRestoresDefaults() = ui {
        val renderer = AndroidRenderer(FrameLayout(instrumentation.targetContext))
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
          {"type":"CreateNode","nodeId":1,"kind":"TextInput"},
          {"type":"PatchProps","nodeId":1,"set":{"value":"7","inputRevision":0,"placeholder":"hint"},"unset":[]}] }""")
        val input = renderer.viewFor(1) as android.widget.EditText
        input.setText("local unsent")
        val patch = """{"type":"Commit","revision":2,"commands":[{"type":"PatchProps","nodeId":1,"set":{"opacity":0.4},"unset":[]}]}"""
        renderer.applyJson(patch); renderer.applyJson(patch)
        assertEquals("local unsent", input.text.toString()); assertEquals("hint", input.hint)
        assertEquals(0.4f, input.alpha, 0.001f)
        renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"PatchProps","nodeId":1,"set":{},"unset":["opacity","placeholder"]}]}""")
        assertEquals(1f,input.alpha,0.001f); assertEquals("local unsent",input.text.toString()); assertTrue(input.hint.isNullOrEmpty())
        renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"PatchProps","nodeId":1,"set":{"value":"7","inputRevision":1},"unset":[]}]}""")
        assertEquals("7",input.text.toString())
        try { renderer.applyJson("""{"type":"Commit","revision":4,"commands":[]}"""); fail("Conflicting replay accepted") } catch (_: IllegalArgumentException) { }
        renderer.clear()
    }
    @Test fun glassFallbackDefaultsOverridesAndReset() {
        val activity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        try { ui {
            val root = FrameLayout(activity)
            activity.addContentView(root, android.view.ViewGroup.LayoutParams(400, 400))
            val renderer = AndroidRenderer(root)
            renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
                {"type":"CreateNode","nodeId":1,"kind":"View"},
                {"type":"SetProps","nodeId":1,"props":{"glassEffect":true,"borderRadius":28}},
                {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
                {"type":"SetFrame","nodeId":1,"frame":{"x":20,"y":20,"width":56,"height":56}}
            ]}""")
            val node = renderer.viewFor(1)!!
            assertEquals(0.88f, node.alpha, 0.001f)
            assertEquals(204, android.graphics.Color.alpha((node.background as android.graphics.drawable.GradientDrawable).color!!.defaultColor))
            root.measure(View.MeasureSpec.makeMeasureSpec(400, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(400, View.MeasureSpec.EXACTLY))
            root.layout(0, 0, 400, 400)
            val image = android.graphics.Bitmap.createBitmap(400,400,android.graphics.Bitmap.Config.ARGB_8888)
            try { root.draw(android.graphics.Canvas(image)) } finally { image.recycle() }
            renderer.applyJson("""{"type":"Commit","revision":2,"commands":[{"type":"SetProps","nodeId":1,"props":{"glassEffect":true,"backgroundColor":"transparent","opacity":0,"backgroundBlurRadius":0}}]}""")
            assertEquals(0f,node.alpha,0.001f)
            assertEquals(0,(node.background as android.graphics.drawable.GradientDrawable).color!!.defaultColor)
            renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":1,"props":{"glassEffect":true,"backgroundColor":"#123456","opacity":1,"backgroundBlurRadius":0}}]}""")
            assertEquals(1f,node.alpha,0.001f)
            assertEquals(android.graphics.Color.rgb(18,52,86),(node.background as android.graphics.drawable.GradientDrawable).color!!.defaultColor)
            renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"SetProps","nodeId":1,"props":{}}]}""")
            assertEquals(1f,node.alpha,0.001f)
            assertEquals(0,(node.background as android.graphics.drawable.GradientDrawable).color!!.defaultColor)
            renderer.clear()
        } } finally { ui { activity.finish() } }
    }

    @Test fun standaloneBackgroundBlurSamplesBackdropAndResets() {
        val activity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        try { ui {
            val density = activity.resources.displayMetrics.density
            val size = kotlin.math.ceil(80 * density).toInt()
            val root = FrameLayout(activity)
            activity.addContentView(root, android.view.ViewGroup.LayoutParams(size, size))
            val renderer = AndroidRenderer(root)
            try {
                renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
                    {"type":"CreateNode","nodeId":1,"kind":"View"},
                    {"type":"SetProps","nodeId":1,"props":{"backgroundColor":"#ff0000"}},
                    {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
                    {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":80,"height":80}},
                    {"type":"CreateNode","nodeId":2,"kind":"View"},
                    {"type":"SetProps","nodeId":2,"props":{"backgroundColor":"#0000ff"}},
                    {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
                    {"type":"SetFrame","nodeId":2,"frame":{"x":40,"y":0,"width":40,"height":80}},
                    {"type":"CreateNode","nodeId":3,"kind":"View"},
                    {"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20}},
                    {"type":"InsertChild","nodeId":3,"parentId":0,"index":1},
                    {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":0,"width":80,"height":80}}
                ]}""")
                root.measure(View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY))
                root.layout(0, 0, size, size)
                fun sample(x:Float = 40f, y:Float = 40f): Int {
                    val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
                    return try { root.draw(android.graphics.Canvas(bitmap)); bitmap.getPixel((x*density).toInt(), (y*density).toInt()) } finally { bitmap.recycle() }
                }
                val blurred = sample()
                assertTrue("Backdrop edge mixes red and blue without glassEffect: $blurred", android.graphics.Color.red(blurred) > 20 && android.graphics.Color.blue(blurred) > 20)
                assertEquals(1f, renderer.viewFor(3)!!.alpha, 0.001f)
                renderer.applyJson("""{"type":"Commit","revision":2,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":0}}]}""")
                val sharp = sample()
                assertTrue("Zero blur restores the sharp edge", android.graphics.Color.red(sharp) == 0 || android.graphics.Color.blue(sharp) == 0)
                renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":12}}]}""")
                val enabled = sample()
                assertTrue(android.graphics.Color.red(enabled) > 20 && android.graphics.Color.blue(enabled) > 20)
                renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"SetProps","nodeId":3,"props":{}}]}""")
                assertEquals("Removing the style restores sharp pixels", sharp, sample())
                renderer.applyJson("""{"type":"Commit","revision":5,"commands":[{"type":"SetProps","nodeId":3,"props":{"glassEffect":true,"backgroundColor":"transparent","opacity":1}}]}""")
                val defaultGlass = sample()
                if (android.os.Build.VERSION.SDK_INT < 31) assertEquals("Old Android default glass skips backdrop sampling", sharp, defaultGlass)
                else assertTrue(android.graphics.Color.red(defaultGlass) > 20 && android.graphics.Color.blue(defaultGlass) > 20)
                renderer.applyJson("""{"type":"Commit","revision":6,"commands":[{"type":"SetProps","nodeId":3,"props":{"glassEffect":true,"backgroundColor":"transparent","opacity":1,"backgroundBlurRadius":12}}]}""")
                val explicitGlass = sample()
                assertTrue("Explicit business blur still works on every Android version", android.graphics.Color.red(explicitGlass) > 20 && android.graphics.Color.blue(explicitGlass) > 20)
                renderer.applyJson("""{"type":"Commit","revision":7,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20,"borderRadius":40}}]}""")
                assertEquals("Rounded software blur leaves corners untouched", android.graphics.Color.RED, sample(25f,1f))
                renderer.applyJson("""{"type":"Commit","revision":8,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20}}]}""")
                assertTrue("Removing radius restores blur at the same corner", android.graphics.Color.blue(sample(25f,1f)) > 0)
            } finally { renderer.clear() }
        } } finally { ui { activity.finish() } }
    }

    @Test fun hardwareBackgroundBlurKeepsForegroundSharpAndResets() {
        org.junit.Assume.assumeTrue(android.os.Build.VERSION.SDK_INT >= 31)
        val activity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        lateinit var root: FrameLayout
        lateinit var renderer: AndroidRenderer
        var rendererCreated = false
        var softwareDraws = 0
        var hardwareDraws = 0
        try {
            ui {
                root = FrameLayout(activity)
                activity.setContentView(root)
                val factory: org.anseronui.render.NativeComponentFactory = { context, _ ->
                    object : org.anseronui.render.AndroidNativeComponent {
                        override val view = object : FrameLayout(context) {
                            override fun dispatchDraw(canvas: android.graphics.Canvas) {
                                if (canvas.isHardwareAccelerated) hardwareDraws++ else softwareDraws++
                                super.dispatchDraw(canvas)
                            }
                        }
                        override val contentView = view
                        override fun setProps(props: JSONObject) {}
                    }
                }
                renderer = AndroidRenderer(root, org.anseronui.render.AndroidPlatformExtensions(components = mapOf("BackdropProbe" to factory)))
                rendererCreated = true
                renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
                    {"type":"CreateNode","nodeId":6,"kind":"ScrollView"},
                    {"type":"SetProps","nodeId":6,"props":{}},
                    {"type":"InsertChild","nodeId":6,"parentId":0,"index":0},
                    {"type":"SetFrame","nodeId":6,"frame":{"x":8,"y":8,"width":100,"height":100}},
                    {"type":"CreateNode","nodeId":5,"kind":"View"},
                    {"type":"SetProps","nodeId":5,"props":{"borderRadius":10,"overflow":"hidden"}},
                    {"type":"InsertChild","nodeId":5,"parentId":6,"index":0},
                    {"type":"SetFrame","nodeId":5,"frame":{"x":0,"y":0,"width":100,"height":180}},
                    {"type":"CreateNode","nodeId":1,"kind":"Native","nativeName":"BackdropProbe"},
                    {"type":"SetProps","nodeId":1,"props":{"backgroundColor":"#ff0000"}},
                    {"type":"InsertChild","nodeId":1,"parentId":5,"index":0},
                    {"type":"SetFrame","nodeId":1,"frame":{"x":16,"y":16,"width":80,"height":80}},
                    {"type":"CreateNode","nodeId":2,"kind":"View"},
                    {"type":"SetProps","nodeId":2,"props":{"backgroundColor":"#0000ff"}},
                    {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
                    {"type":"SetFrame","nodeId":2,"frame":{"x":40,"y":0,"width":40,"height":80}},
                    {"type":"CreateNode","nodeId":3,"kind":"View"},
                    {"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20}},
                    {"type":"InsertChild","nodeId":3,"parentId":5,"index":1},
                    {"type":"SetFrame","nodeId":3,"frame":{"x":16,"y":16,"width":80,"height":80}},
                    {"type":"CreateNode","nodeId":4,"kind":"View"},
                    {"type":"SetProps","nodeId":4,"props":{"backgroundColor":"#00ff00"}},
                    {"type":"InsertChild","nodeId":4,"parentId":3,"index":0},
                    {"type":"SetFrame","nodeId":4,"frame":{"x":38,"y":38,"width":4,"height":4}}
                ]}""")
            }
            fun pixels(): Triple<Int,Int,Int> {
                val frame = CountDownLatch(1)
                ui {
                    assertTrue("Test must exercise a hardware Canvas", root.isHardwareAccelerated)
                    root.viewTreeObserver.registerFrameCommitCallback { frame.countDown() }
                    root.invalidate()
                }
                assertTrue("Hardware frame committed", frame.await(10, TimeUnit.SECONDS))
                val copied = CountDownLatch(1); var result = -1
                lateinit var bitmap: android.graphics.Bitmap
                val position = IntArray(2)
                ui {
                    root.getLocationInWindow(position)
                    bitmap = android.graphics.Bitmap.createBitmap(activity.window.decorView.width, activity.window.decorView.height, android.graphics.Bitmap.Config.ARGB_8888)
                    android.view.PixelCopy.request(activity.window, bitmap, { result = it; copied.countDown() }, android.os.Handler(android.os.Looper.getMainLooper()))
                }
                try {
                    assertTrue("Window pixels copied", copied.await(10, TimeUnit.SECONDS))
                    assertEquals(android.view.PixelCopy.SUCCESS, result)
                    val density = activity.resources.displayMetrics.density
                    val x = position[0] + (64 * density).toInt()
                    return Triple(bitmap.getPixel(x + (6 * density).toInt(), position[1] + (49 * density).toInt()), bitmap.getPixel(x, position[1] + (64 * density).toInt()),
                        bitmap.getPixel(position[0] + (49*density).toInt(),position[1] + (25*density).toInt()))
                } finally { bitmap.recycle() }
            }
            val blurred = pixels()
            assertTrue("RenderEffect mixes the backdrop edge", android.graphics.Color.red(blurred.first) > 20 && android.graphics.Color.blue(blurred.first) > 20)
            assertEquals("Foreground remains sharp", android.graphics.Color.GREEN, blurred.second)
            ui { renderer.applyJson("""{"type":"Commit","revision":2,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":0}}]}""") }
            val sharp = pixels()
            assertTrue("Zero blur restores a sharp backdrop", android.graphics.Color.red(sharp.first) == 0 || android.graphics.Color.blue(sharp.first) == 0)
            assertEquals(android.graphics.Color.GREEN, sharp.second)
            ui { renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":12}}]}""") }
            val restored = pixels()
            assertTrue("RenderEffect re-enables", android.graphics.Color.red(restored.first) > 20 && android.graphics.Color.blue(restored.first) > 20)
            ui { renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"SetProps","nodeId":3,"props":{}}]}""") }
            assertEquals("Removing blur restores original pixels", sharp, pixels())
            val drawsBeforeMotion = hardwareDraws
            ui { renderer.applyJson("""{"type":"Commit","revision":5,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20}},{"type":"SetFrame","nodeId":3,"frame":{"x":20,"y":16,"width":80,"height":80}}]}""") }
            val moved = pixels()
            assertTrue("Moving blur follows the backdrop", android.graphics.Color.red(moved.first) > 20 && android.graphics.Color.blue(moved.first) > 20)
            ui {
                assertEquals("Hardware backdrop never redraws content into a software bitmap", 0, softwareDraws)
                assertTrue("Probe must actually be drawn", hardwareDraws > 0)
                assertEquals("Moving only the blur panel reuses the background display list", drawsBeforeMotion, hardwareDraws)
            }
            ui { renderer.applyJson("""{"type":"Commit","revision":6,"commands":[{"type":"SetProps","nodeId":3,"props":{"backgroundBlurRadius":20,"borderRadius":40}},{"type":"SetFrame","nodeId":3,"frame":{"x":16,"y":16,"width":80,"height":80}}]}""") }
            assertEquals("GPU blur leaves rounded corners untouched",android.graphics.Color.RED,pixels().third)
            fun animateRadius(radius:Int) {
                val finished = CountDownLatch(1)
                ui { renderer.invoke(3,"animate",JSONObject().put("style",JSONObject().put("borderRadius",radius)).put("options",JSONObject().put("duration",30))) { finished.countDown() } }
                assertTrue("Corner animation finishes",finished.await(5,TimeUnit.SECONDS))
            }
            animateRadius(0)
            assertTrue("GPU blur uses animated radius instead of declared radius",android.graphics.Color.blue(pixels().third) > 0)
            animateRadius(40)
            assertEquals("GPU blur rounds again after animation",android.graphics.Color.RED,pixels().third)
        } finally { ui { if (rendererCreated) renderer.clear(); activity.finish() } }
    }

    @Test fun accessibilitySemanticsActionsAndReset() {
        val activity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        try { ui {
        val root = FrameLayout(activity)
        activity.addContentView(root, android.view.ViewGroup.LayoutParams(400, 400))
        val events = mutableListOf<RendererEvent>()
        val renderer = AndroidRenderer(root, onEvent = { events.add(it) })
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"View"},
            {"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"checkbox","accessibilityLabel":"通知","accessibilityHint":"切换通知","accessibilityChecked":true}},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"BindEvent","nodeId":1,"event":"tap","enabled":true},
            {"type":"BindEvent","nodeId":1,"event":"longPress","enabled":true}
        ]}""")
        val node = renderer.viewFor(1)!!
        val info = node.createAccessibilityNodeInfo()
        assertEquals("android.widget.CheckBox", info.className)
        assertEquals("通知", info.contentDescription)
        assertEquals("切换通知", info.hintText)
        assertTrue(info.isCheckable && info.isChecked && info.isClickable && info.isLongClickable)
        assertTrue(node.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK, null))
        assertEquals("Tap", events.last().type)
        assertTrue(node.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK, null))
        assertEquals("longPress", events.last().event)
        renderer.applyJson("""{"type":"Commit","revision":2,"commands":[{"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"button","disabled":true}}]}""")
        assertFalse(node.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK, null))
        renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"none"}}]}""")
        assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO, node.importantForAccessibility)
        renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"SetProps","nodeId":1,"props":{"accessibilityHidden":true}}]}""")
        assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS, node.importantForAccessibility)
        renderer.applyJson("""{"type":"Commit","revision":5,"commands":[{"type":"SetProps","nodeId":1,"props":{}}]}""")
        assertNull(node.contentDescription)
        assertFalse(node.createAccessibilityNodeInfo().isChecked)
        assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO, node.importantForAccessibility)
        renderer.clear()
        } } finally { ui { activity.finish() } }
    }

    @Test fun pageCleanupCancelsAnInFlightImageRequest() {
        val server = java.net.ServerSocket(0)
        val accepted = CountDownLatch(1); val disconnected = CountDownLatch(1)
        val worker = Thread {
            server.accept().use { socket ->
                socket.soTimeout = 5000
                val input = socket.getInputStream().bufferedReader()
                while (!input.readLine().isNullOrEmpty()) { }
                accepted.countDown()
                try { if (input.read() == -1) disconnected.countDown() }
                catch (_: java.net.SocketException) { disconnected.countDown() }
            }
        }
        worker.start()
        lateinit var renderer: AndroidRenderer
        try {
            ui {
                renderer = AndroidRenderer(FrameLayout(instrumentation.targetContext))
                renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
                    {"type":"CreateNode","nodeId":1,"kind":"Image"},
                    {"type":"SetProps","nodeId":1,"props":{"src":"http://127.0.0.1:${server.localPort}/pending.png"}}
                ]}""")
            }
            assertTrue("Image request must reach the server", accepted.await(5, TimeUnit.SECONDS))
            ui { renderer.clear(); renderer.clear() }
            assertTrue("Page teardown must disconnect the unfinished image request", disconnected.await(5, TimeUnit.SECONDS))
        } finally { ui { renderer.clear() }; server.close(); worker.join(6000) }
    }
    @Test fun serviceCleanupContinuesAfterSubscriptionCancellationFails() = ui {
        val released = mutableListOf<String>()
        val sources: Map<String, org.anseronui.render.NativeEventSource> = mapOf(
            "window" to { _ -> { released.add("window"); error("Expected unsubscribe failure") } },
            "appearance" to { _ -> { released.add("appearance"); Unit } }
        )
        val serviceClass = Class.forName("org.anseronui.render.StandardServices")
        val constructor = serviceClass.declaredConstructors.first { it.parameterTypes.size == 3 }.apply { isAccessible = true }
        val services = constructor.newInstance(FrameLayout(instrumentation.targetContext), null, sources)
        val invoke = serviceClass.getDeclaredMethod("invoke", String::class.java, String::class.java, Any::class.java, kotlin.jvm.functions.Function1::class.java).apply { isAccessible = true }
        val completion: org.anseronui.render.NativeCompletion = {}
        for (module in listOf("window", "appearance")) {
            invoke.invoke(services, "events", "next", JSONObject().put("id", module).put("module", module), completion)
        }
        val dispose = serviceClass.getDeclaredMethod("dispose").apply { isAccessible = true }
        dispose.invoke(services); dispose.invoke(services)
        assertEquals(listOf("window", "appearance"), released)
    }
    @Test fun cleanupContinuesAfterNativeComponentDisposalFails() = ui {
        val disposed = mutableListOf<String>()
        val components = listOf("Broken", "Healthy").associateWith { name ->
            { context: android.content.Context, _: (String, Any?) -> Unit ->
                object : org.anseronui.render.AndroidNativeComponent {
                    override val view = FrameLayout(context)
                    override fun setProps(props: JSONObject) {}
                    override fun dispose() { disposed.add(name); if (name == "Broken") error("Expected plugin disposal failure") }
                }
            }
        }
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root, org.anseronui.render.AndroidPlatformExtensions(components = components))
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"Native","nativeName":"Broken"},
            {"type":"CreateNode","nodeId":2,"kind":"Native","nativeName":"Healthy"}
        ]}""")
        renderer.clear(); renderer.clear()
        assertEquals(listOf("Broken", "Healthy"), disposed)
        assertNull(renderer.viewFor(1)); assertNull(renderer.viewFor(2))
    }
    @Test fun textLineHeightAndDarkImageSource() {
        val testActivity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
        val base = instrumentation.targetContext
        val config = android.content.res.Configuration(base.resources.configuration)
        config.uiMode = (config.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or android.content.res.Configuration.UI_MODE_NIGHT_NO
        val context = base.createConfigurationContext(config)
        lateinit var renderer: AndroidRenderer
        val directory = java.io.File(base.cacheDir, "image-theme-test").apply { mkdirs() }
        fun image(name: String, width: Int): String {
            val file = java.io.File(directory, name + ".png")
            val bitmap = android.graphics.Bitmap.createBitmap(width, 4, android.graphics.Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(android.graphics.Color.BLUE)
            file.outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
            return file.toURI().toString()
        }
        val light = image("light", 8); val dark = image("dark", 12)
        try {
            instrumentation.runOnMainSync {
                val root = FrameLayout(context); testActivity.setContentView(root)
                renderer = AndroidRenderer(root)
                renderer.applyJson(JSONObject().put("type", "Commit").put("revision", 1).put("commands", org.json.JSONArray()
                    .put(JSONObject().put("type", "CreateNode").put("nodeId", 1).put("kind", "Image"))
                    .put(JSONObject().put("type", "SetProps").put("nodeId", 1).put("props", JSONObject().put("src", light).put("dmSrc", dark)))).toString())
                val measured = renderer.measure("Text", "first\nsecond", 16f, 200f, JSONObject().put("text", "first\nsecond").put("fontSize", 16).put("lineHeight", 30))
                assertEquals(60f, measured.height, 1f)
                val unlimited = renderer.measure("Text", "first\nsecond\nthird", 16f, 200f,
                    JSONObject().put("text", "first\nsecond\nthird").put("fontSize", 16).put("lineHeight", 30).put("numberOfLines", 0))
                assertEquals(90f, unlimited.height, 1f)
            }
            fun waitWidth(width: Int) {
                val until = SystemClock.uptimeMillis() + 5000
                var actual = 0
                do { instrumentation.runOnMainSync { actual = ((renderer.viewFor(1) as android.widget.ImageView).drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap?.width ?: 0 }; if (actual == width) return; SystemClock.sleep(25) } while (SystemClock.uptimeMillis() < until)
                assertEquals(width, actual)
            }
            waitWidth(8)
            instrumentation.runOnMainSync {
                config.uiMode = (config.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or android.content.res.Configuration.UI_MODE_NIGHT_YES
                context.resources.updateConfiguration(config, context.resources.displayMetrics); renderer.appearanceChanged()
            }
            waitWidth(12)
            instrumentation.runOnMainSync {
                config.uiMode = (config.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or android.content.res.Configuration.UI_MODE_NIGHT_NO
                context.resources.updateConfiguration(config, context.resources.displayMetrics); renderer.appearanceChanged()
            }
            waitWidth(8)
        } finally { instrumentation.runOnMainSync { renderer.clear(); testActivity.finish() }; directory.deleteRecursively() }
    }
    @Test fun primitiveButtonBindsAndUnbindsClicksWithoutMakingLabelClickable() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val events = mutableListOf<RendererEvent>()
        val renderer = AndroidRenderer(root, onEvent = { events.add(it) })
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"View"},
            {"type":"CreateNode","nodeId":2,"kind":"Text"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
            {"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"button"}},
            {"type":"SetProps","nodeId":2,"props":{"text":"Confirm"}},
            {"type":"BindEvent","nodeId":1,"event":"tap","enabled":true},
            {"type":"BindEvent","nodeId":1,"event":"longPress","enabled":true}
        ]}""")
        val button = renderer.viewFor(1)!!
        val label = renderer.viewFor(2)!!
        assertTrue(button is android.view.ViewGroup)
        assertTrue(button.isClickable); assertTrue(button.isLongClickable)
        assertFalse(label.isClickable); assertFalse(label.isLongClickable)
        button.performClick(); button.performLongClick()
        assertEquals(listOf("Tap", "NativeEvent"), events.map { it.type })
        renderer.applyJson("""{"type":"Commit","revision":2,"commands":[
            {"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"button","disabled":true}},
            {"type":"BindEvent","nodeId":1,"event":"tap","enabled":false},
            {"type":"BindEvent","nodeId":1,"event":"longPress","enabled":false}
        ]}""")
        assertFalse(button.isEnabled); assertFalse(button.isClickable); assertFalse(button.isLongClickable)
        button.performClick(); button.performLongClick(); assertEquals(2, events.size)
        renderer.applyJson("""{"type":"Commit","revision":3,"commands":[
            {"type":"SetProps","nodeId":1,"props":{"accessibilityRole":"button"}},
            {"type":"BindEvent","nodeId":1,"event":"tap","enabled":true}
        ]}""")
        button.performClick(); assertEquals(3, events.size)
        renderer.clear()
    }
    @Test fun recycledTextResetsVisualStateAndEventIdentity() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val events = mutableListOf<RendererEvent>()
        val renderer = AndroidRenderer(root, onEvent = { events.add(it) })
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"Text"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"SetProps","nodeId":1,"props":{"text":"old","fontStyle":"italic","lineHeight":40,"numberOfLines":1,"testID":"old"}},
            {"type":"BindEvent","nodeId":1,"event":"tap","enabled":true}
        ]}""")
        val text = renderer.viewFor(1) as TextView
        renderer.applyJson("""{"type":"Commit","revision":2,"commands":[
            {"type":"RemoveNode","nodeId":1},
            {"type":"CreateNode","nodeId":2,"kind":"Text"},
            {"type":"InsertChild","nodeId":2,"parentId":0,"index":0},
            {"type":"SetProps","nodeId":2,"props":{"text":"new"}},
            {"type":"BindEvent","nodeId":2,"event":"tap","enabled":true}
        ]}""")
        assertSame(text, renderer.viewFor(2))
        assertEquals("new", text.text.toString()); assertEquals(Int.MAX_VALUE, text.maxLines)
        assertFalse(text.typeface.isItalic); assertNull(text.transitionName); assertTrue(text.includeFontPadding)
        text.performClick(); assertEquals(listOf(2L), events.map { it.nodeId })
        renderer.clear()
    }
    @Test fun darkStylesShadowPixelsAndInputSurviveAppearanceChanges() = ui {
        val configuration = android.content.res.Configuration(instrumentation.targetContext.resources.configuration)
        configuration.uiMode = (configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or android.content.res.Configuration.UI_MODE_NIGHT_NO
        val context = instrumentation.targetContext.createConfigurationContext(configuration)
        val root = FrameLayout(context)
        val renderer = AndroidRenderer(root)
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
          {"type":"CreateNode","nodeId":1,"kind":"View"},
          {"type":"CreateNode","nodeId":2,"kind":"TextInput"},
          {"type":"CreateNode","nodeId":3,"kind":"RichText"},
          {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
          {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
          {"type":"InsertChild","nodeId":3,"parentId":1,"index":1},
          {"type":"SetProps","nodeId":1,"props":{"backgroundColor":"#ffffff","dmBackgroundColor":"#111111","shadowColor":"#ff0000","dmShadowColor":"#00ff00","shadowOpacity":1,"shadowRadius":3,"shadowOffsetX":0,"shadowOffsetY":5,"borderRadius":8}},
          {"type":"SetFrame","nodeId":1,"frame":{"x":30,"y":30,"width":100,"height":100}},
          {"type":"SetProps","nodeId":2,"props":{"value":"declared","placeholder":"Hint","color":"#000000","dmColor":"#ffffff","placeholderTextColor":"#666666","dmPlaceholderTextColor":"#aaaaaa"}},
          {"type":"SetProps","nodeId":3,"props":{"spans":"[{\"text\":\"span\",\"color\":\"#123456\",\"dmColor\":\"#abcdef\"}]"}}
        ]}""")
        val density = context.resources.displayMetrics.density
        layout(root,(240*density).toInt(),(240*density).toInt())
        val card = renderer.viewFor(1)!!
        val input = renderer.viewFor(2) as android.widget.EditText
        input.setText("local unsent")
        val frame = card.left
        fun bitmap():android.graphics.Bitmap {
            val image = android.graphics.Bitmap.createBitmap(root.width,root.height,android.graphics.Bitmap.Config.ARGB_8888)
            root.draw(android.graphics.Canvas(image)); return image
        }
        val light = bitmap()
        assertEquals(android.graphics.Color.WHITE, light.getPixel((80*density).toInt(),(80*density).toInt()))
        val x=(80*density).toInt(); val y=(134*density).toInt()
        assertTrue("outer shadow must extend below card",android.graphics.Color.alpha(light.getPixel(x,y))>0)
        assertTrue(android.graphics.Color.red(light.getPixel(x,y))>android.graphics.Color.green(light.getPixel(x,y)))
        val dark = android.content.res.Configuration(configuration)
        dark.uiMode = (dark.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK.inv()) or android.content.res.Configuration.UI_MODE_NIGHT_YES
        @Suppress("DEPRECATION") context.resources.updateConfiguration(dark,context.resources.displayMetrics)
        renderer.appearanceChanged()
        val night=bitmap()
        assertEquals(android.graphics.Color.rgb(17,17,17), night.getPixel((80*density).toInt(),(80*density).toInt()))
        assertTrue(android.graphics.Color.green(night.getPixel(x,y))>android.graphics.Color.red(night.getPixel(x,y)))
        assertEquals("local unsent",input.text.toString()); assertEquals(android.graphics.Color.WHITE,input.currentTextColor)
        assertEquals(android.graphics.Color.rgb(170,170,170),input.currentHintTextColor); assertEquals(frame,card.left)
        val rich=(renderer.viewFor(3) as TextView).text as android.text.Spanned
        assertEquals(android.graphics.Color.rgb(171,205,239),rich.getSpans(0,4,android.text.style.ForegroundColorSpan::class.java)[0].foregroundColor)
        @Suppress("DEPRECATION") context.resources.updateConfiguration(configuration,context.resources.displayMetrics)
        renderer.appearanceChanged(); assertEquals(android.graphics.Color.BLACK,input.currentTextColor)
        renderer.clear()
    }
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun ui(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private fun layout(view: View, width: Int, height: Int) {
        view.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, width, height)
    }

    @Test fun scrollViewportClipsOverscanRowsOutsideItsBounds() = ui {
        val root = FrameLayout(instrumentation.targetContext).apply { setBackgroundColor(android.graphics.Color.BLUE) }
        val renderer = AndroidRenderer(root)
        val density = root.resources.displayMetrics.density
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"ScrollView"},
            {"type":"CreateNode","nodeId":2,"kind":"View"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
            {"type":"SetProps","nodeId":1,"props":{"showsVerticalScrollIndicator":false}},
            {"type":"SetProps","nodeId":2,"props":{"backgroundColor":"#ff0000"}},
            {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":100,"width":200,"height":200}},
            {"type":"SetFrame","nodeId":2,"frame":{"x":0,"y":0,"width":200,"height":1000}}
        ]}""")
        layout(root, (320 * density).toInt(), (480 * density).toInt())
        (renderer.viewFor(1) as ScrollView).scrollTo(0, (300 * density).toInt())
        val bitmap = android.graphics.Bitmap.createBitmap(root.width, root.height, android.graphics.Bitmap.Config.ARGB_8888)
        root.draw(android.graphics.Canvas(bitmap))
        assertEquals("overscan must not paint above the viewport", android.graphics.Color.BLUE, bitmap.getPixel((50 * density).toInt(), (50 * density).toInt()))
        assertEquals(android.graphics.Color.RED, bitmap.getPixel((50 * density).toInt(), (150 * density).toInt()))
        assertEquals("overscan must not paint below the viewport", android.graphics.Color.BLUE, bitmap.getPixel((50 * density).toInt(), (350 * density).toInt()))
        renderer.clear(); bitmap.recycle()
    }

    @Test fun richTextParsesCoreSpanPayload() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root)
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
            {"type":"CreateNode","nodeId":1,"kind":"RichText"},
            {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
            {"type":"SetProps","nodeId":1,"props":{"fontSize":16,"spans":"[{\"text\":\"普通 \"},{\"text\":\"粗体\",\"fontWeight\":\"bold\",\"color\":\"#275de5\",\"clickable\":true}]"}}
        ]}""")
        val rich = renderer.viewFor(1) as TextView
        assertEquals("普通 粗体", rich.text.toString())
        assertTrue(rich.text is android.text.Spanned)
        val spans = (rich.text as android.text.Spanned).getSpans(3, 5, android.text.style.ForegroundColorSpan::class.java)
        assertEquals(1, spans.size)
        assertEquals(0, (rich.text as android.text.Spanned).getSpans(0, 3, android.text.style.ClickableSpan::class.java).size)
        assertEquals(1, (rich.text as android.text.Spanned).getSpans(3, 5, android.text.style.ClickableSpan::class.java).size)
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
        val scroll = renderer.viewFor(1) as ScrollView
        scroll.scrollTo(0, (60*density).toInt())
        val initialScroll = scroll.scrollY
        assertTrue(initialScroll > 0)
        touch(MotionEvent.ACTION_DOWN, 40f, 60f)
        touch(MotionEvent.ACTION_MOVE, 40f, 20f)
        touch(MotionEvent.ACTION_MOVE, 40f, 180f)
        touch(MotionEvent.ACTION_UP, 40f, 180f)
        assertFalse(events.any { it.event == "touchCancel" })
        assertEquals("touchUp", events.last().event)
        assertEquals(initialScroll, scroll.scrollY)
        events.clear()
        scroll.scrollTo(0, 0)
        renderer.applyJson("""{"type":"Commit","revision":3,"commands":[{"type":"SetProps","nodeId":3,"props":{"touchAction":"pan-y"}}]}""")
        touch(MotionEvent.ACTION_DOWN, 40f, 60f)
        touch(MotionEvent.ACTION_MOVE, 40f, 20f)
        touch(MotionEvent.ACTION_MOVE, 40f, -40f)
        touch(MotionEvent.ACTION_UP, 40f, -40f)
        assertEquals(1, events.count { it.event == "touchCancel" })
        assertFalse(events.any { it.event == "touchUp" })
        assertTrue("pan-y still hands vertical dragging to the ancestor ScrollView", scroll.scrollY > 0)
        renderer.clear()
    }

    @Test fun floatingTouchOverlayDoesNotLeakToSiblingScrollView() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val events = mutableListOf<RendererEvent>()
        val renderer = AndroidRenderer(root, onEvent = { events.add(it) })
        try {
            renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
                {"type":"CreateNode","nodeId":1,"kind":"ScrollView"},
                {"type":"CreateNode","nodeId":2,"kind":"View"},
                {"type":"CreateNode","nodeId":3,"kind":"View"},
                {"type":"CreateNode","nodeId":4,"kind":"Text"},
                {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
                {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
                {"type":"InsertChild","nodeId":3,"parentId":0,"index":1},
                {"type":"InsertChild","nodeId":4,"parentId":3,"index":0},
                {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":320,"height":480}},
                {"type":"SetFrame","nodeId":2,"frame":{"x":0,"y":0,"width":320,"height":1400}},
                {"type":"SetFrame","nodeId":3,"frame":{"x":200,"y":100,"width":64,"height":64}},
                {"type":"SetFrame","nodeId":4,"frame":{"x":0,"y":0,"width":64,"height":64}},
                {"type":"SetProps","nodeId":3,"props":{"touchAction":"none"}},
                {"type":"BindEvent","nodeId":3,"event":"touchMove","enabled":true}
            ]}""")
            val density = root.resources.displayMetrics.density
            layout(root, (320*density).toInt(), (480*density).toInt())
            val scroll = renderer.viewFor(1) as ScrollView
            scroll.scrollTo(0, (200*density).toInt())
            val initial = scroll.scrollY
            assertTrue("Fixture has room to scroll in either direction", initial > 0)
            var time = SystemClock.uptimeMillis(); var down = time
            fun touch(action: Int, x: Float, y: Float) {
                time += 25
                if (action == MotionEvent.ACTION_DOWN) down = time
                val e = MotionEvent.obtain(down, time, action, x*density, y*density, 0)
                try { root.dispatchTouchEvent(e) } finally { e.recycle() }
            }
            touch(MotionEvent.ACTION_DOWN, 224f, 124f)
            touch(MotionEvent.ACTION_MOVE, 224f, 60f)
            touch(MotionEvent.ACTION_MOVE, 224f, 20f)
            touch(MotionEvent.ACTION_UP, 224f, 20f)
            assertEquals("Overlay drag never reaches the underlying sibling ScrollView", initial, scroll.scrollY)
            assertEquals(listOf("touchDown","touchMove","touchMove","touchUp"),events.map { it.event })
            assertTrue(events.all { it.nodeId == 3L && it.targetId == 4L })
            events.clear()
            touch(MotionEvent.ACTION_DOWN, 40f, 200f)
            touch(MotionEvent.ACTION_MOVE, 40f, 120f)
            touch(MotionEvent.ACTION_MOVE, 40f, 40f)
            touch(MotionEvent.ACTION_UP, 40f, 40f)
            assertTrue("Ordinary page swipes still scroll", scroll.scrollY > initial)
        } finally { renderer.clear() }
    }

    @Test fun compiledVariableListMeasuresScrollsAndSuspendsVisibleWork() {
        lateinit var view: AnseronUIRenderView
        val errors = ConcurrentLinkedQueue<String>()
        fun descendants(root: android.view.View): List<android.view.View> = if (root is android.view.ViewGroup) (0 until root.childCount).flatMap { listOf(root.getChildAt(it)) + descendants(root.getChildAt(it)) } else emptyList()
        val intent = android.content.Intent(instrumentation.targetContext, MainActivity::class.java).apply { addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK); putExtra("page", "virtual-list") }
        val activity = instrumentation.startActivitySync(intent)
        ui {
            view = descendants(activity.window.decorView).filterIsInstance<AnseronUIRenderView>().first()
            view.onFailure = { errors.add(it.toString()) }
            view.onDiagnostic = { code, message -> errors.add("$code: $message") }
        }
        fun waitUi(message: String, condition: () -> Boolean) {
            val end = SystemClock.uptimeMillis() + 10000
            var done = false
            while (!done && errors.isEmpty() && SystemClock.uptimeMillis() < end) { ui { done = condition() }; if (!done) SystemClock.sleep(10) }
            var snapshot = ""
            if (!done) ui { snapshot = descendants(view).filterIsInstance<TextView>().take(20).joinToString { it.text.toString().take(60) } + "; scroll=" + descendants(view).filterIsInstance<ScrollView>().map { "${it.scrollY}/${it.height}/${it.getChildAt(0)?.height}" } }
            assertTrue("$message: $errors $snapshot", done && errors.isEmpty())
        }
        fun labels(title: String) = descendants(view).filterIsInstance<TextView>().filter { it.text.toString() == title }
        fun button(title: String): View { var target: View = labels(title).first(); while (!target.isClickable && target.parent is View) target = target.parent as View; return target }
        fun buttonCount() = descendants(view).count { it.isClickable && it !is TextView }
        try {
            waitUi("compiled list first frame") { labels("展开").isNotEmpty() }
            var initial = 0
            ui { initial = descendants(view).first { it.transitionName == "list-row-0" }.height; button("展开").performClick() }
            waitUi("variable row expands") { labels("收起").isNotEmpty() && (descendants(view).firstOrNull { row -> row.transitionName == "list-row-0" }?.height ?: 0) > initial }
            ui { button("跳到第 4000 项").performClick() }
            waitUi("deep virtual window") { descendants(view).filterIsInstance<TextView>().any { it.text.toString().replace(" ", "") == "第4000项" } }
            ui { assertTrue(buttonCount() < 60); button("头部插入").performClick() }
            waitUi("prepend retains visible target") { descendants(view).filterIsInstance<TextView>().any { it.text.toString().replace(" ", "") == "第4000项" } }
            lateinit var ticks: TextView; var before = ""
            val hidden = java.util.concurrent.atomic.AtomicBoolean(false)
            ui {
                ticks = descendants(view).filterIsInstance<TextView>().first { it.text.toString().startsWith("可见秒数：") }
                view.onRuntimeStats = { hidden.set(it.getInt("hiddenSurfaces") == 1 && it.getInt("pendingRenders") == 0) }
                view.setVisibility(false); view.inspectRuntime(enabled = false)
            }
            val hiddenDeadline = SystemClock.uptimeMillis() + 5000
            while (!hidden.get() && SystemClock.uptimeMillis() < hiddenDeadline) { SystemClock.sleep(25); ui { view.inspectRuntime(enabled = false) } }
            assertTrue("hidden render drained", hidden.get())
            ui { before = ticks.text.toString() }
            SystemClock.sleep(1200)
            ui { assertEquals(before, ticks.text.toString()); view.setVisibility(true) }
            waitUi("visible timer resumes") { ticks.text.toString() != before }
            ui { val density = view.resources.displayMetrics.density; layout(view, (240 * density).toInt(), (700 * density).toInt()) }
            waitUi("bounded viewport after resize") { descendants(view).filterIsInstance<ScrollView>().first().height <= view.height && buttonCount() < 60 }
        } finally { ui { view.destroy(); activity.finish() } }
    }

    @Test fun compiledVariableListCatchesUpToFastScrollWithoutReplayingOldWindows() {
        fun descendants(root: View): List<View> = if (root is android.view.ViewGroup) (0 until root.childCount).flatMap { listOf(root.getChildAt(it)) + descendants(root.getChildAt(it)) } else emptyList()
        val intent = android.content.Intent(instrumentation.targetContext, MainActivity::class.java).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK); putExtra("page", "virtual-list")
        }
        val activity = instrumentation.startActivitySync(intent)
        lateinit var view: AnseronUIRenderView
        lateinit var scroll: ScrollView
        val errors = ConcurrentLinkedQueue<String>()
        ui {
            view = descendants(activity.window.decorView).filterIsInstance<AnseronUIRenderView>().first()
            view.onFailure = { errors.add(it.toString()) }
            view.onDiagnostic = { code, message -> errors.add("$code: $message") }
        }
        fun waitFor(message: String, timeout: Long = 10000, condition: () -> Boolean) {
            val started = SystemClock.uptimeMillis()
            val end = started + timeout
            var done = false
            while (!done && errors.isEmpty() && SystemClock.uptimeMillis() < end) {
                ui { done = condition() }; if (!done) SystemClock.sleep(10)
            }
            var snapshot = ""
            if (!done) ui {
                snapshot = descendants(view).filterIsInstance<ScrollView>().joinToString { "scroll=${it.scrollY}, viewport=${it.height}, content=${it.getChildAt(0)?.height}" } +
                    "; rows=" + descendants(view).filter { it.transitionName?.startsWith("list-row-") == true }.joinToString { row ->
                        val point = IntArray(2); row.getLocationOnScreen(point); "${row.transitionName}:${point[1]}..${point[1] + row.height}"
                    }
            }
            assertTrue("$message: $errors $snapshot", done && errors.isEmpty())
            android.util.Log.i("AnseronUIListTest", "$message: ${SystemClock.uptimeMillis() - started} ms")
        }
        fun coversViewport(): Boolean {
            val location = IntArray(2); scroll.getLocationOnScreen(location)
            val top = location[1]; val bottom = top + scroll.height
            val rows = descendants(scroll).filter { it.transitionName?.startsWith("list-row-") == true }
                .map { row -> val point = IntArray(2); row.getLocationOnScreen(point); point[1] to point[1] + row.height }.sortedBy { it.first }
            var covered = top
            for ((start, end) in rows) {
                if (end <= covered) continue
                if (start > covered + 2) return false
                covered = end
                if (covered >= bottom) return true
            }
            return false
        }
        try {
            waitFor("first list frame") {
                val candidate = descendants(view).filterIsInstance<ScrollView>().firstOrNull()
                if (candidate == null) false else { scroll = candidate; coversViewport() }
            }
            // Let initial onLayout/ref corrections finish before starting input.
            SystemClock.sleep(500)
            // Deliver offsets faster than an asynchronous Core can measure/commit.
            // Old behavior re-rendered all 60 abandoned windows and stayed blank.
            var requested = 0
            ui {
                requested = (24000 * view.resources.displayMetrics.density).toInt()
                for (i in 1..60) scroll.scrollTo(0, (i * 400 * view.resources.displayMetrics.density).toInt())
            }
            waitFor("latest viewport filled after scroll burst", 2000) { scroll.scrollY >= requested - scroll.height && coversViewport() }
            // Real touch movement followed by a held finger stops the fling at the
            // native position; verify every pixel of the viewport receives rows.
            val point = IntArray(2); var x = 0f; var fromY = 0f; var toY = 0f
            ui { scroll.getLocationOnScreen(point); x = point[0] + scroll.width * 0.85f; fromY = point[1] + scroll.height * 0.8f; toY = point[1] + scroll.height * 0.2f }
            var down = SystemClock.uptimeMillis()
            fun touch(action: Int, y: Float) {
                val event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0)
                event.source = android.view.InputDevice.SOURCE_TOUCHSCREEN
                instrumentation.sendPointerSync(event); event.recycle()
            }
            touch(MotionEvent.ACTION_DOWN, fromY)
            for (i in 1..12) { SystemClock.sleep(10); touch(MotionEvent.ACTION_MOVE, fromY + (toY - fromY) * i / 12) }
            touch(MotionEvent.ACTION_UP, toY)
            SystemClock.sleep(250)
            down = SystemClock.uptimeMillis(); touch(MotionEvent.ACTION_DOWN, toY)
            SystemClock.sleep(150); touch(MotionEvent.ACTION_UP, toY)
            var stoppedOffset = 0
            ui { stoppedOffset = scroll.scrollY }
            waitFor("latest viewport filled after touch scroll", 2000) { scroll.scrollY >= stoppedOffset - scroll.height && coversViewport() }
            // A queued old correction must not rewind the viewport after it fills.
            SystemClock.sleep(500)
            ui { assertTrue("viewport stays at latest position", scroll.scrollY >= stoppedOffset - scroll.height); assertTrue("viewport stays filled", coversViewport()) }
            ui { assertTrue("bounded mounted rows", descendants(scroll).count { it.transitionName?.startsWith("list-row-") == true } <= 32) }
        } finally { ui { view.destroy(); activity.finish() } }
    }

    @Test fun scrollAnchorAdjustsTheLatestNativePositionInTheSameLayout() = ui {
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root)
        val density = root.resources.displayMetrics.density
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
          {"type":"CreateNode","nodeId":1,"kind":"ScrollView"},
          {"type":"CreateNode","nodeId":2,"kind":"View"},
          {"type":"CreateNode","nodeId":3,"kind":"View"},
          {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
          {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
          {"type":"InsertChild","nodeId":3,"parentId":2,"index":0},
          {"type":"SetProps","nodeId":1,"props":{"scrollAnchorOffset":0}},
          {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":320,"height":480}},
          {"type":"SetFrame","nodeId":2,"frame":{"x":0,"y":0,"width":320,"height":3000}},
          {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":400,"width":320,"height":100}}
        ]}""")
        layout(root, (320*density).toInt(), (480*density).toInt())
        val scroll = renderer.viewFor(1) as ScrollView
        scroll.scrollTo(0,(300*density).toInt())
        val before = renderer.viewFor(3)!!.top - scroll.scrollY
        // Native motion advances after Core calculated the correction, before
        // the UI thread receives the commit. Apply the delta to this position.
        scroll.scrollTo(0,(340*density).toInt())
        renderer.applyJson("""{"type":"Commit","revision":2,"commands":[
          {"type":"SetProps","nodeId":1,"props":{"scrollAnchorOffset":80}},
          {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":480,"width":320,"height":100}}
        ]}""")
        assertEquals("Anchor compensation must be applied before commit ACK", (420*density).toInt(), scroll.scrollY)
        layout(root, (320*density).toInt(), (480*density).toInt())
        assertEquals((420*density).toInt(), scroll.scrollY)
        assertEquals(before - (40*density).toInt(), renderer.viewFor(3)!!.top - scroll.scrollY)
        renderer.clear()
    }

    @Test fun virtualRunwayPreservesNativeFlingSpeedUntilExhausted() = ui {
        // Keep the native-velocity comparison inside a fully mounted document,
        // including the extra distance contributed by a same-direction re-fling.
        // Exhaustion is exercised separately below with the 700-unit row.
        val root = FrameLayout(instrumentation.targetContext)
        val renderer = AndroidRenderer(root)
        val density = root.resources.displayMetrics.density
        renderer.applyJson("""{"type":"Commit","revision":1,"commands":[
          {"type":"CreateNode","nodeId":1,"kind":"ScrollView"},
          {"type":"CreateNode","nodeId":2,"kind":"View"},
          {"type":"CreateNode","nodeId":3,"kind":"View"},
          {"type":"InsertChild","nodeId":1,"parentId":0,"index":0},
          {"type":"InsertChild","nodeId":2,"parentId":1,"index":0},
          {"type":"InsertChild","nodeId":3,"parentId":2,"index":0},
          {"type":"SetProps","nodeId":1,"props":{"scrollAnchorOffset":0}},
          {"type":"SetFrame","nodeId":1,"frame":{"x":0,"y":0,"width":320,"height":480}},
          {"type":"SetFrame","nodeId":2,"frame":{"x":0,"y":0,"width":320,"height":30000}},
          {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":0,"width":320,"height":30000}}
        ]}""")
        layout(root, (320*density).toInt(), (480*density).toInt())
        val scroll = renderer.viewFor(1) as ScrollView
        try {
            for (velocity in listOf(6000, -6000)) {
                val start = (500*density).toInt()
                scroll.scrollTo(0,start)
                val expected = android.widget.OverScroller(root.context)
                expected.fling(0,start,0,velocity,0,0,0,(30000*density).toInt()-scroll.height,0,0)
                scroll.fling(velocity)
                repeat(2) { leg ->
                    if (leg > 0) {
                        // Same-direction reflings retain OverScroller's flywheel.
                        expected.fling(0,expected.currY,0,velocity,0,0,0,(30000*density).toInt()-scroll.height,0,0)
                        scroll.fling(velocity)
                    }
                    repeat(8) {
                        SystemClock.sleep(16)
                        expected.computeScrollOffset(); scroll.computeScroll()
                        assertEquals("Covered virtual window must retain native fling velocity ($velocity, leg $leg)", expected.currY.toDouble(),scroll.scrollY.toDouble(),45.0)
                    }
                }
                assertTrue("Fling must make measurable progress", kotlin.math.abs(scroll.scrollY-start)>200)
            }
            // A newly attached row has a zero frame until the next layout. It
            // must not turn the start of a deep virtual window into offset 0.
            renderer.applyJson("""{"type":"Commit","revision":2,"commands":[
              {"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":10000,"width":320,"height":3200}}
            ]}""")
            layout(root, (320*density).toInt(), (480*density).toInt())
            scroll.scrollTo(0,(10000*density).toInt())
            renderer.applyJson("""{"type":"Commit","revision":3,"commands":[
              {"type":"CreateNode","nodeId":4,"kind":"View"},
              {"type":"SetFrame","nodeId":4,"frame":{"x":0,"y":13200,"width":320,"height":100}},
              {"type":"InsertChild","nodeId":4,"parentId":2,"index":1}
            ]}""")
            assertTrue("Virtual row frames must be laid out before the commit is acknowledged", renderer.viewFor(4)!!.height > 0)
            scroll.scrollTo(0,(10000*density).toInt()); scroll.fling(-20000)
            repeat(8) { SystemClock.sleep(16); scroll.computeScroll() }
            assertEquals("Pending row layout must not expose a false runway at zero", (10000*density).toDouble(),scroll.scrollY.toDouble(),2.0)
            layout(root, (320*density).toInt(), (480*density).toInt())
            repeat(4) { SystemClock.sleep(16); scroll.computeScroll() }
            assertEquals("Reverse fling stays at the real mounted boundary after layout", (10000*density).toDouble(),scroll.scrollY.toDouble(),2.0)
            // Protection starts only at the real end of mounted content.
            renderer.applyJson("""{"type":"Commit","revision":4,"commands":[{"type":"RemoveNode","nodeId":4},{"type":"SetFrame","nodeId":3,"frame":{"x":0,"y":0,"width":320,"height":700}}]}""")
            layout(root, (320*density).toInt(), (480*density).toInt())
            scroll.scrollTo(0,(200*density).toInt()); scroll.fling(20000)
            repeat(8) { SystemClock.sleep(16); scroll.computeScroll() }
            assertEquals("Fling stops at exhausted mounted window without showing blank content", (220*density).toDouble(),scroll.scrollY.toDouble(),2.0)
        } finally { renderer.clear() }
    }

    @Test fun compiledVariableListSustainsBidirectionalFlings() {
        fun descendants(root: View): List<View> = if (root is android.view.ViewGroup) (0 until root.childCount).flatMap { listOf(root.getChildAt(it)) + descendants(root.getChildAt(it)) } else emptyList()
        val activity = instrumentation.startActivitySync(android.content.Intent(instrumentation.targetContext, MainActivity::class.java).apply {
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK); putExtra("page", "virtual-list")
        })
        lateinit var view: AnseronUIRenderView; lateinit var scroll: ScrollView
        val errors = ConcurrentLinkedQueue<String>()
        ui {
            view = descendants(activity.window.decorView).filterIsInstance<AnseronUIRenderView>().first()
            view.onFailure = { errors.add(it.toString()) }
            view.onDiagnostic = { code, message -> errors.add("$code: $message") }
        }
        try {
            val deadline = SystemClock.uptimeMillis() + 10000
            var mounted = false
            while (!mounted && SystemClock.uptimeMillis() < deadline) {
                ui { val candidate = descendants(view).filterIsInstance<ScrollView>().firstOrNull(); if (candidate != null && descendants(candidate).any { it.transitionName == "list-row-3" }) { scroll = candidate; mounted = true } }
                SystemClock.sleep(20)
            }
            assertTrue(mounted); SystemClock.sleep(500)
            ui { scroll.scrollTo(0, (30000 * view.resources.displayMetrics.density).toInt()) }
            // Start the fling after the preceding deep jump has actually
            // settled, rather than assuming a fixed sleep finishes layout.
            val jumpDeadline = SystemClock.uptimeMillis() + 10000
            var stableSince = 0L; var lastOffset = -1
            while (SystemClock.uptimeMillis() < jumpDeadline) {
                var covered = false; var offset = 0
                ui {
                    offset = scroll.scrollY
                    val origin = IntArray(2); scroll.getLocationOnScreen(origin)
                    var edge = origin[1]
                    val rows = descendants(scroll).filter { it.transitionName?.startsWith("list-row-") == true }.map {
                        val point = IntArray(2); it.getLocationOnScreen(point); point[1] to point[1] + it.height
                    }.sortedBy { it.first }
                    for (row in rows) { if (row.second <= edge) continue; if (row.first > edge + 2) break; edge = row.second }
                    covered = edge >= origin[1] + scroll.height
                }
                val now = SystemClock.uptimeMillis()
                if (!covered || offset != lastOffset) stableSince = 0
                else if (stableSince == 0L) stableSince = now
                lastOffset = offset
                if (stableSince != 0L && now - stableSince >= 300) break
                SystemClock.sleep(20)
            }
            assertTrue("deep jump did not settle before fling", stableSince != 0L && SystemClock.uptimeMillis() - stableSince >= 300)
            for (velocity in listOf(20000, -20000, 20000, -20000, 20000, -20000)) {
                var samples = 0; var blankSamples = 0; var longestBlank = 0L; var blankSince = 0L; var backwards = 0
                var previous = emptyMap<String, Int>(); var stop = false
                val sampler = object : Runnable {
                    override fun run() {
                        if (stop) return
                        val location = IntArray(2); scroll.getLocationOnScreen(location)
                        val top = location[1]; val bottom = top + scroll.height
                        val rows = descendants(scroll).filter { it.transitionName?.startsWith("list-row-") == true }.map {
                            val point = IntArray(2); it.getLocationOnScreen(point); Triple(it.transitionName, point[1], point[1] + it.height)
                        }.sortedBy { it.second }
                        var covered = top
                        for (row in rows) { if (row.third <= covered) continue; if (row.second > covered + 2) break; covered = row.third }
                        val now = SystemClock.uptimeMillis(); samples++
                        if (covered < bottom) {
                            blankSamples++
                            if (blankSince == 0L) {
                                blankSince = now
                                android.util.Log.i("AnseronUIListTest", "blank start: velocity=$velocity offset=${scroll.scrollY} viewport=${scroll.height} rows=" + rows.joinToString { "${it.first}:${it.second}..${it.third}" })
                            }
                            longestBlank = maxOf(longestBlank, now - blankSince)
                        } else blankSince = 0
                        val visible = rows.filter { it.third > top && it.second < bottom }
                        for (row in visible) previous[row.first]?.let { old ->
                            val reversed = if (velocity > 0) row.second - old else old - row.second
                            backwards = maxOf(backwards, reversed)
                        }
                        previous = visible.take(1).associate { it.first to it.second }
                        scroll.postOnAnimation(this)
                    }
                }
                var initialTravel = 0.0; var finalTravel = 0.0
                fun travelPosition(): Double {
                    val document = (scroll.getChildAt(0) as android.view.ViewGroup).getChildAt(0) as android.view.ViewGroup
                    val row = (0 until document.childCount).map { document.getChildAt(it) }.firstOrNull { it.bottom > scroll.scrollY }
                        ?: throw AssertionError("No row covers offset ${scroll.scrollY}; viewport=${scroll.height}; rows=" + (0 until document.childCount).joinToString { val child = document.getChildAt(it); "${child.top}..${child.bottom}" })
                    val content = row as android.view.ViewGroup
                    val index = content.getChildAt(0).transitionName.removePrefix("list-row-").toInt()
                    return index + (scroll.scrollY - row.top).toDouble() / maxOf(1, row.height)
                }
                ui { initialTravel = travelPosition(); scroll.fling(velocity); scroll.postOnAnimation(sampler) }
                SystemClock.sleep(2500)
                ui { stop = true; scroll.removeCallbacks(sampler); finalTravel = travelPosition() }
                val travelledRows = (finalTravel - initialTravel) * if (velocity > 0) 1 else -1
                android.util.Log.i("AnseronUIListTest", "fling=$velocity frames=$samples blankFrames=$blankSamples longestBlankMs=$longestBlank reversePixels=$backwards travelledRows=$travelledRows")
                assertTrue("fling diagnostics: $errors", errors.isEmpty())
                assertTrue("fling $velocity must keep sampling frames: $samples", samples >= 60)
                assertTrue("fling $velocity left a persistent blank: $longestBlank ms", longestBlank <= 150)
                assertTrue("fling $velocity exposed $blankSamples / $samples blank frames", blankSamples <= samples / 10)
                assertTrue("fling $velocity moved the visible anchor backwards by $backwards px", backwards <= 2)
                assertTrue("fling $velocity must actually travel through the list: $travelledRows rows", travelledRows >= 10)
            }
        } finally { ui { view.destroy(); activity.finish() } }
    }

    @Test fun hostCoalescesScrollBeforeEncodingAndPreservesDiscreteBarriers() {
        val core = RecordingCore()
        val entered = CountDownLatch(1); val release = CountDownLatch(1)
        val transport = object : AndroidCoreTransport by core {
            override fun post(input: ByteArray) {
                if (JSONObject(String(input, Charsets.UTF_8)).getJSONObject("payload").getString("type") == "Resize") {
                    entered.countDown(); check(release.await(5, TimeUnit.SECONDS))
                }
                core.post(input)
            }
        }
        lateinit var host: AndroidHost
        ui { host = AndroidHost(FrameLayout(instrumentation.targetContext), { transport }); host.start("test", 320f, 480f) }
        try {
            assertTrue(core.committed.await(5, TimeUnit.SECONDS))
            host.resize(320f, 480f); assertTrue(entered.await(5, TimeUnit.SECONDS))
            ui {
                for (y in 1..60) host.renderer.onEvent?.invoke(RendererEvent("NativeEvent", 1, 1, event = "scroll", y = y.toDouble()))
                host.renderer.onEvent?.invoke(RendererEvent("Tap", 1, 1))
                for (y in 61..120) host.renderer.onEvent?.invoke(RendererEvent("NativeEvent", 1, 1, event = "scroll", y = y.toDouble()))
            }
            release.countDown()
            val deadline = SystemClock.uptimeMillis() + 5000
            while (core.messages.none { it.optDouble("y") == 120.0 } && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(10)
            val events = core.messages.filter { it.optString("event") == "scroll" || it.optString("type") == "Tap" }
            assertEquals(listOf("scroll:60", "tap", "scroll:120"), events.map { if (it.getString("type") == "Tap") "tap" else "scroll:${it.getInt("y")}" })
        } finally { release.countDown(); ui { host.destroy() } }
    }

    @Test fun hostFlushesMotionBetweenNativeStepsWithoutCrossingDiscreteBarriers() {
        val core = RecordingCore()
        val entered = CountDownLatch(1); val release = CountDownLatch(1); val checked = CountDownLatch(1)
        val blocked = java.util.concurrent.atomic.AtomicBoolean(false)
        var eventsAtNextStep = emptyList<String>()
        val transport = object : AndroidCoreTransport by core {
            override fun step(maxMessages: Int): List<ByteArray> {
                if (core.messages.any { it.optString("type") == "InspectRuntime" }) {
                    if (blocked.compareAndSet(false, true)) {
                        entered.countDown(); check(release.await(5, TimeUnit.SECONDS))
                    } else if (checked.count > 0) {
                        eventsAtNextStep = core.messages.filter { it.optString("event") == "scroll" || it.optString("type") == "Tap" }
                            .map { if (it.getString("type") == "Tap") "tap" else "scroll:${it.getInt("y")}" }
                        checked.countDown()
                    }
                }
                return core.step(maxMessages)
            }
        }
        lateinit var host: AndroidHost
        ui { host = AndroidHost(FrameLayout(instrumentation.targetContext), { transport }); host.start("test", 320f, 480f) }
        try {
            assertTrue(core.committed.await(5, TimeUnit.SECONDS))
            ui { host.inspectRuntime() }
            assertTrue(entered.await(5, TimeUnit.SECONDS))
            ui {
                for (y in 1..60) host.renderer.onEvent?.invoke(RendererEvent("NativeEvent", 1, 1, event = "scroll", y = y.toDouble()))
                host.renderer.onEvent?.invoke(RendererEvent("Tap", 1, 1))
                for (y in 61..120) host.renderer.onEvent?.invoke(RendererEvent("NativeEvent", 1, 1, event = "scroll", y = y.toDouble()))
            }
            release.countDown()
            assertTrue(checked.await(5, TimeUnit.SECONDS))
            assertEquals(listOf("scroll:60", "tap", "scroll:120"), eventsAtNextStep)
        } finally { release.countDown(); ui { host.destroy() } }
    }

    @Test fun visibilityRetentionAndMemoryPressurePreserveRouteSnapshots() {
        val cores = ConcurrentLinkedQueue<RecordingCore>()
        lateinit var view: AnseronUIRenderView
        ui {
            view = AnseronUIRenderView(instrumentation.targetContext, createCore = { RecordingCore().also { cores.add(it) } })
            view.setVisibility(false)
            view.load("counter", JSONObject().put("origin", "root")); layout(view, 320, 480)
        }
        fun waitFor(message: String, condition: () -> Boolean) {
            val end = SystemClock.uptimeMillis() + 5000
            while (!condition() && SystemClock.uptimeMillis() < end) SystemClock.sleep(10)
            assertTrue(message, condition())
        }
        try {
            waitFor("first core") { cores.size == 1 }
            val first = cores.first()
            assertTrue(first.committed.await(5, TimeUnit.SECONDS))
            assertFalse(first.messages.first { it.optString("type") == "CreateSurface" }.getBoolean("visible"))
            ui { view.setVisibility(true) }
            waitFor("visible notification") { first.messages.any { it.optString("type") == "SurfaceVisibility" && it.getBoolean("visible") } }
            ui { view.push("timers"); layout(view, 320, 480) }
            waitFor("second core") { cores.size == 2 }
            assertTrue(cores.last().committed.await(5, TimeUnit.SECONDS))
            waitFor("covered notification") { first.messages.any { it.optString("type") == "SurfaceVisibility" && !it.getBoolean("visible") } }
            ui { view.trimMemory(); assertEquals(listOf("counter", "timers"), view.routeStack) }
            assertTrue(first.disposed.await(5, TimeUnit.SECONDS))
            ui { assertTrue(view.pop()); layout(view, 320, 480); assertEquals("root", view.routeParams.getString("origin")) }
            waitFor("evicted route remounted") { cores.size == 3 }
            val restored = cores.last(); assertTrue(restored.committed.await(5, TimeUnit.SECONDS))
            val inspected = CountDownLatch(1)
            ui {
                view.onRuntimeStats = { assertEquals(1, it.getInt("nodes")); assertTrue(it.has("bridgeInputBytes")); inspected.countDown() }
                view.inspectRuntime()
            }
            assertTrue(inspected.await(5, TimeUnit.SECONDS))
            ui { view.maxRetainedPages = 1; view.push("timers"); layout(view, 320, 480) }
            assertTrue(restored.disposed.await(5, TimeUnit.SECONDS))
        } finally { ui { view.destroy() } }
        cores.forEach { assertTrue(it.disposed.await(5, TimeUnit.SECONDS)) }
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
                "InspectRuntime" -> emit(JSONObject().put("type", "RuntimeStats").put("values", JSONObject().put("nodes", 1)), envelope)
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
