# 仓库结构与维护

本文面向框架贡献者。它说明源码归属、生成文件边界和验证入口。框架架构见[架构与运行原理](../architecture/architecture.md)。

## 源码位置

| 目录 | 内容 |
| --- | --- |
| `packages/ui`、`packages/ui-compiler` | 公开组件、Hooks、JSX lowering 和 TSX API |
| `packages/core`、`packages/protocol` | Core、跨端消息协议和运行时 |
| `packages/layout`、`packages/flexily` | 布局适配和锁定版本的 Flexily 来源 |
| `packages/render-*` | iOS、Android、macOS、HarmonyOS 和 Web 宿主 |
| `scripts` | 编译、App 创建/接入和验证工具 |
| `examples` | 共享页面和原生宿主示例 |
| `internal/design` | 设计方案和调研依据 |
| `internal/verification` | 特定环境和提交的验证记录 |
| `internal/toolchain/scriptc` | 受版本管理的 scriptc 源码及 AnseronUI 适配 |

用户文档集中在 `docs/`。各 Renderer README 只记录对应宿主的 API、接入步骤和平台测试。上游 vendored 文件保留上游原文。

## 源码与生成文件

根目录 [`.gitignore`](../../.gitignore) 忽略可重建内容：依赖、`.verification/`、`.anseronui/`、`dist/`、各层 `build/`、Gradle/SwiftPM/Xcode 缓存和日志。它也忽略本机签名、环境变量、HarmonyOS SDK 缓存和部分宿主生成文件。

保留可以重建工程所需的源码和输入：

- App 页面、配置、宿主源码和测试；
- `package.json`、锁文件、Gradle wrapper 和生成脚本；
- scriptc 源码、适配补丁、版本信息和来源清单；
- Flexily 适配源码、测试、许可和来源清单；
- 可复用的小型测试资源和 fixture。

不要提交 `.verification` 中的构建产物、临时报告、设备数据或签名材料。需要保存的验证结果放入 `internal/verification/`，并注明环境和测试命令。

## 本地验证

首次准备依赖与编译器：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run prepare:compiler
```

基础检查：

```sh
npm run typecheck:framework
npm run test:framework
npm run test:tooling
npm run test:build
```

按改动范围运行更多检查：

- 布局算法：`npm run test:layout`；Wasm 布局路径：`npm run test:layout:wasm`。
- Core：先构建目标 Core，再运行 `npm run test:core:native` 或 `npm run test:core:wasm`。
- Renderer：构建并测试受影响的平台，参见对应的 `packages/render-*/README.md`。
- 性能：按[性能验证指南](../diagnostics/performance.md)运行基准和 UI 回归。

模拟器、SDK、Zig、HTTP fixture 和上游布局参照是部分检查的前置条件。未运行的设备检查应在结果中明确标出。

## 发布

打包和自动发布步骤见[框架开发指南](framework-development.md#打包与发布)。发布前应确认版本、包内容、第三方声明和自动化检查结果。
