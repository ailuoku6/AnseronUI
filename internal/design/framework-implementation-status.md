# AnseronUI 框架实施状态

> 本文保留 2026-11-07 初始框架阶段的验证快照，测试数量和当时限制不是当前完成度声明。最新使用与能力见[公开文档](../../docs/README.md)和[能力清单](../../docs/capabilities.md)。

日期：2026-11-07。目标架构见[方案 v5](./anseronui-framework.md)。本页记录当前已验证范围和仍需跨越的工程门槛。

| 工作线 | 本地状态 | 验证 |
| --- | --- | --- |
| TSX 与 Hooks | 自有 TSX lowering、函数组件、常用 Hooks、keyed frame、ACK 后 Effect | 框架 TypeScript 检查与 13 个测试通过 |
| 布局与测量 | 项目内 Flexily 0.8.5 适配、平台文本测量与 Core 缓存 | `npm run test:layout` 的 Node/native/library/Wasm 差分通过 |
| 共享 Core | ReferenceRuntime AOT 编成 arm64 native archive 与 WASI Wasm reactor；Timer 和 HTTP 作为 host services 回填 Promise continuation | Native、Wasm counter/表单/timer/HTTP/protocol/dispose probes 通过 |
| iOS | UIKit renderer、owner-thread Core worker、C transport 与 Swift binding | Xcode 模拟器 UI 测试通过；iOS Simulator 与 arm64 device `.app` 均构建成功。device app 未签名 |
| Android | Android View renderer、HandlerThread Core worker、JNI transport 与 Android app | arm64 APK 成功构建；模拟器 instrumentation runner 测试通过 |
| Web | DOM renderer 与浏览器 WASI adapter 执行相同的 `core.wasm` | Browser Wasm 实测输入/列表、Timer、HTTP；production build 通过 |
| Compiler embedding | pinned scriptc v0.4.8 增加 opt-in `async_embedding.version=1`、bounded scheduler、thread instance 与显式 shutdown patch | async profile/cache 测试 14 项通过；平台 archive 均由该 patch 编译 |
| 生命周期与协议 | 固定 owner thread、线程本地 runtime、envelope/ACK 校验、跨端 teardown | 4 个 native 线程累计 200 次创建/step/close；iOS 与 Android page-replacement 测试通过 |

## 当前边界

该仓库现在是一套可运行的跨端框架基础，不只是 renderer 或 SDK 草案。async embedding patch 绑定 scriptc v0.4.8，compiler 依赖需联网准备；升级该版本前须移植和重跑跨平台验证。任意仍挂起的 async fiber 无法被强制取消，Core shutdown 会返回未完成状态并保留实例。设备签名、应用商店分发、更多设备/IME/accessibility、持续集成与内存预算仍待单独验收。热更新不在首版范围。

## 可重复构建与验证

根目录 `anseronui.config.json` 声明共享页面入口。`npm run prepare:compiler` 固定并 patch 官方 scriptc v0.4.8；`npm run build:ios`、`build:ios-device`、`build:android` 和 `build:web` 生成各平台应用产物。Native/Wasm Core probes 由 `npm run test:core:native` 与 `test:core:wasm` 执行。

本机 Android `connectedDebugAndroidTest` 无法下载 Gradle Unified Test Platform 依赖（Google Maven TLS handshake failure）；使用同一构建好的 Android test APK 经 adb 直接启动 `AndroidJUnitRunner` 后测试通过。完整跨端验证记录见[feature memo](../../.feature_memo/scriptc跨端框架/changes.md)。
