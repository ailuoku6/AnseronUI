# 变更与验证
## 2026-11-10
- 四端实现、扩展页用例和两项生命周期回归已写入。
- TypeScript 通过；框架 42 tests 通过；tooling 18 tests 与 build 7 tests 通过。
- native/Wasm 编译及各 5 个页面协议回归通过；扩展页额外验证 typed storage/app/device/locale AOT 调用。
- WebKit 集成通过（基本信息、存储、弹窗取消、环境订阅与取消）；需要本机图形服务权限，沙箱内超时。
- iOS App 和 Android APK 构建通过；iOS 标准服务 XCTest 正在运行。
- Android 无连接设备，尚不能实际运行 instrumentation。
- 修复 BrowserHost 在多于一批文本测量时过早结束刷新导致空白首屏。

- 最终 iOS：2 项原生 XCTest（存储/Keychain/订阅清理、未编辑预填输入框）和新增页面 UI test 通过；已导出截图到 `.verification/standard-ios-success/`。
- macOS：真实 AOT 标准信息、存储、窗口订阅/取消和全部既有 AppKit 集成测试通过。
- WebKit：自定义事件源、事件合并/取消、HTTP 状态/响应头、载荷上限、下载引用/释放、取消/超时及页面交互通过。
- Android：完整示例 APK 离线构建通过，无连接设备，未运行 instrumentation。
- Web 生产构建通过；npm 打包测试通过；最终文档/签名变更后重新执行 TypeScript、18 tooling tests 和 npm 打包测试均通过。
- iOS 新发现并修复：按钮会冲刷所有输入框，预填值未同步 lastInputValue 导致发送 inputRevision=0，Core 协议校验拒绝。已修复并加回归。
- 滚动容器内容显式 flexShrink:0；加真实编译后的内容范围断言，确保下方用例可触达。
- iOS 模拟器构建改用临时签名，确保 Keychain 可用；真机仍保持未签名产物。
- 文档：docs/native-services.md 包含完整接口、平台差异、权限与 URL 接入、文件作用域、传输/错误约定。

## 2026-11-10 追加四类能力
- 实现推送注册接入、本地通知及应用级收件箱；后台系统调度与原生处理器；BLE 扫描/GATT/通知；NFC NDEF 文本/URL读取与文本写入；追加 Extensions 可操作用例及配置文档。
- 用户最新范围：排除生物识别、暂不支付。
- 通过：framework typecheck；45 个框架测试（含 BLE 字节、监听清理、过期 chooser、重复事件队列/溢出）；18 tooling；7 build；npm package；iOS 真实 AOT 业务编译；Android APK；macOS AOT/AppKit 集成；Web 生产构建（含独立 Service Worker）；WebKit 用例、持久消息确认与 Worker 执行结果。
- iOS：新增 UI 展示用例通过，实际滚动到通知入口并读取 []；新增持久化/选择性确认消费和原有服务生命周期两项最终 XCTest 通过。
- 测试发现 Swift 直接原生传 Int 的 delaySeconds 会被 as? Double 忽略，已统一 NSNumber.doubleValue 并回归通过。
- BLE/NFC 真实硬件交互、APNs／FCM 实际推送及后台系统唤醒未在此环境验证。Android 无连接设备。Apple Swift 5 仍有系统 SDK sendability／delegate actor 警告；编译无错误。
- 记录在 .verification/advanced-*.log；iOS 单元结果 Test-AnseronUIDemo-2026.11.10_09-13-23-+0800.xcresult；页面截图 .verification/advanced-ios-screen/3E7B3F66-F1F4-4E9A-B2ED-DCF0AE5B7500.png。
