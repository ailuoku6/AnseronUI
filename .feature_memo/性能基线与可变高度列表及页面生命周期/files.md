# Files

- `packages/ui/src/index.ts`, `virtual-layout.ts`: 列表和生命周期公共 API。
- `packages/core/src/business-runtime.ts`, `kernel.ts`, `contracts.ts`: 可见性、资源、缓存、分阶段统计。
- `packages/protocol/src/index.ts`: 消息定义与校验。
- `packages/render-web/src/{reference-host,page-stack,renderer,animation}.ts`: 浏览器宿主、保活、资源暂停。
- `packages/render-{ios,macos,android}/`: 原生宿主、容器、动画和媒体暂停。
- `packages/ui-compiler/src/index.ts`: 保留 JSX 泛型实参以支持 AOT。
- `examples/virtual-list/page.tsx`: 5000 条可变高度示例。
- `scripts/bench-render.ts`, `performance-budgets.json`, `test-web-extensions.mjs`: 基准和真实 WebKit。
- `packages/{core,ui,ui-compiler,render-web}/test`: 对应回归。

## 最终新增入口（2026-11-13）

- `docs/{virtual-list,page-lifecycle,performance,performance-baseline}.md`：公共用法、回收语义、统计方法与本机快照；SDK allowlist 同步。
- `.github/workflows/render-performance.yml`：PR 共享框架与 Reference 预算、报告 artifact。
- `examples/native/android/.../RenderViewTest.kt`、`examples/native/ios/RenderViewTests.swift`：模拟器生命周期/回收回归，Android 含真实列表。
- `packages/render-macos/Tests/Integration.swift`：真实 AppKit AOT 集成。
- `packages/render-web/test/{virtual-list,routing}.browser.ts`：真实 WebKit 列表与路由。
- `scripts/templates/app/platforms/android/.../MainActivity.kt`：生成 Activity 转发可见性及内存压力。

## 快速滑动问题修复

- `packages/core/src/business-runtime.ts`：连续滚动合并和迟到版本处理。
- `packages/core/test/virtual-list.test.tsx`：60事件提交数量、离散点击边界、迟到滚动位置回归。
- `packages/render-android/src/main/java/org/anseronui/render/AndroidRenderer.kt`：滚动视口显式绘制裁剪。
- `examples/native/android/app/src/androidTest/java/org/anseronui/demo/RenderViewTest.kt`：快速滑动完整覆盖、位置稳定和像素裁剪。
- `examples/virtual-list/page.tsx`：明暗文字/背景配色；`docs/virtual-list.md`：滚动更新语义。

## 2026-11-13 猛烈甩动优化

本轮继续修改 packages/ui/src/index.ts、core/src/business-runtime.ts、protocol/src/index.ts；AndroidHost/AndroidRenderer/NodeAnimation；四端 Renderer 的 scrollAnchorOffset；core/test/virtual-list.test.tsx、protocol/test/protocol.test.ts、Android RenderViewTest；docs/virtual-list.md。

- 最终补充：本轮最终补充：AndroidRenderer 增加原生惯性边界保护和Text/Button有界复用，RenderViewTest新增事件身份/样式重置回归。docs/performance-baseline.md追加最终六次甩动与Reference预算结果。
