# 文件

- `packages/ui/src/index.ts`：公共属性、角色、ref 方法。
- `packages/core/src/business-runtime.ts`：语义透传、信息展平、ref 调用。
- `packages/protocol/src/index.ts`：字段与角色验证。
- `packages/render-web/src/{accessibility,renderer}.ts`：DOM 语义与方法。
- `packages/render-ios/Sources/AnseronUIRenderIOS/Renderer.swift`：协议字段、UIKit 语义与动作。
- `packages/render-android/src/main/java/org/anseronui/render/AndroidRenderer.kt`：节点语义、动作、池清理。
- `packages/render-macos/Sources/AnseronUIRenderMacOS/{Protocol,Renderer,Text}.swift`：AppKit 语义与动作。
- `packages/render-harmony/src/main/{cpp/bridge.cpp,ets/HarmonyHost.ets}`：ArkUI 语义、系统播报/焦点。
- Core/Protocol 单测、Web accessibility.browser.ts、macOS RendererRegression、iOS RenderViewTests、Android RenderViewTest、Harmony host.test：回归。
- `docs/guides/ui/accessibility.md`：API 与平台边界。组件参考、文档索引链接。

- `examples/components/accessibility-showcase.tsx` 与 `page.tsx`：实际共享 TSX 演示。
- `packages/render-web/test/accessibility-wasm.browser.ts`：真实 Wasm 业务包交互回归。
- `packages/render-macos/Tests/Integration.swift`：AOT 演示勾选、长按与 ref 调用验证。
