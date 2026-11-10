# AnseronUI 文档

AnseronUI 是一个使用 TypeScript/TSX 编写共享页面、通过 AOT Core 在 iOS、Android、Web 和 macOS 上渲染的跨端 UI 框架。业务代码写在 TSX 中，平台负责视图、文本测量、网络、计时器和系统能力。

## 从这里开始

| 文档 | 内容 |
| --- | --- |
| [根 README](../README.md) | 创建 App、编写 TSX 页面、运行各平台和日常开发命令 |
| [能力清单](capabilities.md) | 组件、属性、事件、Hooks、动画、路由、扩展和平台支持 |
| [架构与原理](architecture.md) | 分层设计、编译运行链路、协议、生命周期、并发模型和 `.gitignore` |
| [页面与 Core 合包](core-bundles.md) | 页面为何触发重编、实例与二进制的区别、独立编译方向 |
| [TS/TSX 编写限制](typescript-limitations.md) | scriptc 限制、JSX/Hook 规则、Node 兼容表的适用范围 |
| [应用创建与接入](tooling.md) | `create`、`integrate`、`check`、`build` 命令 |
| [页面路由](routing.md) | `useRouter()`、JSON 参数与页面状态保留 |
| [系统返回键](back-press.md) | Android、iOS、Web 的返回键消费流程 |
| [原生扩展](native-extensions.md) | Module、原生组件、事件和 ref |
| [动画](animations.md) | 声明式动画、ref 动画、取消和平台帧时钟 |
| [布局引擎](../packages/layout/README.md) | Flexily 适配、布局节点和测量约束 |
| [Android Renderer](../packages/render-android/README.md) | Android 容器、生命周期和底层 Renderer |
| [macOS Renderer](../packages/render-macos/README.md) | AppKit 构建、容器、能力与当前验证边界 |
| [iOS Renderer](../packages/render-ios/README.md) | iOS 容器、生命周期和底层 Renderer |

## 贡献者与历史记录

- [框架开发与仓库示例](framework-development.md)：框架依赖、仓库示例和修改后的验证命令；
- [框架技术方案](../internal/design/anseronui-framework.md)：设计目标和决策历史；
- [macOS 与鸿蒙支持方案](../internal/design/macos-harmony-support.md)：AppKit 实现记录及鸿蒙平台的推荐架构、工具链改造和分阶段验收；
- [阶段实施记录](../internal/design/framework-implementation-status.md)：早期框架验证快照，不等同最新测试结果；
- [Flexily 静态编译适配](../internal/design/flexily-scriptc-adaptation.md)：适配点和证据边界；
- [布局库调研](../internal/design/ts-layout-libraries-research.md)：历史选型依据；
- [布局验证原型](../internal/experiments/flexily-scriptc/README.md)：历史探针，不是当前框架入口。

## 计时器

[跨端计时器](timers.md) 说明 `setTimeout`、取消、页面清理与 `useTimers()`。

## 文档范围

根目录和 `docs/` 中的文档描述 AnseronUI 当前实现。`internal/design/` 保存设计记录和调研证据，适合贡献者了解决策历史；它不替代公开 API 文档。

主仓库内的 `internal/toolchain/scriptc/` 源码保留 [scriptc](https://github.com/vercel-labs/scriptc) 上游原文，不在框架中文化范围内。

`packages/flexily/` 是基于上游 Flexily 0.8.5 的保留源码和适配副本。其上游 README、CHANGELOG、CONTRIBUTING 和 MIT 许可文件保留原文，以便追溯来源；AnseronUI 的使用方式以本仓库的[布局引擎文档](../packages/layout/README.md)和[架构文档](architecture.md)为准。

## 当前实现边界

当前版本已经可以构建 iOS 模拟器/设备产物、Android APK、Web/Wasm 应用和原生 AppKit macOS `.app`，支持共享 TSX 页面、基础组件、布局、事件、媒体、动画、路由、返回键、平台 Module、原生组件和 ref。macOS 的系统输入、媒体、无障碍和旧系统一致性仍需专项验证。框架尚未包含热更新、完整应用签名发布、深链参数、页面缓存、完整无障碍语义和通用插件生态；鸿蒙仍处于技术方案阶段。

- [标准系统能力与用例](native-services.md)：HTTP、存储、系统交互、环境订阅、权限定位、文件选择与传输、推送、后台任务、BLE 与 NFC。
