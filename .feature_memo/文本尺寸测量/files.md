# Files

## Recently Modified

- `packages/ui/src/text-measurement.ts`：公共类型、校验与默认值。
- `packages/ui/src/index.ts`：导出类型、Hook 与服务入口。
- `packages/core/src/business-runtime.ts`：Promise 发起、响应路由与 owner 清理复用。
- `packages/core/test/text-measurement.test.tsx`：参数、并发、生命周期与 render 禁止调用。
- `packages/render-android/.../AndroidRenderer.kt`：0 行归一化为不限行。
- `examples/native/android/app/src/androidTest/.../RenderViewTest.kt`：不限行高度回归。
- `examples/components/text-measurement-showcase.tsx`、`page.tsx`：组件页演示。
- `packages/render-web/test/text-measurement.browser.ts`：JS 与 Wasm 真实浏览器排版。
- `packages/render-macos/Tests/Integration.swift`：`--text-measurement` 专项。
- `scripts/test-web-extensions.mjs`、`scripts/testing/suites.mjs`、`scripts/feature-coverage.test.mjs`：注册测试入口与 CI。
- `docs/guides/ui/text-measurement.md`、`docs/README.md`、`docs/reference/components.md`：公开用法与索引。

## Important Context

- 工作区原有 scripts/anseronui.test.mjs、npm-package.test.mjs、sdk-files.mjs、standalone-app.mjs 和 app skills/template 改动属于已有工作，未改写。
