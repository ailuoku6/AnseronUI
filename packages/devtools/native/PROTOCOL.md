# Native DevTools Sink

The native adapters use the same JSON snapshot accepted by the Node service at
`/__anseronui_devtools/ingest`:

```json
{
  "protocol": 1,
  "type": "snapshot",
  "pagerId": "ios-...",
  "page": "home",
  "ts": 1710000000000,
  "platform": "ios",
  "stats": { "hostCommits": 3, "rendererApplyMs": 1.2 },
  "diagnostics": [{ "code": "...", "message": "..." }]
}
```

Each native adapter only serializes and forwards snapshots to a caller-provided sink. It does not
open sockets or add a network dependency by itself. Generated AnseronUI Debug hosts use the
shared Core inspector and their existing HTTP/timer services, so application code never installs a
reporter. These serializers remain useful for custom hosts, test collectors, and in-process
bridges.

Native hosts should send a `heartbeat` packet with the same `protocol` and `pagerId` while a page
is idle. The Node service uses it to keep a live session from expiring; a final `snapshot` with
`destroyed: true` removes the session when the host is released.

## Generated Debug Core transport

The staged Debug Core reports the full committed inspection tree. It uses the existing `http.request`
and `timer.sleep` modules. Each snapshot includes `nodes`, `logs`, `network`, `native`, `capabilities`,
and optional `screenshot` and `commandResults`. It polls while the surface exists. A stopped reporter
expires at the service after 10 seconds.

Snapshots use `snapshotChunk` packets with `pagerId`, `seq`, `index`, `count`, and `data`. Each `data`
string has at most 10000 characters. The service assembles the full JSON snapshot before applying it.
Only the final chunk response can contain commands. Retries must retain the same sequence and content.

The service assigns each command a `requestId` and an `expiresAt` deadline. Core rejects expired
commands. Commands are `full`, `sample`, `state`, `inspectProps`, `set`, `shot`, and `live`.
`inspectProps` returns `schemaVersion: 1`, `schemaToken`, and property definitions.
`set` takes `id`, `target` (`p` for props, `s` for Hook state), `key`, `value`, and optional `schemaToken`.
Supported values are strings, finite numbers, and booleans. A state key uses `state[n]`.
The Core renders and waits for `CommitAck`, then reads the committed value.
Results appear in the next snapshot:

```json
{"requestId":"...","ok":true,"id":42,"value":"updated"}
```

Failures use `ok: false` and `error`. Unknown nodes, stale schemas, invalid types, busy pages,
render failures, and commit timeouts fail the command. Edits are scoped to the surface and node path.
Unmounting clears the override. Destroying the surface cancels pending edits and module requests.

## Host screenshot module

Debug hosts handle `__devtools.capture`. Arguments are JSON with `id`, `sample` (1 or 2), `offset`,
and optional framework `rect` in visual page coordinates, with ancestor scroll offsets subtracted.
An ID of 0 captures the page. Positive IDs capture host nodes.
The first request has `offset: 0` and starts a new PNG capture. Later requests read the same image.
Hosts return a JSON string:

```json
{"chunk":"data:image/png;base64,...","next":24000,"ox":0,"oy":0,"ow":320,"oh":480}
```

Each chunk has at most 24000 characters. `next: 0` marks the last chunk. `ox` and `oy` are page
coordinates; `ow` and `oh` are logical dimensions before sampling. Core limits assembled data to
2000000 characters. The snapshot stores the image as `screenshot.data`, or the error as `screenshot.err`.
A failed explicit `shot` also returns a failed command result. Live capture runs at most once every
2 seconds while enabled and the page is visible.

The capture module is excluded from Swift Release compilation. Android and Harmony Release source
staging removes its marked blocks. Release Core source has no inspection or command transport.
