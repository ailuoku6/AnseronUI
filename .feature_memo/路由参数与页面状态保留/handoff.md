# Handoff

用户要求支持路由参数，并在 A→B→返回时保留 A 状态。

实现：原生每个 route entry 持有 Host/Core/Root。push detach 当前 root 而不 destroy；pop 销毁顶层再复用底层。replace 销毁顶层；load/destroy 清空全部。Router handler 捕获 entry id 防串参。Web 推荐入口 `BrowserPageStack`，根据 BrowserRouter entry ID 缓存 BrowserHost 与 root。

示例已编辑 Counter 与 AsyncForm，并更新 app scaffold Home/Details；docs/routing.md 已改为新契约。

已通过 framework 49 项、typecheck、Android APK、macOS AOT/AppKit、WebKit routing browser integration 和 iOS Xcode app build。iOS 模拟器 3 项路由单测/UI 用例通过，报告 `.verification/ios-app/Logs/Test/Test-AnseronUIDemo-2026.11.10_09-36-41-+0800.xcresult`。

用户工作区预有参数接口和 demo 修改；保留并集成。其它 macOS 和原生服务改动与本任务无关。
