# 续接
实现完成，先读 index.md / changes.md / docs/native-services.md。
基础标准服务及通知、后台任务、BLE/GATT、NFC/NDEF 与 Extensions 用例已接入。用户明确不做生物识别，支付先不接。
通知和后台结果为应用级持久收件箱，读取后按 id acknowledge；后台工作由启动时注册的原生/Service Worker 处理器执行，不运行卸载的 TSX。Android 远程推送需宿主配置 FCM/厂商 tokenProvider；Apple 需 APNs 签名；Web 需活跃 worker 与 VAPID。真实推送、BLE/NFC 硬件、系统后台唤醒尚需设备联调，不能声称生产配置已完成。
验证：45 framework、18 tooling、7 build、npm package、Web 生产构建与 WebKit、Android APK、macOS AOT/AppKit、iOS AOT/XCTest/UI 操作。最终 iOS 两项服务单测通过；UI 用例在前一轮已通过。见 advanced 日志与截图。
Apple StandardServices/ApplicationServices/RadioServices 三组双端副本保持一致；iOS 两份项目生成器需包含新 Swift 文件。模板已接通知委托回调，demo 注册后台示例任务。
保留已有 macOS 平台需求改动；此次未提交 git。剩余是用户凭据/签名/真机联调，无待回答的支付问题。
