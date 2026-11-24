# 实施入口

- `packages/core/src/business-runtime.ts`：Hook owner、持久 region/node、Context 索引、watermark、ACK 日志、watchdog 与恢复。
- `packages/core/src/transaction-kernel.ts`、`layout-style.ts`、`contracts.ts`、`wire.ts`：ABI 3、事务节点图、布局、幂等与分片。
- `packages/ui-compiler/src/index.ts`、`templates.ts`；`packages/ui/src/template.ts`：Program/TypeChecker 模板 lowering、动态槽、普通 JSX 回退。
- `packages/protocol/src/index.ts`、`topology.ts`：协议 2.0、字段/输入校验、Commit 缓冲、拓扑 overlay。
- 五个 `packages/render-*`：字段 handler、持久拓扑预检、批次/重放/reset、输入与资源状态保持。
- `packages/flexily/src/node-zero.ts`：布局变化 observer；继续修改须读取该包局部 AGENTS。
- `packages/devtools/instrumentation/`：定向调度下的属性编辑与撤销、快照、资源清理。
- `scripts/stage-core.mjs`、`core-inputs.mjs`、`build-core.mjs`：项目符号上下文、版本/源码指纹、双库构建。
- `packages/core/test/fine-grained.test.tsx`、`incremental-oracle.test.ts`、compiler/protocol 回归：身份、输入、故障、布局及结构开销。
- `internal/fixtures/fine-grained/`、`scripts/test-fine-grained-aot.mjs`：实际 Native/Wasm AOT 性能硬断言。
- iOS/Android 原生测试、Web browser suites、macOS 集成：真实控件与宿主回归。
- `internal/design/fine-grained-reactivity.md`：规范合同；`internal/verification/fine-grained-reactivity-2026-11-23.md`：验证记录。
