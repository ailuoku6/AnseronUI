# AnseronUI 文档

从[App 开发手册](getting-started/app-development.md)开始。它按实际开发顺序介绍工程、页面、路由、系统服务和平台验证。

## 学习路径

1. [创建第一个 App](getting-started/app-development.md)：从框架仓库创建工程，编写页面并运行。
2. [组件、布局与事件](guides/capabilities.md)：选择组件，组织界面并处理输入。
3. [主题与样式](guides/styles.md)：设置颜色、文字、阴影和夜间模式。
4. [页面与导航](guides/routing.md)：注册页面、传递参数和返回。
5. [异步与生命周期](guides/page-lifecycle.md)：管理订阅、计时器、页面保留和回收。
6. [系统服务](guides/native-services.md)：调用网络、存储、文件及设备 API。
7. [平台扩展](guides/native-extensions.md)：添加原生模块、组件或 npm 插件。
8. [构建与发布](getting-started/tooling.md)：运行设备、构建 Release 和配置签名。

## 按任务查阅

### 界面

- [组件与界面 API 参考](guides/capabilities.md)
- [自定义 Hook 与组件组合](guides/component-composition.md)
- [事件与手势](guides/interactions.md)
- [动画](guides/animations.md)
- [应用图标](guides/app-icons.md)
- [可变高度虚拟列表](guides/virtual-list.md)
- [系统返回键](guides/back-press.md)
- [跨端计时器](guides/timers.md)

### 平台

- [HarmonyOS](platforms/harmonyos.md)：API 支持、构建、服务与验证范围。
- Renderer 接入：[iOS](../packages/render-ios/README.md)、[Android](../packages/render-android/README.md)、[macOS](../packages/render-macos/README.md)、[HarmonyOS](../packages/render-harmony/README.md)。
- [布局引擎](../packages/layout/README.md)：Flexily 适配和布局包接口。

### 问题排查

- [TypeScript 与 TSX 限制](getting-started/typescript-limitations.md)：语法、运行时和依赖边界。
- [TS 错误堆栈](diagnostics/error-stacks.md)：接收原始 TS/TSX 堆栈及验证源码位置。
- [DevTools](diagnostics/devtools.md)：调试服务和检查数据。
- [性能验证](diagnostics/performance.md)：基准、采样和回归检查。

## 框架原理与贡献

- [架构与运行原理](architecture/architecture.md)：代码分层、编译执行、协议和宿主职责。
- [Core 与业务包](architecture/core-bundles.md)：编译边界、缓存和产物。
- [框架开发与仓库示例](contributing/framework-development.md)：本地开发、验证和发布流程。
- [仓库结构与维护](contributing/repository-workflow.md)：源码归属、生成文件和测试选择。
- [内部设计、实验与验证记录](../internal/README.md)：维护资料，不定义公开 API。

## 文档职责

- 根目录 [README](../README.md) 负责项目介绍和快速入口。
- 本目录负责 App 开发手册、专题指南、平台说明和框架原理。
- `packages/*/README.md` 负责对应包的 API、宿主接入和专项测试。
- `internal/` 负责设计依据、实验过程和环境相关的验证记录。
- `internal/toolchain/scriptc/` 与 `packages/flexily/` 保留上游文档原文。使用 AnseronUI 时，以本目录和 `packages/layout/README.md` 为准。
