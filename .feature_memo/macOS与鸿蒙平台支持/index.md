# macOS 与鸿蒙平台支持

- 状态：macOS AppKit 首期实现完成；鸿蒙仍处于方案阶段。
- 更新日期：2026-11-09
- 当前重点：macOS 能力补验与发布限制收敛；鸿蒙后续单独进行工具链/runtime 探针。
- 工作区：`TSNative`

## 文档导航

- `internal/design/macos-harmony-support.md`：技术方案正文（路径相对仓库根目录）。
- `../recording-preferences.md`：项目记录偏好，目前无自定义要求。
- `brief.md`：用户目标、范围和验收。
- `tech.md`：技术路径和约束。
- `protocol.md`：协议、目标和插件版本约定。
- `files.md`：已改文件与关键实现入口。
- `decisions.md`：方案建议及依据。
- `changes.md`：本次工作与验证记录。
- `handoff.md`：后续会话入口。

## 当前结论

用户先要求编写方案，随后确认不用 Catalyst，并要求先做 macOS 实现。已交付 Swift + AppKit Renderer、macOS Core 构建目标、`.app` 打包和运行 CLI、独立应用模板及 schema 2 AppKit 插件接口。鸿蒙方案仍采用 ArkTS Stage + C++ Host + ArkUI Native Node，尚未实施。

## 下一步

已修复并回归富文本排版/命中、图片 cover、输入焦点/组合输入、鼠标坐标与取消、动画命中区域、视频状态与媒体错误。追加修复暂停按钮因原地 MoveChild 卸载而漏点、视频进度毫秒单位与鼠标拖动滚动交接，已做实际桌面验证。剩余验收重点是完整无障碍、真实输入法候选交互、 macOS 14/Intel。鸿蒙开始前先锁定 DevEco/Harmony SDK 与设备组合，验证 Core runtime、布局和系统返回。

## 待定项

macOS 当前仅构建/验证 Apple Silicon；产物声明最低 macOS 14，开发机 macOS 27.2 / Xcode 27.2，构建前置 macOS 15+，尚未实测 14 或 Intel。鸿蒙 API 版本、设备 ABI、runtime 移植可行性、ArkUI 绝对布局/文字测量和系统返回适配仍待验证。
