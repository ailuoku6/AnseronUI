# Changes

## 2026-11-08

- Fixed: Android RichText no longer drops all spans when `spans` arrives as a serialized JSON string.
- Fixed: disabled Android Button gets a dimmed disabled text color and 0.5 alpha while enabled Button remains normal.
- Added: `richTextParsesCoreSpanPayloadAndDisabledButtonHasDistinctStyle` Android instrumentation test.
- Verification: `npm run build:android` passed; targeted Android instrumentation test passed on `Medium_Phone_API_35(AVD) - 15`.
- Known issue: full 12-test Android suite had one pre-existing HTTP fixture failure in `SharedCoreTest.testSharedPages` (`Status: loaded from HTTP` missing); the new test passed.

- Fixed follow-up: Core now emits per-span `clickable` metadata; Android adds `ClickableSpan` only where needed and overrides link draw-state so configured colors and decorations are preserved.
- Verification: simulator screenshot shows black/blue/black/red/green RichText segments as configured; targeted Android instrumentation passed again after the follow-up fix.
