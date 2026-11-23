import type { DevtoolsSnapshot } from '../../src/protocol';
import type { FullSessionState, NodeDto, LogLevel } from './protocol';
const encode = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value);
export function adaptSnapshot(s: DevtoolsSnapshot): FullSessionState {
  const nodes: NodeDto[] = (s.nodes ?? []).map((n, ci) => ({
    id: n.id, pid: n.parentId === 0 ? -1 : n.parentId, ci,
    n: n.component || n.tag, c: n.component || n.tag, r: !n.component, cv: !!n.component,
    e:n.editable, so:n.scrollOffset, f: [n.rect.x, n.rect.y, n.rect.width, n.rect.height],
    p: { ...n.styles, ...n.attributes, ...n.props, ...(n.text === undefined ? {} : { text: n.text }) },
    hs: !!n.state && Object.keys(n.state).length > 0, s: n.state,
  }));
  const levels: Record<string, LogLevel> = { log: 'p', info: 'i', debug: 'd', warn: 'e', error: 'e' };
  return {
    screenshot:s.screenshot, pagerId: s.pagerId, page: s.page ?? '', className: '', platform: s.platform ?? '',
    nodeCount: nodes.length, logCount: s.logs?.length ?? 0, networkCount: s.network?.length ?? 0,
    nativeCount: s.native?.length ?? 0, droppedLogs: s.droppedLogs ?? 0,
    sampleMs: s.sampleMs ?? 1000, lastSeenAt: s.ts, firstSeenAt: s.ts,
    stale: Date.now() - s.ts > 10000, capabilities: s.capabilities ?? [], device: s.device ?? { platform: s.platform },
    nodes, stateNodeIds: nodes.filter(n => n.hs).map(n => n.id),
    logs: (s.logs ?? []).map(l => ({ seq: l.seq, ts: l.ts, lv: levels[l.level] ?? 'p', tag: l.tag ?? l.level, msg: l.args.map(encode).join(' ') })),
    network: (s.network ?? []).map(r => ({ id: r.id, url: r.url, method: r.method, stack: r.transport ?? 'fetch', ts: r.ts, cost: r.durationMs, status: r.status, ok: r.ok, req: r.requestBody, hdr: encode(r.requestHeaders), responseHeaders: encode(r.responseHeaders), rsp: r.responseBody, err: r.error })),
    native: (s.native ?? []).map(r => ({ id: r.id, mod: r.module, method: r.method, via: 'AnseronUI host', ts: r.ts, cost: r.durationMs, ok: r.durationMs === undefined ? undefined : !r.error, args: encode(r.args), rsp: encode(r.result), err: r.error })),
  };
}
