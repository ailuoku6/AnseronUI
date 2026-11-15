# HarmonyOS Renderer

最低 HarmonyOS 6.0.1/API 21。使用 Stage/ArkTS Host、C++ ArkUI Native Node 和固定线程 AOT Core。

构建、标准服务、原生扩展、生命周期、测试和实机限制见 [HarmonyOS 支持](../../docs/harmonyos.md)。

- src/main/cpp/bridge.cpp：线程传输、渲染、事件、ref、性能计时。
- src/main/ets/HarmonyHost.ets：协议、平台服务、生命周期、测量。
- HarmonyMedia / HarmonyVideoSurface：AVPlayer 与 ArkUI surface。
- HarmonyApplicationServices：通知/后台处理器和持久收件箱。
- HarmonyRadioServices：BLE/GATT 与 NFC/NDEF。
- HarmonyPageStack / AnseronView：路由保活、回收和宿主容器。
- test：以 OS adapters 模拟运行实际 ArkTS；API 21 HAP 编译及设备测试是独立验收。
