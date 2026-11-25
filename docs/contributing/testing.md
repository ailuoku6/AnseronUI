# 自动测试

[Tests 工作流](../../.github/workflows/tests.yml) 在分支 push、pull request、非发布 tag push 和手动运行时触发，不设置路径或分支过滤。`v*` 发布 tag 由 [Publish 工作流](../../.github/workflows/publish.yml) 调用同一套测试，通过后才发布。每个发布 tag 只启动一轮测试。共享测试、AOT 和平台测试在独立 checkout 中执行。

## 本地入口

先按[框架开发](framework-development.md#开发环境与依赖)安装依赖。快速检查运行 `npm test`。查看所有套件运行 `npm run test:ci -- --list`。

| 命令 | 执行内容 | 环境 |
| --- | --- | --- |
| `npm test` | 类型、框架/协议/编译器、构建工具、CLI/插件/图标、DevTools、Harmony OS adapter、布局上游、npm 包 | Node 24+、Python 3、C++ 工具链 |
| `npm run test:ci -- layout` | 布局上游差分、Native library、WASI | C/C++、Zig、首次运行需网络 |
| `npm run test:ci -- native` | 当前 Native Core、五类示例协议、错误堆栈、细粒度更新预算 | C/C++ 工具链 |
| `npm run test:ci -- wasm` | 当前 Wasm Core、五类示例协议、DevTools、细粒度更新预算 | Zig |
| `npm run test:ci -- web` | Web 生产构建、全部 11 个 Playwright WebKit 套件，含真实双 Wasm | Linux / macOS、Zig、Playwright WebKit 及系统依赖 |
| `npm run test:ci -- ios` | macOS 专属 CLI 路径、原生图标编译、当前 AOT 构建、UIKit transport 测试、XCUITest | Apple Silicon Mac、Xcode、已安装 iPhone simulator runtime |
| `npm run test:ci -- macos` | 当前 AOT/AppKit 集成、Renderer 回归、DevTools 截图 | Apple Silicon macOS 15+、Xcode、图形会话 |
| `npm run test:ci -- android-build` | 原生图标资源编译、当前 arm64 APK、instrumentation APK | JDK 17、SDK 35、NDK、Zig |
| `npm run test:ci -- android` | 当前 AOT 构建、全部 instrumentation 用例 | 上述工具与已连接 arm64-v8a / x86_64 设备或模拟器；x86_64 需要 LLVM 22+ |
| `npm run test:ci -- harmony` | smoke 和主示例的构建、安装、UI 验收 | Apple Silicon Mac、DevEco API 21 SDK、LLVM、已连接模拟器/已签名设备 |

Web 测试首次运行前执行 `npx playwright install --with-deps webkit`，安装锁定版本的浏览器和 Linux 系统库。测试使用无头 WebKit 和本地 HTTP 资源服务，无需 Xcode 或桌面会话。

套件自动准备编译器。Core 的输出目录共享，因此同一 checkout 内串行运行套件。`native` 和 `wasm` 最后构建专用性能 fixture；后续平台测试会重新构建主配置。

iOS 自动选择可用 iPhone。用 `IOS_SIMULATOR_UDID` 指定设备。Android 用 `ANDROID_SERIAL`；只有一个设备时自动选择。HarmonyOS 用 `HARMONY_DEVICE`。Android 支持 `arm64-v8a` 和 `x86_64`。设备测试自动选择目标 ABI；`ANSERONUI_ANDROID_ABI` 可指定架构。只构建时默认 `arm64-v8a`。x86_64 的异步 AOT 需要 LLVM 22+：Linux 默认使用 `clang-22`，macOS 默认使用 Homebrew LLVM。自定义路径设置 `ANSERONUI_ANDROID_LLVM_CLANG`。CI 自动安装 LLVM 22。

iOS、Android、macOS 自动提供端口 5174 的 HTTP fixture。端口被占用时立即失败。Android 自动设置和释放 `adb reverse`。每条命令有超时；失败返回非零退出码。`.verification/tests/<suite>/` 保存逐步日志与 `results.json`，未执行步骤记录为 `not-run`。

Harmony 虚拟列表专项使用真实 ArkUI 布局坐标检查反向滚动、惯性补偿、可见区域空白、头插和展开/收起。设备 suite 自动启用诊断并执行专项。单独运行：

```sh
ANSERONUI_SCROLL_TRACE=1 node scripts/anseronui.mjs build harmony --config anseronui.config.json
node scripts/anseronui.mjs run harmony --no-build --config anseronui.config.json --device <hdc-target>
npm run test:harmony:virtual-list -- <hdc-target>
```

`.verification/harmony/virtual-list/` 保存布局 JSON、逐帧日志和 `results.json`。缺少逐帧样本、可见行额外位移超过 1 vp、视口空白超过 1 vp，或行高补偿中断惯性时，专项失败。诊断仅在设置此变量的 Debug 原生构建中启用。

## GitHub runner

共享测试、布局、Native Core、Wasm 和 WebKit 使用 `ubuntu-latest`。仅 iOS/UIKit 和 macOS/AppKit 使用 `macos-15`（Apple Silicon），分别依赖 Xcode 模拟器和 AppKit。全部套件在每次 push、PR 和手动运行时触发。Android 使用 `ubuntu-latest`、KVM 和 API 35 Google APIs 模拟器，每次 push、PR 和手动运行都会执行，无需仓库开关或自托管 runner。HarmonyOS 的设备执行需要自托管 runner：

| 平台 | Runner 标签 | 工具与设备 | 仓库 Actions 变量 |
| --- | --- | --- | --- |
| HarmonyOS | `self-hosted`, `macOS`, `ARM64`, `anseronui-harmony` | Node 24、Python、Xcode、Zig、DevEco Studio、API 21 SDK、LLVM、已启动的 API 21 模拟器 | `ANSERONUI_HARMONY_CI=true` |

按[设备 runner 接入](device-runners.md)安装工具、启动模拟器、注册 runner、设置进程环境并验证首轮运行，再开启表中的变量。

HarmonyOS runner 进程需能读取工具环境。默认使用 `/Applications/DevEco-Studio.app/Contents`，自定义安装设置 `DEVECO_STUDIO_HOME`、`DEVECO_SDK_HOME`、`HARMONY_NATIVE_SDK`、`HARMONY_LLVM_CLANG`。设备序列号通过 runner 的 `HARMONY_DEVICE` 环境变量设置。

HarmonyOS 设备任务在启用后于 push 和手动运行时执行，并串行使用设备。未启用或处于 PR 时，该任务可跳过，summary 会记录跳过状态。`Full test gate` 要求全部必跑任务成功；任一任务失败或取消均会失败，包括已启用的 HarmonyOS 测试。允许跳过不代表该平台已完成设备验证。

在分支保护中将 `Full test gate` 设为 required check，才能阻止测试失败的合并。工作流本身不会修改分支保护。

## 功能覆盖与边界

| 功能 | 自动验证层 |
| --- | --- |
| 协议身份/序号、提交分块/事务、树拓扑、属性 patch | `test:framework` 的 protocol/Core；各端 renderer 集成 |
| TSX lowering、JSX ABI、模板、组合组件、Hook、细粒度更新 | UI/compiler/Core 单测；reducer 顺序与 memo/callback 缓存；Native/Wasm fixture 的固定工作量与消息预算 |
| 基础组件、Button、富文本、输入、ref、触摸/滚动 | Core；WebKit；iOS/Android/macOS renderer；Harmony smoke/demo |
| Flex 布局、测量、样式、主题、图片来源 | 布局上游/差分/Native/Wasm；WebKit 与各端 renderer |
| 虚拟列表、深处窗口、头插锚点 | Core、WebKit 参考/Wasm、原生 renderer 与 Harmony demo |
| 动画、帧时钟、取消/销毁 | Core 协议；WebKit；iOS/Android/macOS；Harmony adapter |
| 路由、参数、保活、返回、可见性、内存回收 | Core/Web router；各端宿主与设备测试 |
| Promise/计时器、HTTP、取消与迟到回调 | Core；Native/Wasm；HTTP fixture 与原生页面 |
| 自定义 Module、NativeComponent、事件和 ref | Core；Native/Wasm；WebKit；原生设备示例 |
| 70 个公共服务方法（含 9 类订阅）、错误码、实例隔离与卸载 | 61 个请求的逐项参数/结果/错误契约；9 类订阅回调与取消；Core 生命周期回归；Web/原生宿主集成 |
| 存储/安全存储、权限、通知/后台、文件/传输、定位、蓝牙/NFC | 公共契约；Web/Harmony OS adapter；部分原生服务集成。硬件和系统授权边界见下文 |
| 图片/视频、首帧、进度、暂停/恢复与释放 | WebKit；iOS/Android/macOS 集成；Harmony smoke/demo |
| 无障碍语义/动作、清理、输入法状态 | Core/WebKit；原生 renderer 专项回归 |
| DevTools 日志/树/远程编辑/截图 | Node 单测、AOT Wasm、macOS 原生截图 |
| CLI、插件、图标、打包/创建/构建输入 | tooling/build/package 单测；各端实际构建 |

`test:build` 中的 `scripts/feature-coverage.test.mjs` 解析 TypeScript 声明，核对全部 NativeServices 路径、UI 函数、NodeHandle 方法、HostTag 和浏览器套件注册。新增公共服务方法未补充可执行契约时，测试失败。UI 入口检查确认存在实际调用或 JSX 挂载，不能证明该入口的每个分支都已验证。

这些测试覆盖公共契约及已有平台回归路径。表中的入口不等于每个 OS API 都有真机成功路径断言。BLE 外设、NFC 标签、真实相机/麦克风、推送 token/投递、系统后台调度、辅助技术读屏和系统 IME 仍需专用硬件与系统授权验收。模拟结果、能力返回 unsupported、权限拒绝或仅 APK 构建不能作为这些成功路径的证据。Web 自动浏览器范围为 WebKit，其他浏览器需另加 runner。

Harmony 验收报告中的 `blocked` 会使全量设备套件失败，避免把系统配额/授权阻塞计为通过。不能用 `continue-on-error` 隐藏功能失败。

新增回归优先放在所属包的 `test/` 或原生测试 target 中。新增浏览器入口须加入 `scripts/testing/suites.mjs` 的 `browserSuites`。新增独立测试脚本须加入 suite；先用本地 suite 验证，再确认 Actions 中存在对应日志。

## 失败报告

Actions 上传 `test-*` artifacts。iOS 包含 `.xcresult`；Web 失败时包含截图、浏览器日志和 Playwright trace；Android 包含 KVM 诊断日志与 HTML/XML instrumentation 结果；Harmony 包含布局 JSON、截图和验收结果。Android 在构建前验证 KVM，设备缺失、权限错误、虚拟机创建失败和模拟器加速检查结果写入 `.verification/android-kvm.log`。每个 suite 的步骤状态也写入 Actions summary。下载失败任务的 artifact，从首个 `failed` 步骤开始排查。
