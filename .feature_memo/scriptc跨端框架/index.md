# scriptc跨端框架

- Status: runnable framework foundation implemented across native iOS, Android, and Web Wasm; production parity and cancellation remain incomplete
- Last updated: 2026-11-08
- Current focus: 三端共享 TSX/Core 已打通并可重复构建；iOS Simulator UI、Android Instrumentation、Wasm 与原生 Core 均完成端到端验证。
- Workspace: `AnseronUI`（`/Users/ailuoku6/web_project/TSNative`）

## 文档导航

- [完整技术方案](../../internal/design/anseronui-framework.md)：AnseronUI 根目录的 `internal/design/anseronui-framework.md`。
- [当前实施状态](../../internal/design/framework-implementation-status.md)：已验证范围与未完成门槛。
- `../recording-preferences.md`：项目记录偏好。
- `brief.md`：目标、范围与开放问题。
- `tech.md`：技术基线、模块与限制。
- `protocol.md`：协议提案摘要。
- `files.md`：本次变更和重要源码。
- `decisions.md`：方案建议及理由。
- `changes.md`：调研与验证状态。
- `handoff.md`：继续工作的交接。

## 迁移与源码归属

- 2026-11-07 从 scriptc 迁入 AnseronUI；技术方案和本需求记录以此目录为准。
- 本轮编译器/运行时基于 `internal/toolchain/scriptc` 官方 v0.4.8；相邻 `../scriptc/` 为旧版，不再用于框架构建。KuiklyUI 为架构参考，没有复制其实现。

## 当前结论

- TypeScript Core + 同步 ABI/内部 Promise + host step + Android View/UIKit/DOM，先做 Android/iOS/Web。
- 页面/组件采用 React 风格函数组件、TSX、props/children 和基础 Hooks，由独立 UI compiler 与协调器实现；无 React 依赖，也不承诺 React 生态兼容。
- scriptc 目前解析 TSX AST 但无 UI lowering，需增加自有 JSX 类型、TSX lowering 与类型化 Hook frame。
- Promise 不依赖 JS 引擎；固定 scriptc v0.4.8 async library embedding patch 支持 timer/HTTP service continuation、bounded step 与线程实例。
- RuntimeAdapter 与 context 生命周期、artifact/source、身份/epoch、能力协商接口为后续热更新预留；执行格式和更新机制未选型。
- 热更新具体设计不属于当前首版范围；下载、签名、迁移、切换、回滚及分发渠道策略待后续需求确认。
- iOS、Android 与 Web Wasm 均加载相同业务 AOT Core；示例实现计数、表单、列表、Timer、HTTP 及页面切换。Wasm 通过浏览器 WASI host 运行。

## 下一步

- 下一阶段做持续集成、多设备/密度/输入法覆盖、内存与压力测试、ABI 稳定性以及任意挂起 async frame 的可中断回收；当前 teardown 拒绝未解决 async fibers。热更新仍另立需求。
- 正式命名、仓库组织、目标业务、性能预算和人员周期待后续产品决策，不阻塞本次方案交付。

## 2026-11-07 布局库调研

- 详见 AnseronUI 根目录 `internal/design/ts-layout-libraries-research.md`。yoga-layout-tui 原始源码/公开入口通过静态 LLVM 生成，但已归档、属终端子集，且测量根节点探针有待审计边界；不是生产选型。
- typeflex/flexily 需要源码适配。原生运行被本机 helper 0.2.0 与 compiler 0.2.1 不匹配阻挡；未验证 mobile/library/Wasm，主方案第 6 节基线未改变。

## 2026-11-07 flexily 源码适配

- 用户授权修改 flexily 源码验证兼容性；原型位于 `internal/experiments/flexily-scriptc/`，报告位于 `internal/design/flexily-scriptc-adaptation.md`。
- 已覆盖路径归为 9 类适配点，修改 7 个上游源码文件并增加静态入口；两组 macOS arm64 原生探针共 1017 行输出，与原版/改写版 Node 逐字节一致，全程 dynamic=false。
- 临时匹配的官方 0.2.1 helper/runtime pack 已解决本轮原生工具链阻碍。createFlexily composable 入口仍失败，mobile/library/Wasm、长期内存和完整性能 gate 未通过；不构成生产选型。

- extends 边界补证：普通 class 继承/接口继承/空接口继承类均已原生实测通过；给类视图新增方法的 Extended 接口变量失败，改用具体子类类型通过。不能将 flexily composable 失败写成 extends 全面不支持，详见适配报告补充节。

## 最新实施结论：Flexily 布局引擎

- 已按用户要求 clone 到 `packages/flexily/`，固定 0.8.5/4850f1f；公共入口 `@anseronui/layout`，主方案第 6 节已改为采用 Flexily。
- `packages/layout/validation.json`：scriptc 0.4.8；1017 行历史差分 + 16 组 engine Node/native/library/Wasm 一致；上游 2648 通过+1 跳过，独立性能 8 通过。
- 阅读 `packages/layout/README.md` 与适配报告文末开始下一步；移动端/浏览器宿主、异步文本、长期内存和设备像素取整仍需 P0。历史章节的“尚未选型/尚未实施”仅指当时状态。

## 2026-11-07 框架实施增量

- `packages/protocol`、`ui`、`core`、`ui-compiler`、`render-web` 及 `examples/counter`、`examples/async-form` 已有实现；浏览器 JS Core 的计数、受控输入/列表、计时器与 HTTP 通过交互验证。
- `packages/render-ios` 用 iOS Simulator SDK 类型检查；`packages/render-android` 成功构建 debug AAR。两者是渲染模块，尚非已连接 Core 的应用宿主。
- `npm run typecheck:framework`、`npm run test:framework`（10/10）、两个 Web build、`npm run test:layout` 通过；macOS scriptc 静态可执行计数器输出与 Node 一致。
- `scriptc build --lib --profile packages/core/test/library.profile.json` 仍报 SC4005。不得宣称 Promise/async-await 已在移动端库或浏览器 Wasm 中可用。
