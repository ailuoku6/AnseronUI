# 交接说明

先读 `index.md`、`internal/design/macos-harmony-support.md` 和 `packages/render-macos/README.md`。

用户要求支持 macOS/鸿蒙，确认不用 Catalyst 后要求先做 macOS。Swift + AppKit 首期已实现并真实构建运行；鸿蒙仍为 ArkTS Stage 外壳 + C++ Host + ArkUI Native Node 的方案，未实施。

macOS 已新增 `packages/render-macos`、NSView 容器、原生 `.app` 打包/运行 CLI、独立应用模板及 schema 2 AppKit 插件。共享 TSX/Core/协议复用。scriptc 已有 macOS arm64/x64 后端，不使用 Catalyst/macabi。构建主机要求 macOS 15+，产物声明最低 macOS 14；当前仅在 Apple Silicon 的 macOS 27.2 / Xcode 27.2 验证，Intel、macOS 14 尚未实测。

集成测试覆盖计数器、表单、路由、resize、Promise/计时器取消、平台 Module、原生组件/ref、滚动和销毁；实际 AppKit 按钮交互也已验证。追加的 AppKit 回归已覆盖 RichText 命中/像素、IME field editor 组合输入、图片缩放/占位、拖动取消、动画变换/取消/销毁、滚动、视频首帧/进度/结束和错误。桌面实测 RichText span 点击与悬浮球连续拖动通过。完整无障碍、真实输入法候选交互、旧系统仍待验收。鸿蒙开始时需新增目标/SDK driver/runtime 并先做设备 Core 探针。

注意固定 OS worker 单 context；显式 target 配 clang 当前被拒绝。AppKit 使用 flipped 坐标、NSScrollView documentView、TextKit 测量和宿主侧动画；UIKit 组件/工厂不能直接当 macOS 插件。初版 Catalyst 决策已标为历史，不按旧路线实施。

系统视频解码测试需允许 AVFoundation 访问系统服务；受限沙箱会报 Cannot Decode (-11821/-12911)，系统服务可用时完整测试通过。使用 `node scripts/test-macos.mjs` 重编并运行测试。

用户反馈的暂停漏点、进度 0s 与触摸区拖动不滚动已修复。关键根因是原地 MoveChild 卸载按钮，必须保留原生鼠标跟踪；进度协议为毫秒。桌面按住暂停 1.8 秒跨进度提交后仍成功暂停于约 2.33 秒。pan-y 纵拖/横拖、none 与 stopPropagation 均已桌面验证。回归新增实际 TSX 视频按钮链路和拖动策略；测试资源复制到测试二进制旁 assets。
