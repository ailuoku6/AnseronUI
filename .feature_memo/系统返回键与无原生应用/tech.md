# Technical Notes

## Current Approach

- `scripts/anseronui.mjs` 的 `create` 生成 TSX 页面、配置、Web 入口和构建脚本；`integrate` 为现有项目生成最小页面和接入清单。
- `scripts/stage-core.mjs` 将配置页面编译入口和 `name` 写入 `.verification/.../manifest.json`。iOS/Android 构建把 manifest 复制到原生资源目录。
- 示例 iOS `DemoController` 和 Android `MainActivity` 从 manifest 动态创建页面选择/按钮；`AnseronUIRenderView` 在平台侧维护 route stack，Core 的 `router` module 请求先完成再执行页面切换。
- Web `BrowserHost` 支持 `handleBackPress()`；生成 Web 入口监听 `Escape` / `BrowserBack`，未消费时回退路由。

## Key Constraints

- `onBackPress` 必须同步返回 boolean，Core 在当前 `BackPress` 输入处理期间按渲染树后序顺序调用回调。
- Android generic host 在 `Activity.onBackPressed()` 中依次调用 `handleBackPress()`、`pop()`、系统默认返回。
- iOS 没有统一物理返回键，导航控制器需要显式调用 `pageView.handleBackPress()`。
- 原生和 Web 构建共享 `.verification/native-source`，不能并行执行构建。

## Dependencies and Patterns

- 协议由 `packages/protocol` 定义 `BackPress` / `BackPressResult`。
- Core 运行时在 `packages/core/src/runtime.ts` 维护回调映射和异常诊断 `BACK_PRESS_ERROR`。
- iOS 使用 semaphore、Android 使用 CountDownLatch 等待同步结果，超时按未消费处理。

## Risks

- 当前 generic host 的壳仍是示例宿主；自定义品牌壳、bundle id、深链和产品级导航需要后续 CLI/宿主扩展。
