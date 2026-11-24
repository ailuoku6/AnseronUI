# AnseronUI

AnseronUI 用 TypeScript/TSX 编写共享页面，并将页面编译为 iOS、Android、Web、macOS 和 HarmonyOS 应用。页面共享布局、状态、交互和业务逻辑。各平台宿主提供原生视图和系统能力。

## 环境

开发 App 只需准备目标平台的环境。当前主要验证主机为 **Apple Silicon Mac**；iOS 和 macOS App 必须在 Mac 上构建。下表列出的是应用开发要求，框架源码开发另见[参与开发](CONTRIBUTING.md)。

### 通用

- **Node.js 24+、npm**。用 `node --version` 和 `npm --version` 检查。
- 安装 npm 依赖时保留 **optional dependencies**，编译器的主机工具和 runtime 包通过它们分发。
- 首次安装与 `npm run setup` 需要访问 npm registry。`setup` 使用 npm 包内的固定版本编译器源码准备工具链。

### 各平台

| 目标 | 开发主机与必需工具 | 运行设备与最低版本 |
| --- | --- | --- |
| **iOS** | Mac、与主机 macOS 兼容的**完整 Xcode**、Xcode 中安装的 iOS Simulator runtime、**Python 3**、**Zig** | 当前模拟器和真机产物均为 **arm64**；模拟器使用 Apple Silicon Mac；最低 **iOS 15** |
| **Android** | **JDK 17–22**（推荐 17，支持 Android Studio 自带的 **JBR 21**）、**Android SDK Platform 35**、SDK Build-Tools、Platform-Tools（`adb`）、**NDK (Side by side)**、**Zig** | **arm64-v8a** 真机或 ARM64 模拟器，最低 **Android 8.0 / API 26**；当前不支持 x86/x86_64 模拟器 |
| **macOS** | **Apple Silicon Mac**、**macOS 15+ 构建主机**、**完整 Xcode**（提供 macOS SDK、Clang 和 Swift） | 当前产物为 **arm64**；部署目标声明为 **macOS 14**，验证边界见 [AppKit Renderer](packages/render-macos/README.md) |
| **HarmonyOS** | **DevEco Studio 6.0.1 / HarmonyOS 6.0.1 API 21 SDK**、SDK 内的 Native Clang/LLVM、另装的**主机 LLVM 23**、Python、`patch` | 当前产物为 **arm64**；设备或模拟器需 **HarmonyOS 6.0.1 / API 21+**；真机需配置 DevEco 开发者签名 |
| **Web** | **Zig**；Vite 和 Wasm runtime 随 npm 依赖安装 | 支持 **WebAssembly 和 ES modules** 的现代浏览器 |

Zig 需自行安装并加入 `PATH`，用 `zig version` 检查。AnseronUI 的 iOS、Android 和 Web AOT 构建使用它；Xcode 和 NDK 仍需分别安装。Gradle 使用工程内的 Wrapper，无需全局安装；`pnpm` 由 npm 依赖提供，无需全局安装。

### iOS 配置

仅安装 Xcode Command Line Tools 不够。安装完整 Xcode 后，打开一次完成 SDK、许可和附加组件安装，再在 Xcode 设置中安装 iOS Simulator runtime。命令行应选择完整 Xcode：

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcodebuild -version
xcrun simctl list devices available
python3 --version
zig version
```

Xcode 安装在其他目录时，调整 `xcode-select` 的路径。`npm run ios` 面向模拟器；模拟器构建不要求开发团队。真机安装和分发需在 Xcode 配置签名，见[构建与运行](docs/reference/build.md)。

### Android 配置

推荐通过 Android Studio 的 SDK Manager 安装 SDK Platform 35、Build-Tools、Platform-Tools 和 NDK (Side by side)。使用模拟器时，还需安装 Android Emulator 并创建 **ARM64 AVD**；真机需开启 USB 调试并授权电脑。

在 shell 中配置 SDK 路径。以下是 macOS 的默认安装位置：

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
adb devices
zig version
```

- SDK 路径可用 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指定。Linux 默认目录为 `~/Android/Sdk`；自定义安装使用实际路径。
- 构建脚本默认选择 SDK `ndk/` 目录中版本最高的 NDK；需要固定版本时设置 `ANDROID_NDK_ROOT`。
- `JAVA_HOME` 应指向 JDK 安装目录。App 构建脚本接受 **17–22**，Java/Kotlin 编译目标保持 **17**。已有 JDK 21 无需再安装 17；JDK 25 不适用于当前 Gradle 8.9。
- 在 macOS 上，构建脚本依次尝试兼容的 `JAVA_HOME`、已安装的 JDK 17 和 Android Studio 自带的 JBR。其他主机需显式配置 `JAVA_HOME`。

HarmonyOS 的 SDK 路径、`HARMONY_LLVM_CLANG`、设备连接和签名配置见 [HarmonyOS 指南](docs/platforms/harmonyos.md)。各平台的设备选择、Release 构建和签名命令见[构建与运行](docs/reference/build.md)。

## 开始

准备好上述通用环境和一个目标平台后，创建应用：

```sh
npx anseronui create hello-app --application-id com.example.hello
cd hello-app
npm install
npm run setup
npm run ios
```

`npm run android`、`npm run macos`、`npm run harmony` 运行其他原生平台。Web 使用 `npm run build:web` 和 `npm run dev:web`。

完整的第一次运行见[快速开始](docs/getting-started/quick-start.md)。接着改页面：[编写页面](docs/getting-started/pages.md)。

## 文档

应用文档按页面、界面、能力、工程四部分组织，见[文档目录](docs/README.md)。修改框架见[参与开发](CONTRIBUTING.md)。

## 许可

AnseronUI 自有代码采用 [MIT](LICENSE)。分发时保留适用的版权和许可声明。第三方组件的许可要求见[第三方声明](THIRD_PARTY_NOTICES.md)。
