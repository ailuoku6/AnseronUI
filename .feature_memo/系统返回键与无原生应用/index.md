# 系统返回键与无原生应用

- Status: completed
- Last updated: 2026-11-08
- Current focus: 已完成通用原生宿主、TSX 页面路由和同步系统返回键协议，并完成回归。
- Workspace: `TSNative`

## Document Map

- `../recording-preferences.md`: project-wide required recording points
- `brief.md`: user goal, scope, acceptance criteria, open questions
- `tech.md`: technical plan, architecture, dependencies, constraints
- `protocol.md`: API, event, and configuration contracts
- `files.md`: important files and recent modifications
- `decisions.md`: decisions and rationale
- `changes.md`: chronological implementation and verification log
- `handoff.md`: compact resume note for a new AI thread

## Latest Summary

- 新应用通过 `anseronui create` 生成 TSX 页面和配置；iOS/Android 使用框架提供的通用宿主读取 Core manifest，新增页面和路由无需编辑 `App.swift` 或 `MainActivity.kt`。
- `useRouter()` 支持 `push`、`replace`、`pop`、`back`、`current`，路由栈由平台容器维护。
- `onBackPress?: () => boolean` 已贯通 UI、Core、协议、iOS、Android、Web；最内层回调优先，`true` 消费，`false` 交给宿主路由/系统默认流程。
- `npm run typecheck:framework`、`npm run test:framework`（36 tests）、`npm run test:tooling`、`npm run test:build` 和 Web/iOS/Android 构建均通过。

## Next Actions

- 如需产品化，继续让 CLI 生成自定义 bundle id、应用壳和可选原生模块注册；当前 generic host 的 iOS 物理返回仍需导航控制器主动调用 `handleBackPress()`。

## Open Questions

- iOS 没有 Android 同等统一物理返回键；接入 UINavigationController 时由宿主决定如何把 `handleBackPress()` 与导航返回手势/按钮串联。
