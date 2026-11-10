# 技术
复用 InvokeModule/ModuleResult/CancelRequest，不修改线协议。
events.next 以 subscription id 长轮询；宿主连续监听，空闲仅保留最新值；unsubscribe 发 CancelRequest+events.close。
ServiceSlot 管理订阅，组件卸载取消；宿主销毁清理监听、文件和传输。
Apple 的 StandardServices.swift 两端副本保持相同，使用条件编译。
Android 使用平台 Fragment 接收权限和文件选择回调，不引入 AndroidX 运行时依赖。

- 2026-11-10 追加：Apple/Android ApplicationServices 负责应用级持久消息收件箱、通知与后台调度；RadioServices 负责页面级 BLE 和 NFC。Apple 对应三个 Swift 文件保持双端副本一致。
- 后台处理器在应用启动时原生注册：iOS BGTaskScheduler、Android JobScheduler、Web Service Worker Background Sync。没有无头执行页面 TSX。
- Android 推送传输由宿主 FCM/厂商 SDK 通过 tokenProvider、receive、tokenChanged 接入；Web 宿主需传入激活的 ServiceWorkerRegistration 与 VAPID 公钥。
- BLE 使用原生 GATT / Web Bluetooth，通知事件独立有序队列，最多 64，重复值保留；溢出显式报 IO_ERROR。普通状态订阅继续合并最新值。
