# 页面、独立 Core 与业务包构建

AnseronUI 现在使用 **Framework Core + Business Bundle** 两份独立编译产物。同一个应用配置的所有页面进入一个业务包，页面变化不会重新编译未变化的 Framework Core。原生宿主最终仍需要重新链接、打包；这不是运行中的业务热更新。

## 编译边界

```text
布局 / Flexily / 测量规划 / 渲染差分       页面 TSX / UI API / 业务执行 SDK
                  ↓ scriptc                         ↓ scriptc
          Framework Core                       Business Bundle
                  ↕          版本化 JSON 消息          ↕
                  平台组合适配器 → UIKit / Android View / DOM
```

| 层 | 所有权与职责 |
| --- | --- |
| Framework Core | Flex 布局、文本测量查询、frame 校验、节点/属性/事件绑定差分；入口不导入任何业务页面 |
| Business Bundle | 所有登记页面、组件求值、Hooks 状态、Context、effect/ref、事件闭包、模块请求、页面生命周期和计时器回调 |
| 业务执行 SDK | `business-runtime.ts` 和 UI API 等随业务编译的运行时胶水；由于泛型状态和闭包与业务类型相连，这部分明确保留在业务侧 |
| 平台宿主 | 两边调度、平台视图与文本测量、网络、系统计时器、路由和原生扩展 |

这里的“独立 Core”不是把全部框架 TypeScript 都移进一个库。稳定的数据计算内核可以预编译复用；业务 SDK 则随业务包编译。业务源码变化时，Framework Core 的 archive/Wasm 内容和修改时间均应保持不变。

`packages/core/src/runtime.ts` 的 `ReferenceRuntime` 是 JavaScript 参考组合：同步调用同一内核。原生和 Wasm 使用 `BusinessRuntime`，由宿主搬运消息，不跨库传递函数、TS 对象或内存指针。

## 版本化消息与生命周期

内部 ABI 当前为 `CORE_ABI_VERSION = 2`，定义在 [contracts.ts](../packages/core/src/contracts.ts)。`Render` 请求包含 surface/generation/revision/round、纯数据节点树、上次提交树、文本测量缓存和请求编号；`RenderResult` 回复包含 frame、测量查询和渲染命令。Framework Core 按 surface 保留布局树，根据节点 ID 增量同步，而业务侧仍发送完整描述树。

`ReleaseSurface` / `SurfaceReleased` 消息释放指定 surface/generation 的持久化布局状态；旧 generation 的释放不会删除较新布局树。Framework 额外导出 `dispose()`，由 Native 组合适配器和 Wasm adapter 在实例关闭时调用。ReferenceRuntime 为每个实例持有独立 LayoutKernel；单次探针函数 `render()` 保持计算后释放的行为。

ABI 1 与 ABI 2 不能混用，升级后需要重新构建 Framework Core 和 Business Bundle。外部宿主协议仍为 major 1 / minor 0，C transport 接口保持不变。

- 两份产物启动时核对 ABI 版本；不兼容时拒绝启动。
- 请求和结果按宿主循环串行交换，进入另一库前前一调用已经返回，不通过同步 Hook 回调重入库。
- 跨库字节只在其所有者规定的有效期内读取，接收方复制/解析；两个运行时不共享引用计数和分配器。
- 原生 profile 使用 `localize_runtime` 隔离符号，`instance_per_thread` 隔离 owner thread 的状态。
- Web 为两份 Wasm 分别创建 instance 和 memory。`WasmRuntime` 负责两个运行时的初始化、消息搬运和销毁。
- effect、ref 和业务状态仍在 Renderer 的 CommitAck 后提交；旧 generation 的回复不会写入新页面。

业务包可包含多个页面。路由切换只是创建/销毁运行时状态，并不会编译，也不意味着每页有一份 Framework Core。

## 构建与产物

现有命令保持可用：

```sh
npm run build:ios
npm run build:android
npm run build:web
# 仅编译和链接 Core/业务产物，不构建应用壳
npm run build:core:native
npm run build:core:ios
npm run build:core:wasm
# 单独预编译可复用内核；target 可为 native/ios-simulator/ios-device/android/wasm
npm run build:framework -- ios-simulator
# 要求对应内核缓存已存在且有效，只编译业务、链接组合产物
npm run build:business -- ios-simulator
```

构建器分别检查两份源码指纹、目标平台、ABI 和产物 SHA-256：有效时输出 `Reusing framework` / `Reusing business`；缺失、被修改或输入变化时只编译受影响部分。

| 路径 | 内容 |
| --- | --- |
| `.verification/framework-<target>/entry.lib.a` | 独立 Framework Core 原生静态库 |
| `.verification/business-<target>/entry.lib.a` | 独立业务原生静态库 |
| `.verification/core-<target>/entry.lib.a` | 两库及组合适配器的最终链接归档，保留现有宿主链接路径 |
| `.verification/framework-wasm/entry.wasm` | 独立 Framework Core Wasm |
| `.verification/business-wasm/entry.wasm` | 独立业务 Wasm |
| Web public 中的 `framework.wasm` | Framework Core 部署副本 |
| Web public 中的 `core.wasm` | 业务包部署副本，沿用旧 URL 以减少接入改动 |
| `core.manifest.json` | `split-v1` 清单，包含两份输入指纹、产物哈希、ABI 与页面信息 |

iOS/Android 现有 `AnseronUIRenderView` 和 transport 接口无需更换。Web 的 `WasmRuntime.load('/core.wasm')` 默认从同目录加载 `framework.wasm`；不同部署位置可显式传第二个 URL。传入二进制时必须提供两份字节：

```ts
const runtime = await WasmRuntime.load(businessBytes, frameworkBytes);
```

### 什么变化会重编

| 变化 | Framework Core | Business Bundle |
| --- | --- | --- |
| 页面 TS/TSX、页面清单或业务配置 | 复用 | 重编 |
| 内核布局/差分实现 | 重编 | ABI 不变时复用 |
| UI SDK、协议/内部 ABI、编译配置或编译补丁 | 按输入指纹失效 | 按输入指纹失效 |
| 只改 Swift/Kotlin Renderer | 复用 | 复用 |

构建失败或构建期间源码变化不会留下有效的新清单。最终链接/资源复制仍需执行，以保证应用使用当前配置的业务包。缓存是本机工作区级产物复用，不是已经发布的远程 SDK 下载服务；默认 npm 创建的 App 在各自 .anseronui/sdk 中保存编译 staging 和缓存，同一应用内构建会加锁；旧 --local-framework 源码模式仍共享缓存，多个该模式应用应串行构建。Core、JNI 库及宿主产物保存在各自工程。

## 当前边界

- 业务仍需经过 scriptc AOT；不能拷贝 TSX 源码到应用中直接执行。
- 没有动态替换运行中业务包、下载热更新或任意 TS 解释器。
- 数据边界会增加 JSON 序列化和复制成本；当前以正确性、所有权清晰及构建复用为优先，尚未承诺性能收益。
- ABI 升级需要同时更新内核、业务 SDK 和组合适配器；不同 CPU/平台仍各自构建。

源码入口：[内核](../packages/core/src/kernel.ts)、[业务执行 SDK](../packages/core/src/business-runtime.ts)、[原生组合适配器](../packages/core/native/split_bridge.c)、[双 Wasm 适配器](../packages/render-web/src/wasm-runtime.ts)、[构建](../scripts/build-core.mjs)、[指纹](../scripts/core-inputs.mjs)。
