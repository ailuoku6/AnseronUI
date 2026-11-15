# 渲染链路性能验证

性能统计覆盖页面求值、布局树同步、布局与 diff、独立 Core 请求序列化与往返、宿主协议处理、平台文本测量、视图提交和 ACK。默认关闭统计，避免普通页面承担序列化采样开销。

## 获取阶段数据

Web：

```ts
await host.inspectRuntime(true, true); // 启用，并重置累计数据
// 执行待测交互
const core = await host.inspectRuntime();
const hostPhases = host.getPerformanceStats();
await host.inspectRuntime(false); // 关闭；现有累计值保留
```

iOS/macOS 的 `AnseronUIRenderView` 和独立 Host 均提供：

```swift
view.onRuntimeStats = { values in print(values) }
view.inspectRuntime(enabled: true, reset: true)
```

Android：

```kotlin
renderView.onRuntimeStats = { values -> android.util.Log.d("RenderStats", values.toString()) }
renderView.inspectRuntime(enabled = true, reset = true)
```

HarmonyOS（ArkTS，controller 已传给 AnseronView）：

~~~ts
controller.onRuntimeStats = (values: Record<string, number>) => console.info(JSON.stringify(values));
controller.inspectRuntime(true, true);
// 交互完成后再次采样；回调异步返回当前页 Core 与宿主累计值。
controller.inspectRuntime();
controller.inspectRuntime(false);
~~~

Harmony 的 adapterStepMs 在固定 C++ worker 上计时，uiQueueMs 从输出入队到 ArkTS 主线程开始接收；开关默认关闭。统计不包含屏幕合成/GPU 时间，当前没有鸿蒙 FPS 或 RSS 基准结论。

独立 BusinessRuntime 可设置 `profile: true` 并读取 `getStats()`。生成 AOT 入口支持构建配置 `performance: { enabled: true }`；应用仍可通过宿主检查入口开关。诊断协议使用 `InspectRuntime` 和 `RuntimeStats`，协议版本为 1.5。内部 ABI 2 的 profile/timings 是可选扩展；升级后应重新构建并验证 Framework 与 Business。

| 指标 | 含义 |
| --- | --- |
| `evaluateMs` / `renders` | TSX、组件及 Hook 求值累计时间与渲染次数 |
| `syncMs` / `layoutMs` / `diffMs` | 持久布局树同步、布局计算和命令 diff 的累计时间 |
| `serializeMs` / `coreRequestUnits` | 诊断开启时 Core 请求 JSON 序列化时间及 UTF-16 字符单元数；后者不是字节数 |
| `layoutRounds` / `measureRequests` | 布局轮数与跨端文本测量次数 |
| `coreRoundTripMs` | Business 发出布局请求到拿到 Framework 结果的累计时间 |
| `commands` / `commits` / `commitRoundTripMs` | 命令数、完成提交数与等待 ACK 的累计时间 |
| `nodes` / `frames` / `measureCacheEntries` | 当前宿主节点、组件帧及文本测量缓存数量 |
| `surfaces` / `hiddenSurfaces` / `timers` / `modules` | 当前页面、隐藏页面、框架计时器及未完成模块请求数量 |
| `incoming` / `outgoing` / `coreRequests` / `pendingRenders` | 当前排队消息、Core 请求和未完成渲染的页面数量 |
| `adapterStepMs` | 宿主调用 Core 适配器 step 的累计时间，包含其内部工作 |
| `hostMeasureMs` / `rendererApplyMs` / `hostCommits` | 真实平台文本测量、应用提交耗时和提交次数 |
| `inputBytes` / `outputBytes` | Web 宿主收发信封的 UTF-8 字节数 |
| `bridgeInputBytes` / `bridgeOutputBytes` | 原生宿主实际收发 UTF-8 字节数 |
| `bridgeEncodeMs` / `bridgeDecodeMs` / `adapterPostMs` | 原生宿主协议编解码与 post 时间 |
| `uiQueueMs` | 原生输出等候主线程处理的累计排队时间 |

耗时单位均为毫秒。Core 使用毫秒时钟，短阶段可能为 0；宿主使用平台高精度时钟。指标是累计值，阶段之间有包含关系，不能直接相加为总时间。例如 `adapterStepMs` 已包含 Core 运行时间。`RuntimeStats` 与 UI ACK 异步传输，繁忙时各计数可能处于相邻提交的快照；比较前应先等待交互稳定。数据用于定位瓶颈，不直接等于屏幕呈现耗时或 FPS。

## 可复跑基准

```sh
npm run bench:render
npm run build:core:native
npm run bench:render:native
npm run build:core:wasm
npm run bench:render:wasm
```

三个命令分别验证 Reference JS、实际 native AOT 和独立 Business/Framework Wasm。测试场景相同：5000 行不同文本，5 轮创建/销毁，每轮 26 次深度滚动，前 2 次预热后统计，共 120 个样本，并执行窄屏 resize、隐藏/恢复与销毁检查。

报告写入 `.verification/performance/reference.json`、`native.json` 和 `wasm.json`，记录环境、首屏与更新 p50/p95、消息大小/字节量、节点峰值和 Core 分阶段数据。首屏从显示隐藏创建的 surface 开始计时，不包含加载二进制和启动进程。native/Wasm 基准使用标准输入输出进程适配器，因此延迟包含测试进程的通信成本。

这些是采用确定性文本测量和合成 Renderer 的协议吞吐基准。真实 UIKit、Android View、AppKit、DOM 的测量和提交开销要通过下面的真实 UI 回归及宿主统计判断。

`scripts/performance-budgets.json` 提供当前场景的确定性门槛：挂载节点不超过 200、稳定后测量缓存不超过 1024、单条消息不超过 1 MiB，并检查隐藏宿主计时器已取消、销毁后节点清空。缓存只在 ACK 后收缩，布局期间保留必要测量，避免破坏收敛。

PR 工作流 `render-performance.yml` 自动运行共享框架回归与 Reference 预算，上传当次机器报告；Native/Wasm 和真实 UI 使用上述平台命令验证。CI 不把不同运行机器的绝对时延作硬性比较。

本次实现的环境、采样数值与平台验证范围见[本地性能快照](performance-baseline.md)。

相对时延门槛使用同环境基线：

```sh
cp .verification/performance/reference.json /tmp/reference-before.json
npm run bench:render -- --baseline=/tmp/reference-before.json
```

门槛为首屏中位数和更新 p95 不超过基线的 1.3 倍加 2ms。基线必须来自相同模式、场景和机器环境；请在负载稳定且无并行编译的情况下采样，多次复跑确认噪声，不跨机器比较绝对时间。预算针对此测试场景，其他业务需建立自己的数据规模和门槛。

## 真实 UI 回归

在 macOS/Xcode 环境运行：

```sh
npm run test:browser:virtual-list
npm run test:browser:virtual-list:wasm
npm run test:macos
```

WebKit 两种模式使用真实 DOM 文本测量和提交，验证展开、20 次真实滚动、深处定位、头插锚点、隐藏/恢复计时和 resize，生成 `webkit-reference.json` 与 `webkit-wasm.json`。命令行宿主每 50ms 发起一次无副作用的 JS 调用，防止桌面无活动应用时整个 WebKit 页面挂起。滚动样本等候两次 animation frame；无前台焦点的 WKWebView 可能抑制 RAF，100ms 后继续，并在 `paintWaitTimeouts` 记录降级次数。100ms 是请求的等待时间，系统后台限流仍可能使它延长至约 1 秒。因此这些采样是带调度等待的交互时延，不能作为纯计算时延或 GPU 呈现保证。

AppKit 使用真实 AOT Core、NSView、文本与 AVPlayer，覆盖列表动态行高、定位/插入/resize、计时和媒体暂停恢复、保活与内存回收，生成 `appkit-native.json`。它记录首屏和跳转场景耗时及完整宿主指标，不将少量功能场景当作统计分位数。

iOS/UIKit 与 Android View 可通过同一宿主检查接口在设备或模拟器上采样。本次另通过 Android API 35 的 15 项测试（含真实列表）及 iOS 26.4 的 19 项容器测试（含可见性和内存警告回收）。iOS 测试集不包含 UIKit 大列表滚动性能验证；Swift 类型检查、Kotlin 编译和共享 Core 基准不能代替设备滚动流畅度测试。当前预算没有自动断言进程 RSS、GPU 时间或移动设备 FPS；`WasmRuntime.getMemoryStats()` 可读取 Business/Framework 线性内存容量（包括分配器空闲空间，不代表活对象大小）。稳定节点/缓存计数也不能证明不存在所有平台资源泄漏。
