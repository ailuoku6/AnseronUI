# 文档

一个 AnseronUI 应用分成四部分：**页面**、**界面**、**能力**、**工程**。文档按这四部分排列。

先读「学习」里的两篇。之后改哪一部分，就打开对应指南。查 API、构建命令、原理和排错时，用后面的参考。

## 学习

按顺序读。

1. [快速开始](getting-started/quick-start.md)：创建应用，并在一个平台上运行。
2. [编写页面](getting-started/pages.md)：改首页，登记页面，打开第二个页面。

## 指南

### 页面

页面如何切换、保留和响应系统返回。

- [路由](guides/navigation/routing.md)
- [页面保活与生命周期](guides/navigation/page-lifecycle.md)
- [系统返回键](guides/navigation/back-press.md)
- [计时器](guides/navigation/timers.md)

### 界面

页面看起来什么样，以及怎么响应触摸。

- [样式](guides/ui/styles.md)
- [事件与手势](guides/ui/interactions.md)
- [无障碍](guides/ui/accessibility.md)：读屏描述、角色、动作、播报和聚焦。
- [动画](guides/ui/animations.md)
- [自定义 Hook 与组件组合](guides/ui/component-composition.md)
- [可变高度虚拟列表](guides/ui/virtual-list.md)

### 能力

页面如何调用设备和原生代码。

- [系统服务](guides/services/native-services.md)
- [原生扩展与 npm 插件](guides/services/native-extensions.md)

### 工程

应用本身的资源，以及嵌进已有宿主。

- [应用图标](guides/project/app-icons.md)
- [接入已有工程](guides/project/existing-app.md)

## 参考

按标题查找，不按顺序读。

- [组件与界面 API](reference/components.md)
- [TypeScript 与 TSX 限制](reference/typescript.md)
- [构建与运行](reference/build.md)：设备、Release 和签名。

## 原理

- [架构与运行原理](architecture/overview.md)
- [Core 与业务包](architecture/core-bundles.md)

## 平台

- [HarmonyOS](platforms/harmonyos.md)：支持范围、构建和验证。
- 宿主接入：[iOS](../packages/render-ios/README.md)、[Android](../packages/render-android/README.md)、[macOS](../packages/render-macos/README.md)、[HarmonyOS](../packages/render-harmony/README.md)。
- [布局引擎](../packages/layout/README.md)。

Web 的构建命令在[构建与运行](reference/build.md)。

## 排查

- [TS 错误堆栈](diagnostics/error-stacks.md)
- [DevTools](diagnostics/devtools.md)
- [性能验证](diagnostics/performance.md)

## 参与开发

修改框架、Renderer、CLI 或仓库示例时，从 [CONTRIBUTING.md](../CONTRIBUTING.md) 进入。设计记录在 [`internal/`](../internal/README.md)，不定义公开 API。
