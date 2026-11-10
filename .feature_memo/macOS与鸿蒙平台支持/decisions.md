# 方案建议记录

## 2026-11-09：按“先写方案”范围交付

- 用户要求先写技术方案，已交付文档，不将讨论视为开始完整平台实施。
- 推荐路线尚待实施验证，不记为用户已最终确认。

## 2026-11-09：初版推荐 Catalyst 与鸿蒙 Native Node（macOS 路线已被后续修订替代）

- Catalyst 可复用 UIKit Renderer，首期成本预计低于新建 AppKit Renderer，但当前 compiler 仍需新目标。
- 鸿蒙原生节点操作适合现有命令式 Commit；ArkTS 仅承接宿主及系统服务。
- AppKit、WebView/Wasm 作为明确备选，若 P0 失败按证据重新比较，不静默更换架构。

## 2026-11-09：先验证 runtime，再补 UI 和工具

- LLVM 生成机器码不等于 scriptc runtime 可在目标系统运行。
- P0 要在真实目标环境验证两个 archive、async、TLS、销毁和错误路径。
- 插件采用新 schema 显式支持新平台，缓存加入工具链身份；这些是完整交付前置条件。

## 2026-11-09：根据用户方向改为 AppKit

- 用户提出“能不能不用 Catalyst”，方案改为 Swift + AppKit 原生 Renderer。
- 新增 render-macos 与原生 macOS 工程模板；UI 控件、文本、输入和动画使用 AppKit 实现。
- 编译链利用 scriptc 已有 macOS 后端，macOS 不再新增 macabi 目标；鸿蒙仍需 target/runtime 移植。
- 代价：不能沿用 UIKit 渲染器工作量估计；补足坐标、文本测量、IME、响应链和插件工厂适配。
- 本次仍仅更新技术方案，不开始平台实现。

## 2026-11-09：按用户指示先交付 macOS

- 用户要求“先做 macOS 的实现”，实施 Swift + AppKit，鸿蒙保留方案。
- 首期固定 arm64、单窗口，以 Xcode Clang/Swift 直接打包 `.app`，不引入 Xcode project 生成器。
- Core 目标独立为 `macos-arm64`，插件 schema 2 显式声明 AppKit 源码/工厂，旧 schema 1 继续兼容原三端。
- 最低部署版本声明 14 不等于已在 macOS 14 验收；本轮真实运行环境为 macOS 27.2 / Xcode 27.2。
