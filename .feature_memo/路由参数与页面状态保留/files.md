# Files

- `packages/ui/src/index.ts`: RouteParams 与 Router 类型。
- `packages/core/src/business-runtime.ts`: 路由请求参数 JSON 编码、大小与类型检查。
- `packages/render-ios/Sources/AnseronUIRenderIOS/AnseronUIRenderView.swift`: 保留 UIKit Route Host/root。
- `packages/render-macos/Sources/AnseronUIRenderMacOS/AnseronUIRenderView.swift`: 保留 AppKit Route Host/root。
- `packages/render-android/src/main/java/org/anseronui/render/AnseronUIRenderView.kt`: 保留 Android Route Host/root。
- `packages/render-web/src/{router,page-stack}.ts`: entry identity 与 BrowserPageStack 生命周期。
- `examples/counter/page.tsx`, `examples/async-form/page.tsx`: 传参并返回验证状态的共享演示。
- `scripts/templates/app/src/pages/{home,details}.tsx`: 新项目导航示例。
- `packages/render-web/test/{router.test.ts,routing.browser.ts}`: Router entries 与 WebKit 状态恢复集成。
- `examples/native/ios/RenderViewTests.swift`, `SharedCoreUITests.swift`, `packages/render-macos/Tests/Integration.swift`: 宿主与 UI 验收。
- `docs/routing.md`, `docs/architecture.md`: 参数、生命周期和限制。
