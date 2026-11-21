# 仓库结构与维护

本文面向框架贡献者。它说明源码归属、生成文件边界和验证入口。框架架构见[架构与运行原理](../architecture/overview.md)。

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

## 文档位置

公开文档按应用的四部分组织，入口是 `docs/README.md`：

- `docs/getting-started/`：学习。只有创建应用和编写页面。
- `docs/guides/navigation/`：页面。路由、生命周期、返回键、计时器。
- `docs/guides/ui/`：界面。样式、事件、动画、组件组合、虚拟列表。
- `docs/guides/services/`：能力。系统服务和原生扩展。
- `docs/guides/project/`：工程。应用图标和接入已有工程。
- `docs/reference/`：组件 API、TS/TSX 限制、构建与运行。
- `docs/architecture/`：运行原理和编译边界。
- `docs/platforms/`：单一平台的支持范围。其他平台的宿主 API 在对应 `packages/render-*/README.md`。
- `docs/diagnostics/`：错误堆栈、DevTools 和性能检查。
- `docs/contributing/`：框架开发和仓库维护。根目录 `CONTRIBUTING.md` 只保留流程入口。

各 Renderer README 只记录对应宿主的 API、接入步骤和平台测试。`internal/` 不定义公开 API。`internal/toolchain/scriptc/` 与 `packages/flexily/` 保留上游原文。使用 AnseronUI 时，以 `docs/` 和 `packages/layout/README.md` 为准。

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
