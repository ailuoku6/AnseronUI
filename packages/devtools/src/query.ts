import type { DevtoolsHub } from './hub.js';

const groups = ['logs', 'network', 'native', 'nodes'] as const;
const text = (value: unknown) => JSON.stringify(value)?.toLowerCase() ?? '';
export function inspectQuery(hub: DevtoolsHub, subject: string, params: URLSearchParams, id?: string): { status: number; body: unknown } {
  const ok = (body: unknown) => ({ status: 200, body });
  const error = (status: number, error: string) => ({ status, body: {error} });
  if (subject === 'sessions') return ok({sessions: hub.summaries()});
  if (!groups.includes(subject as typeof groups[number])) return error(404, 'UNKNOWN_SUBJECT');
  const pager = params.get('pagerId');
  if (!pager) return error(400, 'PAGER_REQUIRED');
  const session = hub.sessions.get(pager);
  if (!session || session.stale) return error(404, 'PAGE_OFFLINE');
  const items = subject === 'nodes' ? [...session.nodes.values()] : session[subject as 'logs' | 'network' | 'native'];
  if (id !== undefined) {
    const item = items.find(item => String('seq' in item ? item.seq : item.id) === id);
    return item ? ok({pagerId: pager, item}) : error(404, 'UNKNOWN_ID');
  }
  const integer = (key: string, fallback: number) => params.has(key) ? Number(params.get(key)) : fallback;
  const limit = integer('limit', 50), offset = integer('offset', 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) return error(400, 'INVALID_PAGINATION');
  const query = (params.get('q') ?? params.get('query') ?? '').toLowerCase();
  const filtered = items.filter(item => (!query || text(item).includes(query)) &&
    (!params.has('status') || ('status' in item && String(item.status) === params.get('status'))) &&
    (!params.has('level') || ('level' in item && item.level === params.get('level'))) &&
    (!params.has('tag') || ('tag' in item && item.tag === params.get('tag'))));
  // Search responses carry summaries; potentially large bodies/props are fetched by ID.
  const summaries = filtered.slice(offset, offset + limit).map(item => {
    if (subject === 'network') { const {requestBody, responseBody, requestHeaders, responseHeaders, ...summary} = item as typeof session.network[number]; return summary; }
    if (subject === 'native') { const {args, result, ...summary} = item as typeof session.native[number]; return summary; }
    if (subject === 'nodes') { const {props, state, attributes, styles, ...summary} = item as typeof session.nodes extends Map<number, infer N> ? N : never; return summary; }
    const log = item as typeof session.logs[number]; return {id: log.seq, seq: log.seq, level: log.level, tag: log.tag, ts: log.ts, message: log.args.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(' ').slice(0, 500)};
  });
  return ok({pagerId: pager, total: filtered.length, limit, offset, hasMore: offset + limit < filtered.length, items: summaries});
}
