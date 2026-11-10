# 文件
- packages/ui/src/native-services.ts：公共接口和 typed facade。
- packages/core/src/business-runtime.ts：facade 注入、订阅与卸载清理。
- packages/render-web/src/native-services.ts：浏览器系统服务。
- packages/render-ios/Sources/AnseronUIRenderIOS/StandardServices.swift：Apple 实现。
- packages/render-macos/Sources/AnseronUIRenderMacOS/StandardServices.swift：相同副本。
- packages/render-android/src/main/java/org/anseronui/render/StandardServices.kt：Android 实现与文件 Provider。
- examples/extensions/native-showcase.tsx：系统能力用例，原扩展页包含该区。
- 各 Host、Extensions、示例清单和生成模板：默认接入及权限/链接回调。
- 工作区另有并行 macOS 需求变更，保留已有内容。

- docs/native-services.md：完整能力与平台差异说明。
- packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift：预填输入值同步与有效版本修复。
- scripts/build-app.mjs、scripts/standalone-app.mjs：模拟器临时签名，保证 Keychain 可用。
- 测试截图：.verification/standard-ios-success/2FB71DDF-5F8A-444C-A146-416CE100BAC4.png。

- packages/ui/src/native-services.ts：追加四类 typed service 及结果类型。
- Apple ApplicationServices.swift / RadioServices.swift：通知、BGTaskScheduler、CoreBluetooth、CoreNFC；iOS 项目生成器双份 source list 已更新。
- Android ApplicationServices.kt / RadioServices.kt：收件箱、推送适配、JobService、AlarmManager、GATT、NDEF；库 Manifest 注册服务和 receiver。
- packages/render-web/src/{application-services,service-inbox,service-worker-services,radio-services}.ts：Web Push/Sync、IndexedDB 收件箱、BLE/NFC。
- examples/extensions/device-showcase.tsx：追加用例；examples/native/web/native-worker.ts：后台处理器；原生 demo 注册后台处理器并转发通知回调。
- iOS/Android/macOS demo 与 scaffold 的 App 入口、iOS plist、Android demo manifest、macOS plist 生成：系统接入配置。
- examples/native/ios/DeviceServices.entitlements.example：APNs/NFC 权限配置示例，需合并自己的签名配置。
- 测试 packages/render-web/test/radio-services.test.ts 与 extensions.browser.ts、iOS RenderViewTests/SharedCoreUITests。
