# AnseronUI DevTools

The panel reuses the React components and original stylesheet of kuikly-devtools 1.0.7.
The session bar, five tabs, three-column inspector, virtualized trees/logs, request tables,
property details, search highlighting and copy actions retain the upstream visual implementation.
See `packages/devtools/ui/UPSTREAM.md` for provenance and adaptations.

## Start

Generated applications need no business-code imports or registration:

```sh
anseronui dev web
```

Open `http://127.0.0.1:8091/__anseronui_devtools` in a desktop-width browser window.
The CLI installs the Vite development plugin automatically. For a custom Vite config:

```ts
import { anseronuiDevtools } from 'anseronui/devtools/vite';
export default defineConfig({ plugins: [anseronuiDevtools()] });
```

In this repository, run `npm run dev:devtools`. It builds the panel and starts the test app
at `http://127.0.0.1:5173/` plus the panel at port 8091. Open `?page=counter` and
`?page=network` in separate tabs to exercise the page selector. The app has buttons for state
updates, four log levels, a real local HTTP POST, XHR and the device module. Its business
source does not import DevTools.

The panel reconnects to the SSE stream with exponential backoff (250 ms to 5 s) after a server
restart or proxy interruption. The service sends a keepalive event every five seconds and drops
closed sockets safely. The default Vite plugin bind is `127.0.0.1`; set `host: '0.0.0.0'` only
when a simulator or physical device must reach the service over the local network.

## Implemented inspection

- **Pages:** live host sessions, selection, independent archives, reconnect/history bootstrap,
  automatic removal on destruction or expiry, full refresh and configurable sampling.
- **Elements:** renderer node kinds, parent/child hierarchy, bounds, attributes, computed styles
  and render props; search retains matching ancestors; expand/collapse and property copying.
- **Components:** JS runtime component names, hierarchy, props and committed state/reducer/memo
  hooks. Component identities remain stable across updates. Debug AOT and Wasm builds preserve
  component names during TSX lowering and report the same Page/component/logical-node hierarchy.
- **Console:** info/debug/error/print levels, tag and keyword filters, match navigation,
  follow mode and clearing the displayed records. Debug builds rewrite `console.log/info/debug/warn/error`
  in business TSX and route them through the shared Core sink, so the same records are available on
  Web, Wasm, iOS, Android, macOS and HarmonyOS. `console.warn` is shown in the error-level category
  with its `warn` tag. Logs emitted before the first inspector sample are held in a bounded startup
  buffer and included in that first snapshot.
- **Network:** fetch and XHR, method/URL/status/duration, request and response headers/bodies,
  text/channel filtering, copying payloads and replayable curl. Bodies are capped at 64 KiB;
  binary fetch responses are labelled. Pending requests update in place.
- **Native calls:** Web host `InvokeModule` / `ModuleResult` interception, module/method,
  arguments, result/error and duration, module and keyword filters. HTTP remains in Network.

Screenshots, picking from a screenshot and remote property editing are not implemented yet.
Their upstream layout is retained with disabled controls and explicit capability messages.
The Web module bridge is verified with `device.getInfo`. Debug Core builds for Web, iOS, Android,
macOS and HarmonyOS automatically include the inspector at the shared BusinessRuntime boundary;
the platform hosts only provide their existing HTTP and timer modules. No business-code import or
reporter registration is needed. The inspector reads committed Page, component, logical-node,
props and Hook-state records, then reports network and native-module calls through the same
transport. Periodic snapshots keep the session alive (one second by default). Surface disposal
cancels pending inspector requests; native sessions disappear after the server expiry timeout. The files under `packages/devtools/native` remain portable serializers for
host integrations that do not use the generated AnseronUI Core.

Browser fetch/XHR hooks still belong to a browser realm. Multiple Web hosts in the same window share
those browser logs/requests since each host mounted; separate tabs have independent realms. Native
platform logs come from the instrumented Core and are attributed to the active surface. Module calls
are attributed to the actual host. This limitation does not affect page-specific element trees.

## Distribution and production boundary

`packages/devtools/ui` is the build-time React source. `npm run build:devtools` produces the
static panel under `packages/devtools/src/panel`; npm prepack builds it before copying the SDK.
The assets ship inside the **development SDK**, served by the local Node service. React is a
repository devDependency; applications do not import it.

The Vite plugin uses `apply: 'serve'`. Production application builds do not inject its virtual
entry, traverse the client inspector, or copy the panel assets. The Node server is a separate
`anseronui/devtools/server` export. Normal platform builds and direct `build-core` commands automatically instrument staged Core;
`anseronui build <platform> --release` (or `ANSERONUI_RELEASE_BUILD=1` for direct Core builds) disables it.
The Debug/Release mode and endpoint participate in cache identity;
Release staging sets it to false and reuses no Debug artifact. The generated platform hosts do not
contain manual reporter code. Native renderer packages have no runtime dependency on the optional
reporters in production. No inspector traversal is linked into a Release Core.

For iOS Simulator, Android Emulator, macOS and the HarmonyOS emulator, the inspector posts to
`http://127.0.0.1:8091/__anseronui_devtools/ingest` by default; the build/run scripts set up the
appropriate reverse port where the platform requires it. For a physical device, set
`ANSERONUI_DEVTOOLS_ENDPOINT=http://<host>:8091/__anseronui_devtools/ingest` before the Debug
build and start the DevTools server with `host: '0.0.0.0'` for LAN access.
Do not manually import `anseronui/devtools/client` from a production business entry.

## Checks

- `npm run build:devtools`: strict panel typecheck and asset build.
- `npm run typecheck:framework`: framework/client typecheck.
- `npm run test:devtools`: snapshot ordering, destruction races, clear persistence, component
  ancestry, curl/header mapping, real HTTP/SSE bootstrap and commands, plus a production build
  with the plugin configured that rejects debug/client/panel/React modules and signatures.
- `node --test scripts/npm-package.test.mjs`: actual npm archive, portable SDK and bundled panel.

The Core log sink is covered by the staged runtime test: a page-level `console.warn` emitted during
initial render and a `console.info` emitted from a tap both arrive in the snapshot. Native and Wasm
Core replays, plus Debug builds for iOS Simulator, iOS device, Android, macOS and HarmonyOS, are
compiled after the same injection is applied.

The 2026-11-14 browser acceptance covered two real Web pages, component state updates,
log keyword/level filtering across samples, clear, HTTP/XHR, headers/bodies/curl, device module
results, 200 ms sampling and panel refresh with archive restoration. The panel had no browser
console errors; the fixture intentionally emits an error-level log to test filtering.
