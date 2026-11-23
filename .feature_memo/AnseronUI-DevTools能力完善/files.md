# 文件

| 路径 | 职责 |
| --- | --- |
| `packages/devtools/instrumentation/index.mjs`、`runtime.inc`、`editing.inc` | Debug Core 插桩、查询、正常渲染编辑、提交后确认、截图分块 |
| `packages/devtools/src/server.ts`、`commands.ts`、`query.ts`、`hub.ts`、`protocol.ts` | CLI/面板共用 HTTP API、过滤分页、设备回执、会话状态 |
| `scripts/devtools-cli.mjs`、`scripts/anseronui.mjs` | 独立服务与 inspect 子命令；支持负数组件 ID/值 |
| `packages/devtools/src/client.ts`、`vite.ts`、`screenshot.ts` | Web serve 自动插桩、Core 会话合并、DOM PNG |
| `packages/devtools/ui/src/`、`src/panel/` | schema 编辑、截图预览、点选组件/元素及构建资产 |
| `packages/render-{ios,macos,android,harmony}/` | 各平台截图模块；macOS 像素回归 |
| `packages/devtools/native/android.gradle` | 独立 variant Kotlin 输入，Release 移除调试块 |
| `scripts/harmony-app.mjs`、`macos-app.mjs`、`standalone-app.mjs` | Release 隔离与生成工程集成 |
| `scripts/core-inputs.mjs`、`scripts/sdk-files.mjs` | 缓存指纹与 SDK 打包输入 |
| `packages/devtools/test/` | HTTP/CLI、Debug/Release、编辑回滚、截图分块、真实 Wasm 回归 |
| `docs/diagnostics/devtools.md`、`packages/devtools/native/PROTOCOL.md` | 用户用法和宿主传输合约 |

参考设计源码：`/Users/ailuoku6/kuiklyProject/kuikly-devtools`。UI 来源/许可记录在 `packages/devtools/ui/UPSTREAM.md`。
详细构建日志与浏览器验收截图位于忽略的 `.verification/devtools-*`。

原生回归：`packages/devtools/test/native/` 为独立滚动测试页与配置，`packages/devtools/test/native-capture.mjs` 检查真实三端 PNG、视觉坐标和点选。
