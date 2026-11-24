---
name: anseronui-debugging
description: Run, inspect and debug an AnseronUI app page with the anseronui DevTools server and inspect CLI.
---

# AnseronUI Page Debugging

Use this skill when diagnosing a running page or checking runtime state. For generated apps, work from the app root and use its `anseronui.config.json` and `package.json` as the source of truth. For framework work in this repository, inspect the relevant example or fixture config and use the local DevTools documentation.

## Start a Debug Session

Complete setup once after creating the app or updating its SDK:

```sh
npm install
npm run setup
```

Run these in separate terminals from the generated app root. Keep the DevTools server running:

```sh
npx anseronui devtools
npm run ios       # or android, macos, harmony
```

Use `npm run dev:web` for Web; it starts the Web app and DevTools together. `npm run ios`, `npm run android`, `npm run macos` and `npm run harmony` build Debug by default. Release builds do not report DevTools snapshots. Android's run command configures USB/AVD forwarding. For an iOS device on the LAN, start `npx anseronui devtools --host 0.0.0.0`, build with `ANSERONUI_DEVTOOLS_ENDPOINT=http://<computer-lan-ip>:8091/__anseronui_devtools/ingest`, then install the new app. Use LAN binding only when device routing requires it.

Open `http://127.0.0.1:8091/__anseronui_devtools` to use the panel. USB Android forwarding is `adb reverse tcp:8091 tcp:8091`; Harmony device forwarding is `hdc rport tcp:8091 tcp:8091`. On iOS simulator and macOS, loopback is shared with the host. A changed ingest endpoint is compiled into Core, so rebuild and reinstall after changing it.

For repository development, run `npm run anseronui -- devtools` from the framework root, then start a fixture using the command documented in `docs/diagnostics/devtools.md`. Use `npm run anseronui -- inspect ...` for queries. Do not assume an example is registered in the generated app's page list.

## Inspect the Page

The CLI returns JSON. Start with sessions and use that session's exact `pagerId` in every page query:

```sh
npx anseronui inspect sessions
npx anseronui inspect logs --pager <pagerId> --limit 50
npx anseronui inspect network --pager <pagerId> --limit 50
npx anseronui inspect native --pager <pagerId> --limit 50
npx anseronui inspect nodes --pager <pagerId> --query <component-or-testID>
npx anseronui inspect node-detail --pager <pagerId> --id <nodeId>
npx anseronui inspect props --pager <pagerId> --id <nodeId>
npx anseronui inspect state --pager <pagerId> --id <componentId>
npx anseronui inspect shot --pager <pagerId> --id 0
```

If `inspect sessions` is empty, confirm the app is a Debug build, the DevTools server is still running on the expected port, and the device can reach the compiled ingest endpoint through loopback/USB/LAN forwarding. Release builds do not send snapshots. Use `--server http://host:port` when the server is not on the CLI's default `127.0.0.1:8091`.

From the framework checkout, prefix the same command with `npm run anseronui --`, for example `npm run anseronui -- inspect sessions`. Use detail commands for full request/call/log/node records. Lists are filtered before pagination; default limit is 50, maximum is 200. Use `--query`, `--status`, `--level`, `--tag`, `--limit` or `--offset` to narrow output. Node and component IDs are numeric; `pagerId` is a string. If a page is offline or an ID is stale, list sessions/nodes again instead of reusing old identifiers. `--value` must be JSON: numbers and booleans are unquoted; JSON string values need double quotes inside the shell argument.

For runtime-only experiments, `inspect edit` can change an editable node prop or simple component state. Values are JSON. This changes only the running Core and is not a source-code edit; reload/rebuild to remove the experiment.

```sh
npx anseronui inspect edit --pager <pagerId> --id <nodeId> --target p --key width --value '180'
npx anseronui inspect edit --pager <pagerId> --id <componentId> --target s --key 'state[0]' --value '8'
```

Props, styles and state are not all editable. Event handlers, children, refs, complex objects and read-only fields are rejected. Inspector edits only affect the running Core and are cleared when the node/page is removed; they never modify source. Prefer reproducing a confirmed issue in source and add a regression test; an inspector edit only tests a live hypothesis.

## Diagnose and Verify

- For an AOT build failure, run `npm run typecheck` in the generated app, then the target build. Read the first compiler diagnostic and source map location. A successful typecheck does not validate the scriptc subset.
- For a UI mismatch, inspect the current node's props, computed styles, frame and parent path; use a screenshot to compare visible output.
- For missing data or actions, inspect logs first, then network or native calls. Query the relevant detail by its returned ID.
- Change one cause at a time, rebuild/reload the target, and re-check the same session/page path. Report which runtime and device were actually tested.

Read [DevTools reference](../../../docs/diagnostics/devtools.md) for LAN setup, target-specific behavior, screenshot limits, edit schemas and framework fixture commands.

For the repository's browser fixture, run `npm run dev:devtools` and open `http://127.0.0.1:5173/` (`?page=counter` or `?page=network` selects a fixture). For the Wasm Core command regression, run `npm run build:core:wasm` then `npm run test:devtools:wasm`. Native screenshot regression uses `packages/devtools/test/native/anseronui.config.json`; build/install and run `npm run test:devtools:native -- ios|android|harmony` as documented. Android/Harmony need the forwarding commands above. Screenshots can disagree with visible pixels for cross-origin Web media, system-composited/video layers, transforms and virtualized lists; verify those on the actual target.
