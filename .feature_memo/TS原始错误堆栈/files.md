# 文件

- `packages/ui-compiler/src/source-map.ts`、`index.ts`：映射生成与 TSX 转换。
- `scripts/stage-core.mjs`、`lower-timers.mjs`、`packages/devtools/instrumentation/`：映射组合与错误日志展示。
- `internal/toolchain/scriptc/packages/compiler/src/backend/source-locations.ts`、`backend/llvm/{blocks,emitter,emit-function,lib-process}.ts`：源码栈位置与 constructorOpt。
- 编译器 `index.ts`、`native/prepare.ts`、`library/library-cache.ts`：传入映射源码及缓存一致性；`scripts/harmony-library.mjs` 接入 OHOS。
- `packages/core/src/business-runtime.ts`、`packages/protocol/src/index.ts`：异常事件和兼容验证。
- `packages/render-{web,ios,macos,android,harmony}/`：全端详细诊断出口。
- `scripts/error-stacks.test.mjs`：实际 Release native/Wasm 测试；`packages/ui-compiler/test/source-map.test.ts`：映射组合。
- `docs/diagnostics/error-stacks.md`：宿主接入、字段、能力边界。
