# 需求说明

- 用户目标：让本项目支持构建 macOS 和鸿蒙应用；先写技术方案，确认不用 Catalyst 后要求先实现 macOS。
- 本次范围：仓库源码核对、技术选择、构建/runtime、macOS AppKit 宿主、插件、CLI、文档与验收；鸿蒙保留技术方案。
- 本次交付验收：项目内技术方案；可构建并启动的原生 AppKit `.app`；独立应用模板和插件接口；AOT Core/AppKit 集成测试。
- 推荐首期产品范围：macOS AppKit arm64 单窗口；原生鸿蒙 arm64 真机；共享 TSX 和原生控件。
- 后续范围：桌面多窗口、Intel/Universal、鸿蒙更多设备、完整发布自动化，均待后续需求决定。
- 不确定性：macOS 14/Intel 尚未验证，RichText 命中、IME、媒体、拖动、动画和无障碍待专项验收；鸿蒙 runtime 需移植验证。
