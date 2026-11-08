# Files

## Recently Modified

| Path | Why it matters | Status |
| --- | --- | --- |
| `scripts/anseronui.mjs` | create/integrate/build CLI；生成 Web 返回键入口和原生构建脚本 | completed |
| `scripts/stage-core.mjs` | 生成包含页面 name 的 Core manifest | completed |
| `scripts/build-core.mjs` | 将 manifest 复制到 iOS/Android/Web 构建产物 | completed |
| `scripts/generate-ios-project.py` | 将 iOS manifest 纳入 app resources | completed |
| `packages/ui/src/index.ts` | Router API 和 `onBackPress` 类型 | completed |
| `packages/protocol/src/index.ts` | BackPress 输入/输出协议校验 | completed |
| `packages/core/src/runtime.ts` | 返回键回调分发和错误诊断 | completed |
| `packages/render-android/.../AndroidHost.kt` | 同步等待 BackPressResult、router module | completed |
| `packages/render-ios/.../IOSHost.swift` | 同步等待 BackPressResult、router module | completed |
| `packages/render-web/src/reference-host.ts` | Web 返回键请求 | completed |
| `examples/native/android/.../MainActivity.kt` | manifest 页面按钮和系统返回顺序 | completed |
| `examples/native/ios/App.swift` | manifest 页面选择器 | completed |
| `scripts/anseronui.test.mjs` | 防止生成器回归页面名、返回键和构建脚本 | completed |
| `docs/tooling.md` / `docs/back-press.md` | 使用说明和平台边界 | completed |

## Important Context

| Path | Why it matters |
| --- | --- |
| `docs/routing.md` | 路由栈、Promise 顺序和当前限制 |
| `anseronui.config.json` | 默认 demo 的页面注册清单 |
| `.verification/backpress-*.log` | 之前的返回键三端构建记录 |
