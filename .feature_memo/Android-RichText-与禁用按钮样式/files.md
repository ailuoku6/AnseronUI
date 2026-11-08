# Files

## Recently Modified

| Path | Why it matters | Status |
| --- | --- | --- |
| `packages/render-android/src/main/java/org/anseronui/render/AndroidRenderer.kt` | 解析字符串 spans；设置 Button disabled ColorStateList | completed |
| `packages/render-android/src/main/java/org/anseronui/render/NodeAnimation.kt` | 合并 disabled Button alpha 与声明式 opacity | completed |
| `examples/native/android/app/src/androidTest/java/org/anseronui/demo/RenderViewTest.kt` | RichText/disabled Button 真实 Renderer 回归测试 | completed |

## Important Context

| Path | Why it matters |
| --- | --- |
| `packages/core/src/runtime.ts` | 产生字符串化 spans 的上游映射 |
| `examples/components/page.tsx` | Android 组件页 RichText 和 disabled Button 的业务样例 |
| `examples/native/android/app/build/outputs/androidTest-results/connected/debug` | 设备测试结果 |
