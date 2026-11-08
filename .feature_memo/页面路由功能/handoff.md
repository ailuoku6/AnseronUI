# Handoff

Resume from `index.md`.

Current state:
- 页面路由已落在 `packages/ui` 的 `Router`/`useRouter()` 和三端宿主容器中。路由方法通过保留 `router` module 传递：push、replace、pop/back、current。

Most relevant files:
- `packages/ui/src/index.ts`、`packages/core/src/runtime.ts`、三端 Host/RenderView，以及 `examples/counter/page.tsx` 和 `examples/async-form/page.tsx`。

Need next:
- 已完成 Swift/Kotlin/Web 构建、35 项框架测试、Native Core 检查和 Android 模拟器 push/back 实测。

Watch out:
- Web 路由在当前 host flush 结束后通过 microtask 切页，避免重入。
