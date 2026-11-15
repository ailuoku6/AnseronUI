---
name: anseronui-app-development
description: Develop or debug applications built with AnseronUI. Use for shared TSX pages, routing, UI, native services, app builds, and cross-platform runtime issues. Use the framework contributor workflow for changes to AnseronUI itself.
---

# AnseronUI App Development

Help the user build or debug an AnseronUI app using this repository's actual APIs and platform support. Treat the app project, generated host, and framework source as separate layers.

## Start with the project type

- In a generated app, run commands from that app's root. Inspect `anseronui.config.json`, `package.json`, page source, and the affected platform host before editing.
- In this repository, distinguish app/example work from framework work. App examples live under `examples/`; changes to `packages/`, `scripts/`, protocols, or renderer behavior are framework contributions. Follow [framework development](../../../docs/contributing/framework-development.md) for those changes.
- For a new app or a full end-to-end workflow, follow the [App development handbook](../../../docs/getting-started/app-development.md). Avoid re-creating its setup steps from memory.

## Preserve the AnseronUI programming model

- Build shared screens with AnseronUI components and APIs from `anseronui/ui`. Do not assume React, React Native, browser DOM, Node.js, or arbitrary npm APIs are available in shared TSX.
- Confirm a page is exported with `definePage` and registered in `anseronui.config.json`. A file that is not in the configured page/source set is not part of the app build.
- Read [TSX constraints](../../../docs/getting-started/typescript-limitations.md) before adding syntax or dependencies that rely on dynamic loading, reflection, Node APIs, or React behavior.
- Use `useServices()` for supported platform services. Check capability and permission results, handle cancellation and errors, and read [native services](../../../docs/guides/native-services.md) for platform differences.
- Use native extensions only when a standard component or service cannot meet the requirement. A native extension needs a host implementation for every platform the app claims to support. Follow [native extension guidance](../../../docs/guides/native-extensions.md).

## Develop and verify

For a generated app, use the scripts declared by that app. The usual checks are:

```sh
npm run check
npm run typecheck
```

Then build and run the affected target. Common app commands are `npm run ios`, `npm run android`, `npm run macos`, `npm run harmony`, and `npm run build:web`. Web changes require a new Wasm build before refreshing the browser. Check [build and run](../../../docs/getting-started/tooling.md) for device selection, release builds, signing, and platform prerequisites.

For repository examples, use the commands in [framework development](../../../docs/contributing/framework-development.md). Do not substitute the JavaScript reference host for a native or Wasm runtime check when the issue concerns AOT behavior or a platform renderer.

Choose verification that exercises the affected layer:

- Page/configuration change: `check`, `typecheck`, and a target app build.
- Shared TSX behavior: run the page on each requested platform, including Web/Wasm when claimed.
- Native service or host change: verify permissions, lifecycle, cancellation, and error behavior on the target platform.
- Rendering, input, layout, or lifecycle issue: test the real target renderer. A successful typecheck or Core build does not prove native UI behavior.

Report which platform and runtime were tested. Do not claim cross-platform support based only on compilation or one platform's result.

## Debug by stage

1. Reproduce with the exact app command and target. Record the first failing stage and the full first diagnostic.
2. Check app configuration and page registration before changing renderer code.
3. Run typecheck and compiler/AOT build separately. This distinguishes TSX/type errors from lowering, compiler, linker, and host failures.
4. For runtime-only faults, inspect the affected platform's host logs and the relevant service, routing, or lifecycle contract. Do not infer platform behavior from the Web reference renderer.
5. Change the smallest layer that owns the failure, then rerun the failing check and a relevant regression test.

For route state and page reclamation, read [routing and lifecycle](../../../docs/guides/routing.md) and [page lifecycle](../../../docs/guides/page-lifecycle.md). For rendering or responsiveness, use the [performance guide](../../../docs/diagnostics/performance.md). Find other topics in the [documentation index](../../../docs/README.md).

When information is missing, state the exact unresolved detail: target platform and OS/API version, command, failure stage, or relevant log. Continue with independent investigation while keeping platform-specific assumptions explicit.
