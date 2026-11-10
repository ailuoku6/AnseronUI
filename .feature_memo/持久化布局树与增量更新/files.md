# 文件

- `packages/core/src/kernel.ts`：LayoutKernel / SurfaceLayout、布局签名、测量失效、生命周期；保留单次 render 探针。
- `packages/core/src/contracts.ts`：ABI 2 与 CoreRequest/CoreResult。
- `packages/core/src/business-runtime.ts`：分发与 surface 释放消息。
- `packages/core/src/runtime.ts`：ReferenceRuntime 每实例 Kernel。
- `packages/layout/src/layout-engine.ts`：Set 所有权登记。
- `packages/core/native/framework.profile.json`、`packages/core/native/split_bridge.c`、`scripts/stage-core.mjs`、`scripts/build-core.mjs`：ABI、dispose 导出、构建缓存。
- `packages/render-web/src/wasm-runtime.ts`：ABI 2 检查和 Framework.dispose。
- `packages/core/test/persistent-layout.test.ts`、`packages/core/test/split-runtime.test.tsx`：复用、失效、移动、销毁回归。
- `packages/layout/test/engine-probe.ts`：256 节点批量释放，覆盖 Node/Native/library/Wasm。
- `packages/core/native/test/lifecycle.c`：4 owner threads，200 个持久化树创建/销毁/带未完成测量关闭实例循环。
- `docs/architecture.md`、`docs/core-bundles.md`：架构与兼容说明。
- `.verification/persistent-layout-oracle.ts`：临时 300 组固定种子旧内核差分探针；未提交生成产物。

未编辑平台 iOS 宿主或其现有测试修改。
