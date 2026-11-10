# 协议与兼容约定

macOS 首期已实现；鸿蒙仍按以下待实施约定推进：

- 复用现有 Handshake、Commit/ACK、Measure、ModuleResult 等；平台增加本身不提升通信协议 major。
- 固定线程单 context、build/epoch/surface/generation/sequence 校验、缓冲区所有权保持现有约束。
- macOS CLI/目标为 `macos` / `macos-arm64`；鸿蒙拟为 `harmony` / `harmony-arm64`。
- 构建 manifest 新增目标工具链身份；原有 `native` 含义不变。
- macOS 复用现有应用标识与页面配置，不要求新增 macos 区块；harmony 配置仍待后续设计。新 SDK 保持旧配置默认行为。
- 插件 schema 2 的 macOS 声明已实现，新 SDK 同时读取 schema 1；旧 SDK 不承诺读取 schema 2。
- macOS 插件声明 AppKit 平台源码及独立工厂 `MacOSPlatformExtensions`；可复用纯 Foundation 服务实现，UIKit 组件/工厂不能直接复用。
- 鸿蒙绑定与工厂 ABI 待探针确定；未支持组件明确诊断，不静默跳过。

- 2026-11-09：macOS playTimeDidChanged 的 x（当前位置）及 duration 明确以毫秒上报，不使用 AVPlayer 原始秒数。鼠标滚动接管发送 touchCancel 并终止该次触摸流；stopPropagation 不影响宿主滚动仲裁。
