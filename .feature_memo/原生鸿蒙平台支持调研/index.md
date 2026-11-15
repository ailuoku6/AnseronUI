# 原生鸿蒙平台支持调研与能力对齐

- 状态：API 21 原生集成及主要能力对齐已实现；系统资格与真机/射频验收未完成。
- 更新：2026-11-14。
- 当前用户目标：完善鸿蒙能力，直到与其他端对齐。
- 最新实现：通知/后台/BLE/NFC、持久收件箱、链接订阅、可见性/保活回收、触摸仲裁/焦点、AVPlayer 真实首帧及毫秒进度、原生扩展示例、全链路宿主统计。
- 最新结果：Harmony 40 项单元回归；framework 80；tooling 30 通过/2 skip；build 7；npm tarball/独立工程验证通过。API 21 模拟器 14 组设备回归，提醒计划 1700002 单列 blocked，未计为通过。最终日志见 .verification/harmony/parity-*.log。

## 文档导航

- docs/harmonyos.md：当前实现/验证矩阵与复跑。
- docs/native-services.md、docs/native-extensions.md：平台接入及系统限制。
- docs/page-lifecycle.md、docs/performance.md：保活/回收/检查接口。
- brief.md / tech.md / protocol.md：目标、架构及合同。
- files.md / decisions.md / changes.md：文件与决策历史。
- handoff.md：续做入口。
- ../recording-preferences.md：无额外记录偏好。

## 外部验收边界

代理提醒需要应用使用资格/配额，当前模拟器返回 1700002；推送需业务 tokenProvider/SDK/凭据。后台最少两小时时间条件，真实冷进程唤醒未验收。BLE/NFC 需要真机外设/标签；位置、选择器、分享、触感、真实服务器传输、多指/输入法/无障碍及持续性能仍需设备验收。autoCapitalize/autoCorrect 无 Native Node API 映射，保留系统输入法行为。不要声明全部平台语义已无差异。

最终主配置七页 HAP 已构建、安装、启动；scripts/test-harmony-demo.mjs 额外验证原生扩展、5000项列表跳到4000（挂载7行）、头插仍在深处窗口，报告 acceptance/main-results.json。默认示例不声明受限 READ_PASTEBOARD；其他演示权限已配置。
