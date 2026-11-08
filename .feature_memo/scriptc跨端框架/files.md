# 文件索引

## 本次新增

- `internal/design/anseronui-framework.md`：完整方案，包含源码来源与实施门槛。
- `.feature_memo/recording-preferences.md`：技能初始化的项目记录偏好，无额外定制要求。
- `.feature_memo/scriptc跨端框架/`：本需求摘要与交接，不含实现代码。

## 重要源码

以下源码、测试和公共文档路径均相对于原 scriptc 仓库 `../scriptc/`（绝对路径 `/Users/ailuoku6/web_project/scriptc`），不属于 AnseronUI 内的本地实现文件。

- `packages/compiler/src/backend/targets.ts`、`target-platform.ts`：目标与平台准入。
- `packages/compiler/src/library/library-profile.ts`：ABI、callback、实例与所有权。
- `packages/compiler/src/library/sidecar.ts`：compiler sidecar 范围。
- `packages/runtime/src/scr_library.c`：panic、poison 与 arena 行为。
- `packages/runtime/src/scr_async.c`、`scr_runtime.h`：Promise/微任务/fiber、Wasm coroutine 与当前阻塞事件循环。
- `packages/compiler/src/backend/llvm/expr-async.ts`：await lowering；`library/prepare.ts`：async-free 准入；`backend/native-toolchain.ts`：library 链接源集。
- `docs/content/docs/wasm.mdx`、`limitations.mdx`：Wasm embedding 与库模式限制。
- `tests/harness/library-multi.test.ts`、`tests/library-mode/callbacks/`：移动端、符号、线程与重入测试定义。
- 外部 KuiklyUI 的已读来源见完整方案第 17 节；本次未修改外部仓库。

## v3 UI 语法依据

- `packages/compiler/src/frontend/ts7/source-parser.ts`、`source-parser.test.ts`、`ast-node.test.ts`：解析/保留 TSX AST，不证明 UI lowering。
- `packages/compiler/src/frontend/resolve.ts`：`.tsx` 路径解析；`docs/content/docs/limitations.mdx`：泛型、tuple、闭包、record 身份限制。
- 仍只更新内部方案与 memo，未创建 `framework/` 或修改 compiler/runtime。

## 2026-11-07 迁移

- 当前资料根目录：`/Users/ailuoku6/web_project/TSNative`，保留 `internal/design/` 与 `.feature_memo/` 结构。
- 迁移范围为本方案、8 份需求记录和默认记录偏好；源目录对应文件在目标校验后移除。
- 保留外部源码归属说明与 v1/v2/v3 决策历史，没有创建框架实现包。

## 2026-11-07 布局库调研

- `internal/design/ts-layout-libraries-research.md`：固定来源提交、许可、静态编译诊断、真实 Node 输出、公开入口探针与验证限制。
- `internal/design/anseronui-framework.md`：第 6 节增加调研链接，不改变布局基线；compiler/runtime 未修改，临时探针不属于框架实现。

## 2026-11-07 flexily 适配原型

- `internal/design/flexily-scriptc-adaptation.md`：障碍分类、已验证范围与限制。
- `internal/experiments/flexily-scriptc/`：MIT 源码副本、UPSTREAM.json、7 文件补丁、静态入口、两组行为探针/预期输出、验证脚本及摘要；不包含生成二进制或安装依赖。
- `internal/design/ts-layout-libraries-research.md` 与主方案：增加后续验证引用，保留前轮历史和待选型状态。

## 2026-11-07 正式布局包实施

- `packages/flexily/`：真实上游 clone + 7 文件适配、静态入口、MIT、来源清单和 `README.scriptc.md`；本目录有自己的 Git 历史。
- `packages/layout/src/`：LayoutEngine、公共 Node/常量/类型导出；无需 Native FFI，未修改 compiler/runtime。
- `packages/layout/test/`：公共包入口探针、library profile、C host、Wasm WASI host。
- `packages/layout/validation.json`：本轮固定版本、代码 hash、native/library/Wasm 差分和上游回归/基准摘要。
- `package.json` / `package-lock.json` / `.gitignore` / `README.md`：新建根工作区与锁定工具依赖，忽略构建产物。
- `scripts/`：prepare-tools、verify-layout、上游 Vitest/benchmark 配置；实时验证产物在 `.verification/`。
- `internal/design/anseronui-framework.md`：v5，第 6 节正式选定 Flexily，记录当前内部取整限制。
- `internal/design/flexily-scriptc-adaptation.md`：保留 0.2.1 历史，追加 0.4.8 正式引入与验证。

## 2026-11-07 框架实施文件

- `packages/protocol/src/`、`packages/ui/src/`、`packages/core/src/`、`packages/ui-compiler/src/`：协议、UI 类型/Hooks、参考 Core、TSX lowering；各自测试位于相应 `test/`。
- `packages/render-web/src/`、`examples/counter/`、`examples/async-form/`：DOM 参考宿主和两组浏览器交互样例。
- `packages/render-ios/`、`packages/render-android/`：UIKit/Android View 渲染模块及打包清单。
- `internal/design/framework-implementation-status.md`、根 `README.md`：已验证范围和三端阻碍；不要把参考 JS Core 称为 Web Wasm。
