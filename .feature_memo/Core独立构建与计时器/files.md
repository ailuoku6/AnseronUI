# 文件

| 路径 | 用途 | 状态 |
| --- | --- | --- |
| `packages/core/src/kernel.ts` / `contracts.ts` | 数据内核与 ABI 合同 | 已完成并验证 |
| `packages/core/src/business-runtime.ts` | 业务状态、组件、Hooks、协议生命周期 | 已完成并验证 |
| `packages/core/native/*profile.json`、`split_bridge.c` | 独立 library 配置与原生组合适配器 | 三平台 archive 构建通过 |
| `scripts/build-core.mjs`、`stage-core.mjs`、`core-inputs.mjs` | 双产物、指纹、缓存和 staging | native/Wasm/iOS/Android 验证通过 |
| `scripts/lower-timers.mjs`、`packages/ui/src/timers.ts` | timer 词法绑定、公共 API | 完成 AOT 测试 |
| `packages/render-web/src/wasm-runtime.ts` | 双 Wasm adapter | 五页 AOT 协议测试通过 |
| `examples/timers/page.tsx`、`docs/timers.md` | 示例和使用说明 | 已完成 |
| `.verification/split-cache-result.json` | 业务页编辑后 Framework 哈希/mtime 证明 | 已通过 |
