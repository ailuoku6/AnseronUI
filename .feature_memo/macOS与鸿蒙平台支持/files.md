# 文件记录

## 本次新增或修改

| 路径 | 作用 |
| --- | --- |
| `internal/design/macos-harmony-support.md` | 完整技术方案，新建 |
| `docs/README.md` | 平台入口与方案链接，区分 macOS 已实现和鸿蒙未实施 |
| `.feature_memo/macOS与鸿蒙平台支持/` | 本需求八份上下文记录，新建 |
| `packages/render-macos/` | AppKit Renderer、宿主容器、扩展 API、Package.swift 与集成测试 |
| `scripts/macos-app.mjs`、`scripts/test-macos.mjs` | macOS `.app` 构建、校验和 AOT/Core 集成测试 |
| `scripts/templates/app/platforms/macos/App.swift` | 独立应用的 AppKit 模板 |
| `examples/native/macos/`、`examples/native-plugin/macos/` | AppKit 演示与插件样例 |
| `scripts/build-core.mjs`、`scripts/native-plugins.mjs`、`scripts/standalone-app.mjs` | macOS 构建目标、schema 2 插件、独立工程 CLI |
| `README.md`、`docs/README.md`、`docs/tooling.md`、`docs/native-extensions.md`、`packages/render-macos/README.md` | macOS 用户文档与验证边界 |

## 实施时的重要入口

- `scripts/build-core.mjs`、`scripts/core-inputs.mjs`：目标构建、两个 archive、缓存。
- `scripts/build-app.mjs`、`scripts/standalone-app.mjs`、`scripts/anseronui.mjs`：仓库/独立工程与 CLI。
- `scripts/native-plugins.mjs`：同时支持 schema 1/2，schema 2 显式加入 AppKit 插件声明，仍严格校验未知字段。
- `scripts/sdk-files.mjs`、`scripts/pack-sdk.mjs`：npm SDK 内容。
- `packages/core/native/transport.c`、`include/anseronui_transport.h`：固定线程、TLS、异步销毁与内存所有权。
- `packages/render-ios`：固定 worker、服务和 C binding 的参考来源；UIKit 视图与动画需 AppKit 适配。
- `packages/render-macos`、`scripts/macos-app.mjs`：已实现 Swift/AppKit Renderer 与直接 `.app` 构建器；不使用 Catalyst，也不生成 Xcode project。
- `internal/toolchain/scriptc/packages/compiler/src/backend/targets.ts`、`backend/native/driver.ts`：已有 macOS 后端，鸿蒙存在 target/driver 缺口；本次未修改。

## 缺陷修复入口

- `packages/render-macos/Sources/AnseronUIRenderMacOS/Text.swift`：统一 TextKit 测量、绘制和命中。
- `packages/render-macos/Sources/AnseronUIRenderMacOS/MediaViews.swift`：图片缩放/裁剪。
- `Renderer.swift`、`Animation.swift`：输入、鼠标、媒体状态及原生坐标变换。
- `packages/render-macos/Tests/RendererRegression.swift`：像素、输入、拖动、滚动、动画及真实本地视频回归。

- 2026-11-09 追加：Renderer.swift 修复原地 MoveChild、按需识别器、视频毫秒/重置状态与触摸滚动；Integration.swift / RendererRegression.swift 增加对应回归；scripts/test-macos.mjs 准备媒体资源。business-runtime.ts 内部服务闭包改为非泛型以兼容 AOT 捕获，不改变公开 API。
