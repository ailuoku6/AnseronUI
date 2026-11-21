# AnseronUI

AnseronUI 用 TypeScript/TSX 编写共享页面，并将页面编译为 iOS、Android、Web、macOS 和 HarmonyOS 应用。页面共享布局、状态、交互和业务逻辑。各平台宿主提供原生视图和系统能力。

## 开始

安装 Node.js 24+。先准备你要运行的一个平台，再创建应用：

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

## 环境

| 目标 | 环境 |
| --- | --- |
| 通用 | Node.js 24+、npm；安装时保留 optional dependencies |
| iOS | macOS、完整 Xcode、Simulator runtime、Python 3；最低 iOS 15 |
| Android | Android SDK 35、NDK、JDK 17–22；ARM64 设备或模拟器；最低 API 26 |
| macOS | Apple Silicon、macOS 15+ 构建主机、完整 Xcode；最低版本声明为 macOS 14 |
| HarmonyOS | DevEco Studio 6.0.1、API 21 SDK、主机 LLVM 23；当前目标为 arm64 |
| Web | 支持 WebAssembly 和 ES modules 的浏览器；构建需要 Zig 工具链 |

主要验证环境为 Apple Silicon Mac。Android SDK 和 NDK 路径可分别通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 与 `ANDROID_NDK_ROOT` 设置。设备、Release 和签名见[构建与运行](docs/reference/build.md)。

## 许可

AnseronUI 自有代码采用 [MIT](LICENSE)。分发时保留适用的版权和许可声明。第三方组件的许可要求见[第三方声明](THIRD_PARTY_NOTICES.md)。
