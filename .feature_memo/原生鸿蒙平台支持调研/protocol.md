# 协议与配置

- wire 1.5、Core ABI 2、插件 schema 1/2 独立管理。
- 保留 1 MiB/4096 command、身份/序号/代际、ACK/CommitFailed。
- 保留 SurfaceVisibility、RuntimeStats、路由参数/保活、VirtualList 锚点补偿。
- 验证流程已使用 `aarch64-linux-ohos` 和 API 21 SDK，arm64 模拟器实际通过；harmony/harmony-arm64 正式 CLI target 和 HAP 模板仍未实现。
- 拟议插件 schema 3，样例不是当前可用配置。
- BackPressResult 无 requestId，建议单 in-flight + 本地 token/generation，UI 不互等。
- 文件/服务/订阅沿用合同；不支持明确报错，secureStorage 不降级明文。

## 2026-11-14 当前合同

- wire 1.5、Core ABI2 保持；正式 harmony 目标和插件 schema3 已可用（取代前述建议状态）。
- ModuleResult 最大 65536 UTF-16 单元；不可序列化/超限只拒绝该请求，不能毒化 Core。
- 媒体 playTimeDidChanged 使用 x/duration 毫秒；firstFrameDidDisplay 只来自 AVPlayer startRenderFrame。
- HarmonyController 提供 back/selectPage/setVisibility/setMaxRetainedPages/trimMemory/onPageEvicted/inspectRuntime/onRuntimeStats。
- harmony.maxRetainedPages 默认 Infinity、至少1；showPageTabs 默认true。路由参数 UTF-8 上限49152字节。
- 通知/后台 inbox 最多100项且48KB，读取不删除，ack确认；未配置 tokenProvider 时 notifications.register 不可用。
- WorkScheduler repeatCount:1，最少7200000ms，delaySeconds 是最早要求不是准时承诺。
- BLE/linking 最多64项有序队列，其他状态事件合并；取消最后订阅释放所属定位监听。隐藏页停止BLE/NFC。
- NativeComponent.invoke 支持 JSON NAPI 值或 Promise；原生异常保留标准错误分类。
