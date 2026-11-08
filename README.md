# AnseronUI

使用 TypeScript/TSX 编写共享页面，通过 AOT Core 在 iOS、Android 和 Web 上渲染的跨端 UI 框架。

AnseronUI 把跨端执行拆为可复用的 Framework Core 和包含页面/业务 SDK 的 Business Bundle；宿主负责 UIKit、Android View 或 DOM、真实文本测量、网络、计时器和系统能力。原生产物构建基于 **scriptc** AOT 编译，布局计算基于经适配的 **Flexily**；移动端不依赖嵌入 JavaScript 引擎。框架参考 Kuikly 的跨端思路，当前是一套可运行、可继续扩展的框架基础，并非 Kuikly 的全量兼容实现。

[中文文档总览](docs/README.md) · [能力清单](docs/capabilities.md) · [架构与运行原理](docs/architecture.md) · [应用创建与接入](docs/tooling.md) · [TS/TSX 限制](docs/typescript-limitations.md)

## 支持哪些能力

| 类别 | 当前支持 |
| --- | --- |
| 基础组件 | `View`、`Text`、`RichText`、`Button`、`TextInput`、`ScrollView`、`Image`、`Video` |
| 布局与样式 | Flex、尺寸约束、换行、间距、对齐、绝对定位、背景、边框、圆角、透明度、裁剪和文本样式 |
| 状态与生命周期 | 函数组件、常用 Hooks、Context、提交确认后的 effect、卸载清理 |
| 交互 | 点击、长按、输入、滚动、布局、媒体事件；触摸捕获/冒泡和 `touchAction` 手势交接 |
| 动画 | 声明式目标值过渡、ref 动画、延迟、循环、往返和取消 |
| 页面 | `push`、`replace`、`pop`、`back`、当前路由和系统返回键监听 |
| 原生扩展 | 异步 Module 调用、带属性/事件/方法的原生组件、节点与组件 ref |
| 运行平台 | iOS UIKit、Android View、Web DOM + Wasm Core；另有 JavaScript 参考宿主 |
| 开发工具 | 新建应用、现有应用接入、配置检查、三端构建和分层验证 |

复杂业务组件可以由基础组件组合，例如拖动悬浮球、布局容器和业务卡片，无需全部加入核心组件集。详细属性、事件和限制见[能力清单](docs/capabilities.md)。

## 技术基础

| 基础项目 | 在 AnseronUI 中负责什么 |
| --- | --- |
| scriptc 0.4.8 + 本仓库 async embedding 补丁 | 将共享 TypeScript 编译为原生 Core 静态库或 Wasm；原生最终链接和打包仍由 Xcode / Android NDK / Gradle 完成 |
| Flexily 0.8.5 的本地适配 | 共享 Flex 布局计算；通过 `@anseronui/layout` 管理节点，并与宿主真实文本测量对接 |
| AnseronUI | TSX/组件与 Hooks、协调和事件、跨端协议、平台 Renderer、Module、动画、路由及工具链 |

编译后端和布局算法分别建立在上述上游项目之上。来源版本、适配范围和职责见[架构文档](docs/architecture.md#技术基础与职责)。scriptc 支持 TS/JS 的子集，且本项目的 library/Wasm 模式有额外约束；编写页面或引入依赖前请阅读 [TS/TSX 编写限制](docs/typescript-limitations.md)。

## 页面与 Core 的关系

当前采用 **Framework Core / Business Bundle 独立编译**：布局、测量规划和渲染差分进入稳定 Core；页面、Hooks、事件闭包和业务执行 SDK 进入业务包。配置中的多个页面共享一个业务包，并非每页各编译一份 Core。

修改页面 TSX 时，构建器复用输入未变化的 Framework Core，只重编业务包，再链接/打包；页面跳转不需要编译。原生两库隔离各自运行时，Web 分别加载 `framework.wasm` 和 `core.wasm`。这是构建复用，不是运行时热更新。详见[页面、独立 Core 与业务包](docs/core-bundles.md)。

共享页面现已支持 `setTimeout`、`clearTimeout` 和 `useTimers()`；全局计时器由 AOT staging 适配至平台宿主，页面销毁会取消未触发回调。详见[计时器](docs/timers.md)。

## 环境与安装

当前构建脚本以 macOS Apple Silicon 开发环境为主要验证环境：iOS 模拟器和设备构建固定 arm64，Android 产物固定 `arm64-v8a`。不要把这些命令视为已经覆盖 Intel 模拟器或所有开发主机。

- 通用：Node.js 24+、npm、Git、Python 3、C/C++ 工具链；`prepare:compiler` 安装编译器依赖时还需要 pnpm。
- 编译器：锁定 scriptc 0.4.8 及仓库内的异步 embedding 补丁。首次准备需下载依赖。
- iOS：完整 Xcode 和已选择的 Developer 目录；部署目标为 iOS 15+。
- Android：JDK 17、Android SDK（compileSdk 35）、NDK；应用最低 Android API 26。
- Web/Wasm：同一套 scriptc/WASI 编译链。Wasm 相关编译需要可用的 Zig 工具链。

在框架仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run prepare:compiler
```

`prepare:compiler` 会准备固定提交的 scriptc checkout、应用 `internal/toolchain/async-embedding.patch`，复用匹配的 LLVM helper 并编译编译器入口。框架及其包目前按源码工作区使用，尚未提供独立发布的 npm 创建命令。

## 运行仓库示例

以下命令都在框架根目录运行。

### Web

```sh
npm run build:web
npm run dev:wasm
```

打开终端显示的地址；配置端口为 5175，端口占用时以 Vite 实际输出为准。默认生产产物位于 `examples/dist/wasm-web/`。修改共享 TSX/Core 后需要重新执行 `build:web`，仅刷新 Vite 不会更新 AOT 业务包；未变化的 Framework Core 会复用。

`npm run dev:counter`、`npm run dev:async-form` 启动的是 JavaScript 参考宿主，适合调试参考运行时，不能替代真实 Wasm 验证。

### iOS 模拟器

```sh
npm run build:ios
open "$(xcode-select -p)/Applications/Simulator.app"
xcrun simctl list devices available
```

在 Simulator 中启动一个 arm64 iPhone/iPad 模拟器后执行：

```sh
xcrun simctl bootstatus booted -b
xcrun simctl install booted .verification/ios-app/Build/Products/Debug-iphonesimulator/AnseronUIDemo.app
xcrun simctl launch --terminate-running-process booted org.anseronui.demo
```

有多个模拟器时，把 `booted` 换成目标设备的 UDID。使用完整路径打开 Simulator 可以避免 `open -a Simulator` 无法查到应用；`xcode-select -p` 必须指向完整 Xcode。可在启动命令末尾加 `--components` 直接打开组件页。

`npm run build:ios-device` 生成 `.verification/ios-device-app/` 下的未签名设备产物。Xcode 工程每次构建会核对 Core 源码指纹；提示 Core 过期时应重新执行对应的 `build:ios` 或 `build:ios-device`，单独编译 Swift 不会更新 Core。

### Android

```sh
npm run build:android
adb install -r examples/native/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n org.anseronui.demo/.MainActivity
```

请先启动 arm64 Android 模拟器或连接设备；多个设备时使用 `adb -s <设备序列号>`。SDK 路径可通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 设置，NDK 可通过 `ANDROID_NDK_ROOT` 设置。

异步表单的 HTTP 演示依赖本地 fixture：另开终端运行 `npm run dev:async-form -- --port 5174 --strictPort`，Android 再运行 `adb reverse tcp:5174 tcp:5174`。没有 fixture 时，HTTP 演示或依赖它的设备测试会失败。

### 示例内容

「组件」页使用全部八个基础组件，包含计数、禁用按钮、输入、富文本、触摸传播、离线图片和视频；页面内还可以切换「布局样式」和「动画」。悬浮球由共享 TSX 和触摸事件实现。「扩展」页演示 Module、自定义原生开关和 ref。

示例媒体在 `examples/components/assets/`，通过 `asset://showcase.png` 和 `asset://showcase.mp4` 使用。业务自己的资源需要按宿主打包规则加入，详见[能力清单](docs/capabilities.md)。

## 创建新应用

先在框架根目录完成安装和工具链准备，再执行：

```sh
npm run anseronui -- create apps/my-app --name my-app
npm run anseronui -- check --config apps/my-app/anseronui.config.json
npm run anseronui -- build web --config apps/my-app/anseronui.config.json
npm run anseronui -- build ios --config apps/my-app/anseronui.config.json
npm run anseronui -- build android --config apps/my-app/anseronui.config.json
```

`create` 目前要求目标目录在框架工作区内。它生成两个可跳转的 TSX 页面、配置、Web 入口、构建脚本和 README。也可以进入生成目录运行 `npm run check`、`npm run build:web`、`npm run build:ios` 或 `npm run build:android`。

新增页面、跳转和返回可全部写在 TSX 中，通用原生宿主从 manifest 读取页面清单，不需要逐页修改 Swift/Kotlin。当前多个应用仍共用原生示例壳、包名和构建输出，构建应串行执行；品牌、图标、签名和自定义系统能力需要进一步配置宿主。

## 接入现有应用

在框架根目录执行，路径指向已有项目：

```sh
npm run anseronui -- integrate ../existing-app --name existing-app
npm run anseronui -- check --config ../existing-app/anseronui.config.json
```

命令新增配置、最小页面和 `ANSERONUI_INTEGRATION.md`，不自动修改已有应用入口或替你链接原生库。iOS/Android 将 `AnseronUIRenderView` 嵌入已有页面，加载时调用 `load`，结束时调用 `destroy()`；Web 使用 `BrowserHost` 和 `WasmRuntime`。链接 Core、注册扩展与宿主生命周期接入见[应用创建与接入](docs/tooling.md)、[iOS](packages/render-ios/README.md)和[Android](packages/render-android/README.md)。

## 编写共享页面

```tsx
import { Button, Text, View, definePage, useRouter, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

function Home(): UIElement {
  const [count, setCount] = useState(0);
  const router = useRouter();
  return <View style={{ flexDirection: "column", padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 24, color: "#275de5" }}>计数：{count}</Text>
    <Button title="加一" onClick={() => setCount(value => value + 1)} />
    <Button title="详情" onClick={() => { void router.push("details"); }} />
  </View>;
}

export const homePage = definePage("home", Home);
```

在配置的 `pages` 中登记 `home` 和 `details` 的源码与导出符号，再重新构建目标平台。路由返回会重新创建页面实例，当前不保留旧页面 state。触摸事件的 `stopPropagation()` 只控制框架内传播；如果拖动区域不应交给外层滚动，请配置 `touchAction="none"`。

动画、平台 API 和节点操作分别使用 `animation`、`useServices().invoke()` 和 `ref`，完整示例见以下专题文档。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [中文文档总览](docs/README.md) | 所有公开指南与历史设计入口 |
| [能力清单](docs/capabilities.md) | 组件、属性、事件、Hooks、平台能力与限制 |
| [独立 Core 与业务包](docs/core-bundles.md) | 编译边界、缓存、两份产物与宿主接入 |
| [计时器](docs/timers.md) | setTimeout、clearTimeout、useTimers 与页面清理 |
| [TS/TSX 编写限制](docs/typescript-limitations.md) | 语法、Hooks、依赖、静态 library 和宿主 API 边界 |
| [架构与原理](docs/architecture.md) | 编译、布局、协议、线程、生命周期和 `.gitignore` |
| [创建与接入](docs/tooling.md) | CLI、配置、构建与现有宿主集成 |
| [页面路由](docs/routing.md) / [系统返回键](docs/back-press.md) | 导航栈、跳转返回与返回键消费 |
| [原生扩展](docs/native-extensions.md) | Module、原生组件、事件与 ref |
| [动画](docs/animations.md) | 声明式过渡与命令式动画 |
| [布局引擎](packages/layout/README.md) | Flexily 适配与布局验证 |
| [iOS Renderer](packages/render-ios/README.md) / [Android Renderer](packages/render-android/README.md) | 容器、链接、生命周期与平台约束 |

## 开发与验证

文档和常规框架修改可以先执行：

```sh
npm run typecheck:framework
npm run test:framework
npm run test:tooling
npm run test:build
```

修改布局、Core 或平台渲染时，还需要按影响范围执行：

```sh
npm run test:layout
npm run test:layout:wasm
npm run build:core:native
npm run test:core:native
npm run build:core:wasm
npm run test:core:wasm
```

`test:layout` 当前依赖本地 Flexily 上游 Git 对象，源码发行包未必包含这份测试前置条件，见[布局验证说明](packages/layout/README.md)。原生/Wasm 测试要求先构建对应 Core；iOS UI 测试和 Android `connectedDebugAndroidTest` 还依赖可用设备、SDK 和 HTTP fixture。历史验证记录不代表每次修改都已重新跑过全量设备测试。

## 当前边界与发布准备

当前不包含热更新、React 兼容层、路由参数、深链、页面缓存、通用插件市场、完整无障碍支持和应用签名发布自动化。Module 是异步调用，自定义原生组件需分别注册平台实现；任意已经挂起的业务 async fiber 不能强制终止。完整边界见[架构文档](docs/architecture.md)。

`internal/design/` 是中文设计与历史验证记录；第三方 Flexily 和 scriptc 的原文档、声明与许可证保留原文，不能把上游支持列表直接当作 AnseronUI 的支持范围。

根目录目前没有项目级 `LICENSE`。正式发布前需由项目所有者选择并添加许可证，本次没有代为选择。Flexily 子目录保留上游 MIT LICENSE。仓库忽略规则和第三方源码管理要求见[架构文档中的仓库规范](docs/architecture.md#gitignore-规则)。
