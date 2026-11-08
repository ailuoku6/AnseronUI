# Handoff

Resume from `index.md`.

Current state:
- AnseronUI can generate a TSX-only multi-page app with a generic native host.
- `useRouter()` provides push/replace/pop/back/current.
- `onBackPress` is synchronous and cross-platform; Android generic host is wired to the system back key, Web to Escape/BrowserBack, and iOS exposes `handleBackPress()` for explicit navigation-controller integration.
- Latest verification: 36 framework tests, tooling/build-input tests, and Web/iOS/Android builds passed.

Most relevant files:
- `scripts/anseronui.mjs`
- `packages/ui/src/index.ts`
- `packages/protocol/src/index.ts`
- `packages/core/src/runtime.ts`
- `packages/render-android/src/main/java/org/anseronui/render/AndroidHost.kt`
- `packages/render-ios/Sources/AnseronUIRenderIOS/IOSHost.swift`
- `docs/tooling.md`
- `docs/back-press.md`

Need next:
- Only if required: customize product shell/bundle ids, add route params/deep links, or add an iOS navigation-controller sample.
