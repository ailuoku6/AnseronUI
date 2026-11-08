# AnseronUI

使用 TypeScript/TSX 编写一套页面，构建运行于 **iOS、Android 和 Web** 的 App。iOS 使用 UIKit，Android 使用原生 View，Web 使用 DOM + Wasm；共享页面负责布局、状态、交互和业务逻辑。

AnseronUI 提供创建工程的 CLI、组件与 Hooks、页面路由、动画和原生能力扩展。底层通过 [scriptc](https://github.com/vercel-labs/scriptc) 编译共享代码，使用 [Flexily](https://github.com/beorn/flexily) 计算布局。移动端不依赖嵌入 JavaScript 引擎。

[创建并运行 App](#创建并运行独立-app) · [编写页面](#编写共享页面) · [能力清单](docs/capabilities.md) · [TS/TSX 限制](docs/typescript-limitations.md) · [完整文档](docs/README.md)

## 开始前准备

| 目标 | 环境要求 |
| --- | --- |
| 通用 | Node.js 24+、npm、可用网络；保留 npm optional dependencies |
| iOS | macOS、完整 Xcode、已安装的 Simulator runtime、Python 3；最低 iOS 15 |
| Android | Android SDK 35、NDK、JDK 17–22（推荐 17，支持 Android Studio JBR 21）；最低 Android API 26 |
| Web / 跨平台编译 | 可用的 Zig 工具链；Web 使用支持 Wasm 和 ES modules 的浏览器 |

当前主要验证环境为 **macOS Apple Silicon**，iOS 模拟器和设备产物固定 arm64，Android 产物固定 `arm64-v8a`。Android 设备或 AVD 也应使用 ARM64 架构。

Android SDK 路径可通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 设置，NDK 路径可通过 `ANDROID_NDK_ROOT` 设置。

## 创建并运行独立 App

**`anseronui` 目前尚未发布到 npm。** 发布后，可以在任意工作目录使用以下命令：

```sh
npx anseronui@0.1.0 create awesomeAnseron --application-id com.example.awesomeanseron
cd awesomeAnseron
npm install
npm run setup

# 选择目标平台，构建、安装并启动
npm run ios
npm run android
```

目标目录需要为空。`--application-id` 同时设置 iOS Bundle ID 和 Android applicationId；`--name` 可指定应用显示名称。生成的 App 固定依赖 AnseronUI 版本，可独立移动和维护；请提交应用的 `package-lock.json`。

`setup` 使用随 npm 包提供的编译器源码准备构建环境，首次会安装依赖，无需 Git。升级 AnseronUI 后需重新执行 `npm run setup`。

### iOS

在应用目录执行 `npm run ios`，CLI 会构建应用、安装到模拟器并启动。默认使用唯一已启动模拟器；没有已启动的模拟器时，会选择并启动一个可用 iPhone。存在多个候选时，指定设备名称或 UUID：

```sh
npm run ios -- --device "iPhone 17 Pro"
npm run ios -- --no-build
```

`--no-build` 仅安装并启动已有产物。iOS CLI 的运行命令面向模拟器；真机产物可通过 `npm run build:ios-device` 构建，签名和安装需在 Xcode 中自行配置。

### Android

连接设备或准备 ARM64 AVD 后，在应用目录执行 `npm run android`。CLI 默认使用唯一在线设备；没有在线设备时，会尝试启动唯一可用 AVD。多个候选时需指定：

```sh
npm run android -- --device emulator-5554
npm run android -- --avd Medium_Phone_API_35
```

设备名称、序列号和 AVD 名称需替换为本机实际值。执行 `npm run android -- --dry-run` 可以预览构建和启动步骤。

### Web

```sh
npm run build:web
npm run dev:web
```

打开终端输出的地址。修改 TSX 后需重新执行 `npm run build:web`，浏览器刷新才会加载更新后的 Wasm 页面；当前不支持页面热更新。

## 认识应用目录

```text
awesomeAnseron/
├── src/pages/                 # 共享 TSX 页面，默认包含 home 和 details
├── anseronui.config.json      # 页面注册、应用标识和构建配置
├── platforms/ios/             # iOS 应用宿主
├── platforms/android/         # Android 应用宿主
├── web/                       # Web 入口、Vite 配置和公共资源
├── assets/                    # 应用资源目录，需按目标平台规则接入
├── package.json               # 应用依赖和开发命令
└── tsconfig.json              # TypeScript / TSX 配置
```

日常开发主要修改 `src/` 和 `anseronui.config.json`；需要扩展原生能力时再修改平台宿主。图片、视频等资源的打包与引用规则见[能力清单](docs/capabilities.md)。

三端容器直接展示 TSX 页面。设置页面根节点的 `backgroundColor`，系统栏背景会跟随页面主题。SDK 和构建缓存位于 `.anseronui/`，应用构建产物位于 `.verification/`、Android `build/` 和 `dist/web/`；这些目录不应提交到业务仓库。

## 编写共享页面

打开 `src/pages/home.tsx`，可以用下面的计数页面替换默认内容：

```tsx
import { Button, Text, View, definePage, useState } from "anseronui/ui";
import type { UIElement } from "anseronui/ui";

export function Home(): UIElement {
  const [count, setCount] = useState(0);

  return <View style={{
    flexGrow: 1,
    flexDirection: "column",
    padding: 24,
    gap: 16,
    backgroundColor: "#f5f7fb",
  }}>
    <Text style={{ fontSize: 24, fontWeight: "bold" }}>我的第一个 App</Text>
    <Text>计数：{count}</Text>
    <Button title="加一" onClick={() => setCount(value => value + 1)} />
  </View>;
}

export const homePage = definePage("home", Home);
```

使用 `View` 组织布局、`Text` 显示文本、`useState` 管理状态；通过 `definePage` 导出页面。组件和 Hooks 从 `anseronui/ui` 引入。完整属性、事件和样式见[能力清单](docs/capabilities.md)。

修改后，在应用目录运行：

```sh
npm run check
npm run typecheck
npm run ios
# 或运行 Android：npm run android
```

`check` 检查页面配置，`typecheck` 检查 TS/TSX；`ios`、`android` 会重新构建并启动应用。未变化的框架编译产物会复用。Web 则重新执行 `build:web` 并刷新浏览器。

### 新增页面与跳转

在 `src/pages/` 新建页面，通过 `definePage` 导出后，在 `anseronui.config.json` 的 `pages` 数组中添加页面记录。默认工程已包含 `home` 和 `details`，其注册方式如下：

```json
[
  { "name": "home", "source": "src/pages/home.tsx", "export": "homePage" },
  { "name": "details", "source": "src/pages/details.tsx", "export": "detailsPage" }
]
```

`name` 是路由名称，`source` 相对于应用根目录，`export` 必须匹配文件导出的页面符号。页面代码需位于配置的 `sourceDirs` 中，默认是 `src`。

在函数组件内使用 `const router = useRouter()` 获取路由，通过 `router.push("details")` 打开详情页，使用 `router.back()` 返回；`useRouter` 同样从 `anseronui/ui` 引入。新增页面后重新构建目标平台。当前返回页面会重新创建实例，不保留之前的页面 state。完整行为见[页面路由](docs/routing.md)和[系统返回键](docs/back-press.md)。

## App 开发能力

| 需求 | 使用方式 | 文档 |
| --- | --- | --- |
| 页面与交互 | `View`、`Text`、`RichText`、`Button`、`TextInput`、`ScrollView`、`Image`、`Video` | [组件、属性与事件](docs/capabilities.md) |
| 布局与样式 | Flex、间距、对齐、尺寸约束、绝对定位、边框、圆角和文本样式 | [布局与样式](docs/capabilities.md) |
| 状态与生命周期 | 函数组件、Hooks、Context 和 effect cleanup | [Hooks 与生命周期](docs/capabilities.md) |
| 网络请求 | `useServices().http.getText()`，通过平台宿主执行请求 | [异步与平台 API 边界](docs/typescript-limitations.md#网络计时器和-async-的特别说明) |
| 延迟与计时器 | `setTimeout`、`clearTimeout`、`useTimers()` | [计时器](docs/timers.md) |
| 动画 | 声明式过渡、ref 动画、延迟、循环和取消 | [动画](docs/animations.md) |
| 平台能力与自定义组件 | `useServices().invoke()`、异步 Module、原生组件和 ref | [原生扩展](docs/native-extensions.md) |

共享页面使用的是 AnseronUI 的组件和运行时。编写页面和选择依赖前，请阅读 [TS/TSX 编写限制](docs/typescript-limitations.md)：DOM 标签、React 专用库、Node.js API 和任意 npm 依赖都需要按实际支持范围评估；类型检查通过后，还需完成目标平台编译和运行验证。

## 常用命令

以下命令都在生成的 App 目录执行：

| 命令 | 用途 |
| --- | --- |
| `npm run setup` | 首次安装或升级 SDK 后准备编译器 |
| `npm run check` | 检查应用与页面配置 |
| `npm run typecheck` | 检查 TypeScript / TSX |
| `npm run ios` / `npm run android` | 构建、安装并启动应用 |
| `npm run build:ios` | 仅构建 iOS 模拟器应用 |
| `npm run build:ios-device` | 构建未签名 iOS 真机应用 |
| `npm run build:android` | 仅构建 Android Debug APK |
| `npm run build:web` | 构建 Web/Wasm 应用，输出到 `dist/web/` |
| `npm run dev:web` | 启动 Web 开发服务器 |

CLI 的设备选择、缓存、路径规则和常见问题见[应用创建、构建与运行](docs/tooling.md)。

## 接入现有 iOS、Android 或 Web 应用

AnseronUI 支持把共享页面嵌入已有宿主。iOS 和 Android 使用 `AnseronUIRenderView`，Web 使用 `BrowserHost` 和 `WasmRuntime`；业务宿主负责挂载位置、原生能力注册及生命周期。

接入需要配置原生依赖和 Core 链接。具体步骤见[应用接入指南](docs/tooling.md)、[iOS 宿主](packages/render-ios/README.md)和[Android 宿主](packages/render-android/README.md)。

## 当前使用边界

当前版本尚不包含热更新、React 兼容层、路由参数、深链、页面缓存、完整无障碍支持和应用签名发布自动化。自定义原生组件需分别实现各目标平台的宿主部分。上线前应在目标设备上验证布局、文本、交互和业务所需的平台能力。

更多指南见[完整文档](docs/README.md)。需要理解编译缓存或宿主生命周期时，可阅读[编译与业务包](docs/core-bundles.md)及[架构与运行原理](docs/architecture.md)。修改框架本身的贡献者请参考[框架开发与仓库示例](docs/framework-development.md)。

## 许可证与开源基础

AnseronUI 自有代码采用 [MIT 协议](LICENSE)，允许商业使用、修改和再分发，分发时需保留版权及许可声明。

[Flexily](https://github.com/beorn/flexily) 保留上游 MIT 协议；[scriptc](https://github.com/vercel-labs/scriptc) 及本仓库对其的 async embedding 适配继续使用 Apache-2.0。分发 SDK 或包含第三方 runtime 的 App 时，还需保留适用的许可证与声明，详见[第三方声明](THIRD_PARTY_NOTICES.md)。

## 安装 npm 原生插件

独立 App（通过 `anseronui create` 创建）支持从 npm 自动接入原生模块、自定义原生组件和 Web 适配。安装到应用的生产依赖，然后重新构建：

```bash
npm install @your-scope/anseronui-device
npm run check
npm run ios
# 或 npm run android / npm run build:web
```

上面的包名是占位示例。构建会扫描已安装的 `dependencies`、`optionalDependencies` 及其传递依赖，读取包的 `anseronui` 声明，生成注册表，将插件源码、平台依赖和权限配置加入工程。无需在 App 入口逐个手写注册；`devDependencies` 和仅声明为 peer 的包不参与扫描。`npm run check` 在安装依赖后会列出发现的插件。新增、升级或卸载插件后必须重新构建，`--no-build` 仅运行已有 App。

插件生成文件位于应用的 `.anseronui/plugins/`，每次 setup/build 都会重新生成，勿手动修改。插件缺少当前平台适配时，构建会提前报错；插件之间重复的模块/组件名在宿主创建注册表时报错，框架保留模块名也不能覆盖。

## 发布带原生能力的 npm 包

可以把 TS API、Swift/Kotlin 原生实现和 Web 适配放在同一个 npm 包中。完整可复制示例位于 [`examples/native-plugin`](examples/native-plugin)，它提供 `useDevice().info()`，通过现有异步 Module 接口读取设备信息。发布自己的插件时，替换示例包名、工厂类型和模块名。

推荐目录：

```text
anseronui-device/
├── package.json
├── src/index.ts          # 共享 TS API，参与 AOT 编译
├── ios/DevicePlugin.swift
├── android/DevicePlugin.kt
└── web/index.ts          # 浏览器适配，与共享 Core 分开编译
```

在 `package.json` 中声明发布文件、框架 peer 依赖和插件清单：

```json
{
  "name": "@your-scope/anseronui-device",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["src", "ios", "android", "web"],
  "peerDependencies": { "anseronui": "^0.0.1" },
  "anseronui": {
    "schemaVersion": 1,
    "typescript": "src/index.ts",
    "ios": {
      "sources": ["ios"],
      "factory": "AnseronDevicePlugin",
      "frameworks": ["UIKit"]
    },
    "android": {
      "sources": ["android"],
      "factory": "org.anseronui.device.DevicePlugin"
    },
    "web": { "entry": "web/index.ts" }
  }
}
```

所有源码路径相对于插件包根目录，必须包含在 npm 发布包内，不能越出包目录。`sources` 是目录列表：iOS 递归纳入 `.swift` 文件，Android 纳入 Kotlin/Java 源码目录。Swift 工厂类型需使用简单标识符，Android 工厂使用完整类名；为类型加上自己的命名前缀，避免不同插件冲突。

三端工厂约定如下，原生模块和组件都通过返回的注册表声明：

| 平台 | 工厂入口 | 返回值 |
| --- | --- | --- |
| iOS | `@MainActor` 类型的 `static func createExtensions()` | `IOSPlatformExtensions` |
| Android | Kotlin `object` 的 `fun createExtensions(context: Context)` | `AndroidPlatformExtensions` |
| Web | `web.entry` 导出的 `createExtensions()` | `PlatformExtensions` |

iOS 插件 Swift 源码与渲染器一起编译进 App target，直接使用 `IOSPlatformExtensions` 等类型，不需要 `import AnseronUIRenderIOS`。Android 使用 `org.anseronui.render` 中的公开类型；工厂接收当前宿主 Context，可由此使用 Activity 能力。Web 的 `createExtensions()` 同步返回 `modules` / `components`，其中模块处理器可以异步执行。每次创建宿主都会调用工厂，请将监听器和资源释放接到现有取消函数或组件 `dispose()` 上。具体 Module、组件、JSON 数据与生命周期约束见[原生扩展](docs/native-extensions.md)。

共享 TS 入口可以这样包装平台模块，供业务组件使用：

```ts
import { useServices } from 'anseronui/ui';

export interface DeviceInfo { platform: string; version: string }

export function useDevice() {
  const services = useServices();
  return {
    info(): Promise<DeviceInfo> {
      return services.invoke<DeviceInfo>('example.device', 'info');
    },
  };
}
```

用户在函数组件内调用 `useDevice()`，再在事件或 effect 中调用 `device.info()`。共享 TS 入口必须是 `.ts` 源码，内部可通过相对路径引用同一源码目录下的 TS/TSX 文件；当前自动映射插件包的主入口，不支持包子路径 exports。仍需遵守 [TS/TSX 编写限制](docs/typescript-limitations.md)，插件声明不会让任意 Node.js、React Native 或浏览器 API 自动获得跨端支持。

需要权限或 Android Maven 依赖时，可在对应平台声明中增加以下字段（仅按插件实际需要声明）：

```json
{
  "ios": {
    "sources": ["ios"],
    "factory": "AnseronCameraPlugin",
    "frameworks": ["AVFoundation"],
    "infoPlist": { "NSCameraUsageDescription": "用于扫描二维码" }
  },
  "android": {
    "sources": ["android"],
    "factory": "com.example.camera.CameraPlugin",
    "dependencies": ["androidx.core:core-ktx:1.15.0"],
    "permissions": ["android.permission.CAMERA"]
  }
}
```

`ios.infoPlist` 当前只接受 `NS…UsageDescription` 字符串。构建使用合并后的生成 plist，保留应用自己的 `platforms/ios/Info.plist`；应用中的同名说明优先，不同插件的默认说明不一致时会报错。Android 权限自动进入 Debug/Release 合并清单；危险权限的运行时请求仍由插件实现。Maven 依赖使用固定 `group:artifact:version` 坐标，从工程现有仓库解析。

当前版本自动接入的范围是 Swift 源码、Kotlin/Java 源码、iOS 系统 framework、Android Maven 依赖、权限和 Web 适配。CocoaPods、Swift Package 依赖、二进制 SDK、原生资源、entitlements、Android 自定义清单组件等仍需宿主额外配置；React Native 插件需要按本协议适配。旧版生成工程需对照新模板接入生成注册表、iOS 工程生成脚本和 Android Gradle 配置；已有原生工程的 `integrate` 模式继续由宿主管理平台构建和注册。

发布前先在插件目录检查真实发布内容，再在测试 App 中安装本地压缩包，验证目标平台：

```bash
# 插件目录
npm pack --dry-run
npm pack

# 测试 App 目录；替换为 npm pack 输出文件的绝对路径
npm install /absolute/path/your-scope-anseronui-device-0.1.0.tgz
npm run check
npm run typecheck
npm run ios
npm run android
npm run build:web

# 验证通过后，回到插件目录发布公开的 scoped 包
npm publish --access public
```

提交锁文件并验证所有声明支持的平台。插件包的 `files` 必须包含 TS 源码和原生实现，不能只发布编译后的 JS 或 `.d.ts`。框架本身尚未发布到 npm 时，测试 App 应先按本文的本地 npm 包流程安装 `anseronui`，再安装插件。
