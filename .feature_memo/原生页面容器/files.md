# 文件

- `packages/render-ios/Sources/AnseronUIRenderIOS/AnseronUIRenderView.swift`：iOS 容器。
- `packages/render-android/src/main/java/org/anseronui/render/AnseronUIRenderView.kt`：Android 容器。
- `examples/native/ios/App.swift`、`examples/native/android/app/src/main/java/org/anseronui/demo/MainActivity.kt`：接入。
- `scripts/generate-ios-project.py`：纳入新增 Swift 源码。

- `examples/native/ios/RenderViewTests.swift`、`examples/native/android/app/src/androidTest/java/org/anseronui/demo/RenderViewTest.kt`：4 项生命周期场景 / 平台。
- `packages/render-android/src/main/java/org/anseronui/render/AndroidHost.kt`：基础节点握手，关闭后 resize 保护。
- `packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift`：验证时补齐并行媒体修改中的缩放转换函数、事件参数顺序；后续媒体修改仍由原工作流维护。
- 两端 README、根 README、生成的 Xcode project/scheme：接入说明与测试目标。
