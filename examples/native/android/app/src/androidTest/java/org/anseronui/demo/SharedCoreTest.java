package org.anseronui.demo;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.EditText;

/** Exercises real views, JNI, the owner thread, async callbacks and page replacement. */
@SuppressWarnings("deprecation")
@RunWith(AndroidJUnit4.class)
public final class SharedCoreTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private Activity activity;
    private TextView find(View root, String text) {
        if (root instanceof TextView && ((TextView)root).getText().toString().equals(text)) return (TextView)root;
        if (root instanceof ViewGroup) {
            ViewGroup group=(ViewGroup)root;
            for(int i=0;i<group.getChildCount();i++) { TextView match=find(group.getChildAt(i),text); if(match!=null)return match; }
        }
        return null;
    }
    private TextView waitFor(String text) throws Exception {
        long deadline=System.currentTimeMillis()+15000;
        while(System.currentTimeMillis()<deadline) {
            final TextView[] match={null};
            instrumentation.runOnMainSync(() -> match[0]=find(activity.getWindow().getDecorView(),text));
            if(match[0]!=null)return match[0];
            Thread.sleep(25);
        }
        throw new AssertionError("Missing visible text: "+text);
    }
    private void tap(String text) throws Exception {
        TextView view=waitFor(text);
        instrumentation.runOnMainSync(view::performClick);
    }
    private View findTag(View root, String tag) {
        if (tag.equals(root.getTransitionName())) return root;
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup)root;
            for (int i=0;i<group.getChildCount();i++) { View found=findTag(group.getChildAt(i),tag); if(found!=null)return found; }
        }
        return null;
    }
    private String taggedText(String tag) {
        final String[] value = {null};
        instrumentation.runOnMainSync(() -> {
            View view = findTag(activity.getWindow().getDecorView(), tag);
            if (view instanceof TextView) value[0] = ((TextView)view).getText().toString();
        });
        return value[0];
    }
    private android.graphics.Rect bounds(String tag) {
        final android.graphics.Rect result = new android.graphics.Rect();
        instrumentation.runOnMainSync(() -> {
            View view = findTag(activity.getWindow().getDecorView(), tag);
            assertNotNull("Missing " + tag, view);
            int[] xy = new int[2]; view.getLocationOnScreen(xy);
            result.set(xy[0], xy[1], xy[0] + view.getWidth(), xy[1] + view.getHeight());
        });
        return result;
    }
    private void drag(float x, float y, float dx, float dy) {
        long start = android.os.SystemClock.uptimeMillis();
        for (int step = 0; step <= 12; step++) {
            int action = step == 0 ? android.view.MotionEvent.ACTION_DOWN : step == 12 ? android.view.MotionEvent.ACTION_UP : android.view.MotionEvent.ACTION_MOVE;
            android.view.MotionEvent event = android.view.MotionEvent.obtain(start, android.os.SystemClock.uptimeMillis(), action, x + dx*step/12, y + dy*step/12, 0);
            event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
            instrumentation.sendPointerSync(event); event.recycle();
            android.os.SystemClock.sleep(35);
        }
    }
    @Test public void testLayoutStylesAndFloatingBall() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = instrumentation.startActivitySync(intent);
        try {
            tap("组件"); waitFor("基础组件实验室");
            long readyDeadline = System.currentTimeMillis() + 10000;
            while (System.currentTimeMillis() < readyDeadline) {
                final boolean[] ready = {false};
                instrumentation.runOnMainSync(() -> {
                    View ball = findTag(activity.getWindow().getDecorView(), "floating-ball");
                    ready[0] = ball != null && ball.getWidth() > 0 && ball.getLeft() > 0;
                });
                if (ready[0]) break;
                Thread.sleep(50);
            }
            Thread.sleep(300);
            float density = activity.getResources().getDisplayMetrics().density;
            android.graphics.Rect before = bounds("floating-ball");
            final int[] initialScroll = {0};
            instrumentation.runOnMainSync(() -> initialScroll[0] = ((android.widget.ScrollView)findTag(activity.getWindow().getDecorView(), "component-scroll")).getScrollY());
            drag(before.exactCenterX(), before.exactCenterY(), -70*density, 130*density);
            Thread.sleep(500);
            android.graphics.Rect after = bounds("floating-ball");
            assertEquals(before.left - 70*density, after.left, 3);
            assertEquals(before.top + 130*density, after.top, 3);
            assertEquals("拖动", taggedText("floating-ball-label"));
            instrumentation.runOnMainSync(() -> assertEquals(initialScroll[0], ((android.widget.ScrollView)findTag(activity.getWindow().getDecorView(), "component-scroll")).getScrollY()));
            // Normal swipes outside the ball still scroll, while the overlay stays fixed.
            android.graphics.Rect scroll = bounds("component-scroll");
            drag(scroll.left + 24*density, scroll.bottom - 70*density, 0, -180*density);
            Thread.sleep(400);
            assertEquals(after, bounds("floating-ball"));
            instrumentation.runOnMainSync(() -> assertTrue(((android.widget.ScrollView)findTag(activity.getWindow().getDecorView(), "component-scroll")).getScrollY() > initialScroll[0]));
            tap("布局样式"); waitFor("画布: 280 · 实测: 280 × 64");
            assertEquals(after, bounds("floating-ball"));
            assertEquals(280*density, bounds("layout-between").width(), 1);
            android.graphics.Rect row = bounds("layout-between"), first = bounds("layout-between-a");
            assertEquals(10*density, first.left-row.left, 1);
            assertEquals(12*density, first.top-row.top, 1);
            tap("切换窄画布"); waitFor("画布: 220 · 实测: 220 × 64");
            assertEquals(220*density, bounds("layout-between").width(), 1);
            tap("基础组件"); waitFor("基础组件实验室");
        } finally { instrumentation.runOnMainSync(() -> activity.finish()); }
    }
    private void assertVideoPixels() {
        final android.graphics.Rect bounds = new android.graphics.Rect();
        instrumentation.runOnMainSync(() -> {
            View video = findTag(activity.getWindow().getDecorView(), "component-video");
            assertNotNull(video);
            assertTrue(video.getGlobalVisibleRect(bounds));
        });
        android.graphics.Bitmap screen = instrumentation.getUiAutomation().takeScreenshot();
        assertNotNull(screen);
        int colorful = 0, sampled = 0;
        // Sample the central region, excluding corners where the old background leaked video.
        for (int y = bounds.top + bounds.height()/4; y < bounds.bottom - bounds.height()/4; y += 8) {
            for (int x = bounds.left + bounds.width()/4; x < bounds.right - bounds.width()/4; x += 8) {
                int color = screen.getPixel(x, y);
                int r = android.graphics.Color.red(color), g = android.graphics.Color.green(color), b = android.graphics.Color.blue(color);
                int high = Math.max(r, Math.max(g, b)), low = Math.min(r, Math.min(g, b));
                if (high > 140 && high - low > 80) colorful++;
                sampled++;
            }
        }
        screen.recycle();
        assertTrue("Decoded color bars must be visible, not hidden by the styled background: " + colorful + "/" + sampled,
            sampled > 100 && colorful > sampled / 3);
    }
    @Test public void testVideoRendersPixelsAndHonorsPausedState() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = instrumentation.startActivitySync(intent);
        try {
            tap("组件"); waitFor("Video: paused");
            instrumentation.runOnMainSync(() -> ((android.widget.ScrollView)findTag(activity.getWindow().getDecorView(), "component-scroll")).fullScroll(View.FOCUS_DOWN));
            Thread.sleep(1500);
            assertEquals("Video: paused", taggedText("video-state"));
            assertTrue(taggedText("video-progress").startsWith("进度: 0s"));
            tap("播放"); waitFor("Video: playing");
            long deadline = System.currentTimeMillis() + 5000;
            while (System.currentTimeMillis() < deadline) {
                String progress = taggedText("video-progress");
                if (progress != null && !progress.startsWith("进度: 0s") && progress.endsWith("yes")) break;
                Thread.sleep(50);
            }
            assertFalse(taggedText("video-progress").startsWith("进度: 0s"));
            assertTrue(taggedText("video-progress").endsWith("yes"));
            assertVideoPixels();
            tap("暂停"); waitFor("Video: paused"); Thread.sleep(600);
            String paused = taggedText("video-progress");
            Thread.sleep(1200); assertEquals(paused, taggedText("video-progress"));
            assertVideoPixels();
            tap("重置"); Thread.sleep(800);
            assertTrue(taggedText("video-progress").startsWith("进度: 0s"));
            Thread.sleep(1200); assertTrue(taggedText("video-progress").startsWith("进度: 0s"));
            tap("Counter"); waitFor("Count: 0");
        } finally { instrumentation.runOnMainSync(() -> activity.finish()); }
    }
    @Test public void testNativeExtensions() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(),MainActivity.class); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=instrumentation.startActivitySync(intent);
        tap("扩展"); tap("读取平台信息"); waitFor("平台: Android");
        final View[] control={null};
        instrumentation.runOnMainSync(()->control[0]=findTag(activity.getWindow().getDecorView(),"extension-switch"));
        assertNotNull(control[0]);
        instrumentation.runOnMainSync(control[0]::performClick);
        waitFor("开关: on"); waitFor("状态: native change");
        tap("更新原生属性"); waitFor("开关: off");
        instrumentation.runOnMainSync(()->assertFalse(((android.widget.Switch)control[0]).isChecked()));
        tap("调用原生方法"); waitFor("状态: ref toggle");
        instrumentation.runOnMainSync(()->assertTrue(((android.widget.Switch)control[0]).isChecked()));
        tap("测量原生节点"); waitFor("状态: measure 100");
        tap("组件 ref 聚焦"); waitFor("状态: component focus");
        instrumentation.runOnMainSync(()->assertTrue(findTag(activity.getWindow().getDecorView(),"extension-input").hasFocus()));
        tap("卸载原生组件"); waitFor("重新挂载");
        instrumentation.runOnMainSync(()->assertNull(findTag(activity.getWindow().getDecorView(),"extension-switch")));
        tap("检查卸载 ref"); waitFor("状态: ref cleared / stale rejected");
        tap("重新挂载"); waitFor("卸载原生组件");
        instrumentation.runOnMainSync(()->assertNotNull(findTag(activity.getWindow().getDecorView(),"extension-switch")));
        instrumentation.runOnMainSync(()->activity.finish());
    }
    @Test public void testAnimationShowcase() throws Exception {
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=instrumentation.startActivitySync(intent);
        try {
            tap("组件"); tap("动画"); waitFor("01 · 声明式状态动画");
            Thread.sleep(200);
            tap("展开"); Thread.sleep(300);
            final float density=activity.getResources().getDisplayMetrics().density;
            instrumentation.runOnMainSync(() -> {
                View box=findTag(activity.getWindow().getDecorView(),"animation-layout-box");
                float width=box.getWidth()/density;
                assertTrue("Animation intermediate width="+width,width>70 && width<140);
            });
            Thread.sleep(800);
            instrumentation.runOnMainSync(() -> assertEquals(140f,findTag(activity.getWindow().getDecorView(),"animation-layout-box").getWidth()/density,1f));
            tap("播放 / 重播"); waitFor("串行动画完成");
            tap("播放 / 重播"); Thread.sleep(150); tap("取消"); waitFor("已取消");
            tap("开始往返"); Thread.sleep(500);
            instrumentation.runOnMainSync(() -> assertTrue(findTag(activity.getWindow().getDecorView(),"animation-repeat-box").getTranslationX()>0));
            tap("停止并复位"); Thread.sleep(500);
            instrumentation.runOnMainSync(() -> assertEquals(0f,findTag(activity.getWindow().getDecorView(),"animation-repeat-box").getTranslationX(),0.1f));
            tap("Counter"); waitFor("Count: 0");
        } finally { instrumentation.runOnMainSync(() -> activity.finish()); }
    }

    @Test public void testSharedPages() throws Exception {
        Intent intent=new Intent(instrumentation.getTargetContext(),MainActivity.class); intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity=instrumentation.startActivitySync(intent);
        waitFor("Count: 0"); tap("+1"); waitFor("Count: 1");
        tap("Async form"); waitFor("Status: idle");
        TextView field=waitFor("");
        assertTrue(field instanceof EditText);
        instrumentation.runOnMainSync(()->field.setText("Android shared task"));
        tap("Add task"); waitFor("Android shared task");
        tap("Wait"); waitFor("Status: done");
        tap("Load message"); waitFor("Status: loaded from HTTP");
        // A new page owns an independent Core and a fresh state frame.
        tap("Counter"); waitFor("Count: 0"); tap("+1"); waitFor("Count: 1");
    }
}
