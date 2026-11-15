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
