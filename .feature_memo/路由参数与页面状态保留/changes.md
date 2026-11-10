# Changes

## 2026-11-10
- Added: 保留路由项各自的 Host/Root，pop 返回同实例；replace/pop/load/destroy 有边界明确的释放；路由参数与 API 绑定 entry；增加 Web BrowserPageStack。
- Added: Counter/AsyncForm 与 app scaffold 路由参数/状态示例。
- Verification: framework 49 项、typecheck、Android APK、macOS AOT/AppKit、WebKit A→B→A 参数/计数/草稿保留、同名页面状态隔离及 replace 清理通过。
- iOS Xcode app build 与模拟器 XCTest/UI 通过：3 tests passed（宿主复用、参数生命周期、A→B→A 草稿恢复）。
- Known: 浏览器历史不同步；进程杀死后不恢复；页面持续持有内存。
