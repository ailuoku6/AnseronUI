# Changes

## 2026-11-08

- Added: generic manifest-driven iOS/Android host and generated Web route/back handling.
- Added: `useRouter()` route operations and host-maintained route stacks across iOS, Android, and Web.
- Added: `BackPress` / `BackPressResult` protocol, `onBackPress` Core dispatch, native synchronous bridges, and Web handling.
- Added: docs at `docs/tooling.md` and `docs/back-press.md`; CLI regression assertions for generated pages, back handling, and native scripts.
- Verification: framework typecheck passed; 36 framework tests passed; tooling and build-input tests passed; Web, iOS simulator, and Android builds passed; Android APK installed on emulator and system keyevent 4 was delivered to the app task.
- Known issues: current emulator check only confirmed app/task lifecycle; a route-specific UI tap was not repeated after the ADB server became unavailable. iOS physical back still requires an explicit host/navigation-controller call.
- Next: productize bundle id/app shell generation if needed; consider route params and deep links.
