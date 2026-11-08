# 技术摘要

完整方案位于 AnseronUI 根目录的 `internal/design/anseronui-framework.md`，2026-11-07 修订 v5；原调研源码基线 scriptc `294bb360`、KuiklyUI `3dfc24e8`。最新布局实施使用项目锁定的 scriptc/helper/runtime 0.4.8。

- 共享组件树与项目内适配 Flexily 布局，原生 Android View/UIKit 与 Web DOM 渲染；同步 bytes ABI，内部真正 Promise/async-await。
- v3 开发 API 改为自有 React 风格函数组件、TSX、props/children、单向数据流和 Hooks；有类型化组件树协调，显式绑定只是内部实现。
- 基础 Hook 合同含 state/reducer/ref/effect/memo/callback/context、自定义 Hook、key identity、快照闭包与 Effect 提交/cleanup；不做 concurrent/Suspense，也不承诺兼容 React package。
- 独立 `ui-compiler` 生成组件专用代码、Hook frame/schema、稳定组件 ID 和 reload signature。scriptc 能解析 TSX AST，但现有 frontend 没有 JSX/UI lowering；TSX 支持不可直接下放到 scriptc 的任意 TSX。
- 不嵌入 JS 引擎/解析器/eval，不启用 dynamic island；保留 scriptc 内存/Promise runtime。Web 仍有浏览器及最小 JS glue。
- 原生 executable 已有 `scr_async.c` Promise/微任务；库模式 SC4004/SC4005 与链接源集尚限制 async。需新增 opt-in/versioned embedding，而非简单删除诊断。
- 新增 context/create/post/step/deadline/dispose；宿主不阻塞等待 async，不跨 ABI 挂起或传 Promise 指针。跨线程完成只入队，owner 线程兑现 Promise。
- Wasm 已有 LLVM switched coroutine 路线；native 现有 fiber/ucontext 不能推断移动端直接可用，优先评估 stackless lowering，均需验证异常/RC/frame 释放。
- RuntimeAdapter 统一 create/dispatch/step/dispose；预留不透明 artifact/source、Runtime 身份/epoch 与能力协商接口，首版仍只接随包产物。
- 热更新具体路线未设计：不决定中间码格式、解释器、manifest/签名、状态迁移、实例切换、回滚或 OTA 渠道策略。
- 显式 context/teardown、代际身份与迟到结果隔离是通用运行时生命周期能力，不意味着已经决定双代并存或在线更新。
- callback 不可重入且返回仅标量；library FFI、native trap 隔离、compiler sidecar 特定契约等原有边界仍需遵守。
- 布局包已实施并验证 macOS native/library 与 Node WASI；其余 SDK、移动端/浏览器 UI 尚未实施。

- 2026-11-07 资料根目录迁至 `/Users/ailuoku6/web_project/TSNative`；本文与主文源码引用默认属于原 scriptc 仓库 `../scriptc/`，框架实现尚未开始。

## 2026-11-07：现成 TS 布局库

- 调研报告：`internal/design/ts-layout-libraries-research.md`。yoga-layout-tui 的静态 LLVM 生成通过，typeflex/flexily 原版未通过；普通 yoga-layout 是 C++/Wasm 绑定。
- 建议先用 LayoutEngine 隔离第三方实现，以终端子集做探针，评估 flexily 源码移植；未决定替代主方案的有限 Flex。
- Node 扩展探针覆盖 percent/gap/relayout、子节点 measure 与销毁调用；无宽高的测量根节点实际输出 0×0，待审计。原生执行因 helper/compiler 版本不匹配未验证，移动端及 Wasm 未测试。同步 measure 仍需桥接框架平台异步测量缓存。

## 2026-11-07：flexily 源码适配原型

- 详见 `internal/design/flexily-scriptc-adaptation.md` 和 `internal/experiments/flexily-scriptc/README.md`；9 类已覆盖适配点、7 个上游文件，新增 index-scriptc 静态入口。
- 改写包括 logger 解耦、异构 style 显式读写、同构 Value[]、clamp 收窄、Node[] 返回注解、赋值目标 !、局部回调调用、freeze 新数组和直接 throw。Style 向量固定长度不再由 TS tuple 类型保证。
- 原版 Node/改写版 Node/改写版 macOS native，两组共 1017 行 stdout、stderr、exit 一致；编译使用 dynamic=false 和官方 0.2.1 helper/runtime pack，compiler/runtime 源码及工作区依赖未改。
- composable 的 FlexilyNode 动态 mixin 形状仍不可编译，未移植文本插件；框架可使用 Node + 自有宿主测量 adapter。尚未选生产布局引擎，mobile/library/Wasm、长期 RC 与完整性能验证仍缺。

- 2026-11-07 补证：scriptc 支持本轮普通单继承、super/override/instanceof 和普通 interface extends；空 interface Alias extends BaseClass 也通过。新增方法的 interface Extended extends BaseClass 作为变量类型失败（SC2001），同对象具体子类类型通过；限制是该接口视图的静态表示，非 extends 语法全禁。

## 当前布局实现（2026-11-07）

- `packages/flexily/`：真实上游 Git clone，固定 0.8.5/4850f1f，MIT；7 文件兼容适配，私有包 `@anseronui/flexily` 默认导出静态 Node 入口，composable/text mixin 排除。
- `packages/layout/`：公共包 `@anseronui/layout`，LayoutEngine 使用明确 CSS preset，负责节点所有权、多层子树释放、离树节点及 measure/baseline/CQ 清理、幂等 dispose。
- `npm run test:layout:wasm`：1017 行上游/适配/native 差分通过；公共入口 16 组 Node/native/C-host-library/Node-WASI 输出一致。上游行为回归 2648 通过+1 跳过；独立性能回归 8 通过。前后两组基准均 55 完成+1 明确排除，不作性能差异承诺。
- 原生/库模式不嵌入 JS；没有修改外部 compiler/runtime。项目根 package-lock 锁定工具，`prepare:tools` 准备 native CLI 和 benchmark 的 Yoga wasm 路径。
- 仍缺移动端 library、浏览器宿主、异步真实文本缓存、长期内存与高 DPI 取整配置。上游内部整数网格取整是当前行为，不能写成仅渲染边界取整。

## 当前框架源码（2026-11-07）

- `@anseronui/ui` 自有 TSX/Hooks；`@anseronui/core` JS 参考协调/布局/Promise 服务；`@anseronui/protocol` 版本化 JSON；`@anseronui/render-web` DOM 参考宿主。Web 使用真实 DOM 文本测量与 `fetch`/timer。
- `ui-compiler` 有 P0 TSX lowering，但未生成完整 Hook frame/schema；`render-ios`/`render-android` 已实现基础控件渲染、事件和平台测量，分别通过模拟器 SDK 类型检查、Android AAR 打包。
- 外部 scriptc 0.4.8 的 library 模式仍全图 `async_free`，编译本框架 entry 报 SC4005；Core 的 macOS 静态可执行编译成功不能替代 async embedding/context/移动端/Wasm 验证。
