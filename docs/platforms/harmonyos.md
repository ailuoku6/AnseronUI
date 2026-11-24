# HarmonyOS 原生支持

AnseronUI 的鸿蒙目标是原生 HarmonyOS Stage 应用，不依赖 Android 兼容层。最低兼容版本是 HarmonyOS 6.0.1 / API 21；当前构建配方读取 Native SDK 的 `oh-uni-package.json`，固定使用 API 21 SDK；其他 SDK 版本需另行适配验证。

## 架构

TSX 页面先经过现有 UI compiler 和 scriptc AOT 流程，业务 Core 与 Framework Core 分别编译为 `aarch64-linux-ohos` archive。`packages/core/native/transport.c` 在固定后台线程拥有一个 Core context，ArkTS 侧只通过 UTF-8 protocol envelope 发送输入和接收输出。

`packages/render-harmony` 包含 C++ NAPI/ArkUI Native Node renderer 和 ArkTS `HarmonyHost`。Native Node 的创建、属性、frame、子节点和事件都在 UI 线程执行；Core 的 `post/step` 固定在 worker 线程。`ContentSlot` 挂载 `NodeContent`，路由栈为每个保留页面维护独立 Core 和原生节点树。测量调用 API 21 的 `UIContext.getMeasureUtils().measureTextSize`，把 px 结果换回布局使用的 vp。

## 构建和运行

构建主机需要 DevEco Studio/HarmonyOS 6.0.1 API 21 SDK、系统 Python/Patch 工具、Harmony SDK Clang/LLVM；当前 scriptc IR 由主机 LLVM 23 发射，再由 SDK Clang 15 编译 runtime/链接。主机 LLVM 可通过 `HARMONY_LLVM_CLANG` 指定。构建使用固定 API 21 Native SDK，运行设备可为 API 21 或更高版本。

在框架仓库中：

```sh
npm run prepare:compiler
npm run build:core:harmony
npm run build:harmony
npm run harmony
```

CLI 也提供：

```sh
node scripts/anseronui.mjs build harmony --config anseronui.config.json
node scripts/anseronui.mjs run harmony --device 127.0.0.1:5557
```

`run harmony` 会检查设备 API、为本地模拟器用 SDK 自带 debug profile 生成临时签名、安装 HAP 并启动 `EntryAbility`。真实设备和发布构建必须在 `platforms/harmony/build-profile.json5` 配置 DevEco 开发者签名；CLI 不会把 SDK 测试证书用于真机发布。

独立应用的 `anseronui create` 会生成 `platforms/harmony`。应用配置可以指定 `harmony.initialPage` 和 Harmony 权限声明，例如 `harmony.permissions: ["ohos.permission.APPROXIMATELY_LOCATION"]`；生产插件 schema 3 也可声明 `harmony.sources` 和 `harmony.permissions`。构建器将插件源码加入 CMake，并合并权限到模块清单，为运行时授权权限生成 reason 资源。基础 HAP 声明 INTERNET 和 GET_NETWORK_INFO；启用触感、定位、相机、麦克风或蓝牙时，应用应按系统要求显式声明权限。剪贴板读取还受 READ_PASTEBOARD 的系统授权/签名约束：当前模拟器测试签名声明该权限会导致安装失败，因此默认示例不声明；接口仍保留系统拒绝，正式应用需按官方开放条件接入。系统照片/文档选择器不要求读取整个媒体库。

## API 支持与验证状态

| 能力 | 实现 | 当前验证 |
| --- | --- | --- |
| Stage HAP / AOT / CLI | API 21，固定 worker 拥有 Core，ArkUI 主线程渲染 | 模拟器构建、签名、安装和启动 |
| 基础组件 | View/Text/RichText/Button/TextInput/ScrollView/Image/Video/Native | 点击、输入、焦点、图片、视频及自定义组件设备回归 |
| 媒体 | AVPlayer + XComponent surface；真实首帧、毫秒进度、暂停/重置、循环、静音、倍速、缩放；播放按钮与拖动进度条 | asset 图片源、视频首帧/进度、暂停及覆盖返回恢复已实测；编解码器依赖系统 |
| 路由与生命周期 | JSON 参数、独立 Host/Core 保活、usePageEffect、前后台可见性、隐藏动画/视频暂停、容量回收 | push/pop/保活及可见性设备回归；回收/参数重建单元回归 |
| 触摸与 ref | 多 pointer 会话、捕获/冒泡、冻结目标坐标、touchAction 祖先求交、滚动接管 cancel；focus/blur/measure/scrollTo/动画 | touchAction none/auto、单次 cancel、ref.focus 设备回归；多指需真机扩展验收 |
| 标准服务 | HTTP、timer、preferences、Asset 安全存储、clipboard、dialogs、app/device/locale、network、window、安全区、keyboard、权限、linking、location、picker、share、haptics、transfers | 存储、timer/device、订阅入口、窗口指标、重复热启动链接已实测；位置/选择器/分享/触感和完整传输仍需目标设备验收 |
| 通知 | 权限、本地提醒 schedule/cancel、持久收件箱/确认、可插拔 tokenProvider | 单元回归通过；当前模拟器提醒被系统 1700002 拒绝，未计为调度通过；远程推送需业务接入 |
| 后台任务 | WorkSchedulerExtensionAbility、冷启动注册、结果收件箱、查询/取消 | 系统接收/查询/取消已实测；真实延迟唤醒尚未验收 |
| BLE / NFC | 扫描、连接、GATT 发现/读写/notify；NDEF 读/写；取消、超时、关闭清理 | API 21 编译及 OS adapter 模拟回归；连接/射频效果需要硬件 |
| 原生扩展 | 插件 schema 3 harmony.sources/permissions、C++ extensions.h 组件与 Module | DemoSwitch 属性/ref/真实事件、自定义 device.info 设备回归 |
| 性能检查 | Core RuntimeStats + UTF-8 字节、编解码、post/step、主线程排队、测量/提交计时 | API 21 编译、Host 单元测试；性能数值不作为 FPS 保证 |

配置项 harmony.maxRetainedPages 为总存活页数（包含当前页），默认 Infinity，最小 1；harmony.showPageTabs 默认 true。超限或内存压力释放隐藏 Host/Core，路由名称和参数保留，返回时重建 Hook 状态。顶层页签切换重置路由栈。业务嵌入可使用 HarmonyController.setVisibility、setMaxRetainedPages、trimMemory、onPageEvicted、inspectRuntime 和 onRuntimeStats，见页面生命周期与性能文档。

布局使用 Core/Flexily 的 frame；单位为 vp。主题切换覆盖普通节点、RichText span 和 Image.dmSrc。宿主协议 2.0 使用 PatchProps 的 set/unset 更新字段；unset 恢复默认值，无关字段保持原生状态。默认样式与其他端公共基线一致：文本、按钮和输入框默认字号 16vp；Button 由共享 View/Text 组合，默认透明背景、横向 12vp/纵向 6vp 内边距、最小高度 32vp，标题色为 `#007aff`，协议不提供系统 Button 节点；TextInput 使用透明背景、0 内边距、关闭系统下划线、最小测量尺寸 120×32vp。按压按钮的整体透明度为原值的 60%，禁用时为 40%。Text/RichText 支持 `style.lineHeight`，测量与原生 NODE_TEXT_LINE_HEIGHT 使用同一数值；所有元素均支持由 Core 在提交确认后派发的 `onLayout`。TextInput 原生焦点保留跨提交，避免对未变化节点反复拆卸重挂。键盘类型与 returnKeyType 按 ArkUI 映射；autoCapitalize/autoCorrect 目前没有 Native Node API 映射，保留系统输入法行为，不能依赖它们在鸿蒙强制生效。

## 通知、后台与设备服务接入

- 通知权限和代理提醒使用资格是不同要求。声明 ohos.permission.PUBLISH_AGENT_REMINDER 并取得通知权限后，应用仍需满足华为代理提醒开放条件与额度。1700002 可表示额度用尽或受管控可用额度为零；接口保留 IO_ERROR 和原始码，不用前台计时器假装系统调度成功。
- 远程推送没有默认伪 token。在应用启动配置 HarmonyNotifications.tokenProvider，SDK 回调转发 receive/tokenChanged；本地提醒点击由 HarmonyAbility.receiveWant 路径转发。未配置 provider 时 capabilities.has('notifications','register') 返回 false。
- 在 ServiceSetup.ets 注册 HarmonyBackground 原生处理器，并同时从 EntryAbility 与 WorkAbility 启动调用。WorkScheduler 使用至少两小时的时间条件和 repeatCount:1，delaySeconds 是最早执行要求，系统可能继续延后。schedule 成功只表示接收请求，不能保证精确时间或执行。
- BLE 需 ohos.permission.ACCESS_BLUETOOTH，NFC 需 ohos.permission.NFC_TAG 与可用硬件；写入检查 NDEF 可写和容量。默认 ATT MTU 下 BLE 写入限制 20 字节。隐藏页面取消射频操作并断开该页连接；恢复不擅自重连。
- linking 保留冷启动 URL，热启动重复 URL 逐条发送；业务负责 URL scheme / skills 配置和 URL 到路由的转换。
- 普通环境事件合并最新状态；BLE 与 linking 有序队列最多 64 条，溢出明确报错。持久通知/后台收件箱最多 100 条/48 KB，读取后确认删除。
- HTTP 文本响应限制 64 KiB，编码后的 ModuleResult 最多 65536 个 UTF-16 单元，超限拒绝当前请求；大文件使用 transfers。下载/上传取消及迟到文件打开会关闭句柄和删除临时产物。

官方约束来源（核对日期 2026-11-14）：

- [代理提醒错误码](https://developer.huawei.com/consumer/cn/doc/harmonyos-references-V13/errorcode-reminderagentmanager-V13/)
- [代理提醒 API 与开放控制](https://developer.huawei.com/consumer/en/doc/doccenter-references/api/js-apis-reminderagentmanager/)
- [WorkScheduler 参数规则](https://developer.huawei.com/consumer/en/doc/doccenter-references/api/js-apis-resourceschedule-workscheduler/)

## 复跑与证据

~~~sh
npm run test:harmony
npm run typecheck:framework
npm run test:framework
npm run test:tooling
npm run test:build
npm run test:package
node scripts/anseronui.mjs build harmony --config examples/harmony-smoke/anseronui.config.json
node scripts/anseronui.mjs run harmony --no-build --config examples/harmony-smoke/anseronui.config.json --device 127.0.0.1:5557
node scripts/test-harmony.mjs 127.0.0.1:5557
~~~

2026-11-14 API 21 模拟器自动验收通过 14 组：点击、异步存储/安全存储、输入、路由参数/保活、服务能力/后台查询取消、页面可见性、重复热链接、focus、触摸仲裁、通知权限与系统拒绝分类、图片/视频首帧/毫秒进度、媒体暂停恢复、原生扩展。报告的 blocked 数组单独保留提醒调度阻塞；不能把通知权限通过写成通知调度通过。产物/布局/截图位于 .verification/harmony/acceptance/。单元测试使用真实 ArkTS 逻辑加 OS adapter 模拟，不能替代硬件验证。

主配置包含 components、appearance、counter、async-form、extensions、timers、virtual-list。七页主配置已构建、安装和启动；额外 3 组设备检查验证扩展交互、5000 项列表跳到第 4000 项（当次挂载 7 行）及头插后深处窗口保留，报告为 .verification/harmony/acceptance/main-results.json。构建并安装主配置后用 npm run test:harmony:demo -- 127.0.0.1:5557 复跑。仓库示例自动链接 examples/native/harmony/DemoExtensions.cpp；独立应用不会混入这个示例插件，须注册自己的工厂。示例资源来自 examples/components/assets，独立应用将自己的资源放在 platforms/harmony/entry/src/main/resources/rawfile/assets。

## 发布与未完成的实机验收

本轮已接上标准服务与主要渲染合同，但不等于所有真机行为已验收。仍需应用方的开发者签名、代理提醒使用资格、推送 SDK/凭据，以及 BLE 外设/NFC 标签。待验收项包括通知真实投递、后台冷进程延迟唤醒、射频 I/O、系统选择器/分享/定位、真实服务器上传下载、多指与不同输入法/屏幕、无障碍及持续性能。模拟器 HAP 使用 SDK 测试证书，仅用于本地调试。

工具链边界：scriptc helper 不能直接发射 OHOS 对象，因此 Harmony 配方使用主机 LLVM 23 编译 IR、API 21 SDK Clang 编译 runtime/链接；不是调用 Android 兼容层。Core poisoned 后退休 worker，不复用损坏的 runtime TLS。构建警告仍存在，签名和商店发布需开发者配置。
