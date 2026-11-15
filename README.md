# AnseronUI

AnseronUI 用 TypeScript/TSX 编写共享页面，并将页面编译为 iOS、Android、Web、macOS 和 HarmonyOS 应用。页面共享布局、状态、交互和业务逻辑。各平台宿主提供原生视图和系统能力。

新用户从[App 开发手册](docs/getting-started/app-development.md)开始。手册说明如何从本仓库创建 App、编写页面、添加导航、调用系统服务并验证目标平台。

## 开始之前

| 目标 | 环境 |
| --- | --- |
| 通用 | Node.js 24+、npm；安装时保留 optional dependencies |
| iOS | macOS、完整 Xcode、Simulator runtime、Python 3；最低 iOS 15 |
| Android | Android SDK 35、NDK、JDK 17–22；ARM64 设备或模拟器；最低 API 26 |
| macOS | Apple Silicon、macOS 15+ 构建主机、完整 Xcode；最低版本声明为 macOS 14 |
| HarmonyOS | DevEco Studio 6.0.1、API 21 SDK、主机 LLVM 23；当前目标为 arm64 |
| Web | 支持 WebAssembly 和 ES modules 的浏览器；构建需要 Zig 工具链 |

主要验证环境为 Apple Silicon Mac。Android SDK 和 NDK 路径可分别通过 `ANDROID_HOME` / `ANDROID_SDK_ROOT` 与 `ANDROID_NDK_ROOT` 设置。

## 文档

[文档目录](docs/README.md)按开发顺序列出教程，再链接到组件、平台和架构参考。已有原生应用的宿主接入见[工程创建与接入](docs/getting-started/tooling.md)。

## 开发 AnseronUI

本仓库包含框架源码、平台 Renderer、CLI 和示例。修改框架或运行仓库示例时，从[框架开发指南](docs/contributing/framework-development.md)开始。框架结构和执行流程见[架构文档](docs/architecture/architecture.md)。设计记录和实验位于 `internal/`，它们不是用户 API 文档。

## 许可

AnseronUI 自有代码采用 [MIT](LICENSE)。分发时保留适用的版权和许可声明。第三方组件的许可要求见[第三方声明](THIRD_PARTY_NOTICES.md)。
