import type { RouteParams } from '@anseronui/ui';
import type { NativeModuleHandler } from './extensions.js';

type Entry = { id: number; page: string; params: string };
/** App-owned stack, surviving BrowserHost replacement. Navigation runs after the module result settles. */
export class BrowserRouter {
  private entries: Entry[] = [];
  private revision = 0;
  private sequence = 0;
  get entryId(): number | undefined { return this.entries[this.entries.length - 1]?.id; }
  get routeEntries(): readonly { id: number; page: string }[] { return this.entries.map(({ id, page }) => ({ id, page })); }
  constructor(private navigate: (page: string) => void) {}
  get routeStack(): string[] { return this.entries.map(entry => entry.page); }
  get params(): RouteParams { return JSON.parse(this.entries[this.entries.length - 1]?.params ?? '{}') as RouteParams; }
  private entry(page: string, params: RouteParams): Entry {
    if (!/^[a-z][a-z0-9_-]*$/.test(page)) throw new Error('INVALID_ROUTE');
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('INVALID_ROUTE_PARAMS');
    const encoded = JSON.stringify(params);
    if (new TextEncoder().encode(encoded).length > 48000) throw new Error('ROUTE_PARAMS_TOO_LARGE');
    const copy = JSON.parse(encoded);
    if (!copy || typeof copy !== 'object' || Array.isArray(copy)) throw new Error('INVALID_ROUTE_PARAMS');
    return { id: ++this.sequence, page, params: encoded };
  }
  private changed(): void {
    const revision = ++this.revision; const page = this.entries[this.entries.length - 1]!.page;
    setTimeout(() => { if (revision === this.revision) this.navigate(page); }, 0);
  }
  load(page: string, params: RouteParams = {}): void { const entry = this.entry(page, params); this.entries = [entry]; this.changed(); }
  push(page: string, params: RouteParams = {}): void { this.entries.push(this.entry(page, params)); this.changed(); }
  replace(page: string, params: RouteParams = {}): void {
    if (!this.entries.length) throw new Error('ROUTER_EMPTY');
    this.entries[this.entries.length - 1] = this.entry(page, params); this.changed();
  }
  pop(): boolean { if (this.entries.length <= 1) return false; this.entries.pop(); this.changed(); return true; }
  /** Bind each host to its own entry, including while it is covered by another page. */
  handlerFor(id: number): NativeModuleHandler { return (method, raw, signal) => {
    const entry = this.entries.find(value => value.id === id);
    if (!entry) throw new Error('SURFACE_DISPOSED');
    if (method === 'getParams') return JSON.parse(entry.params);
    if (method === 'current') return entry.page;
    if (this.entryId !== id) throw new Error('INACTIVE_ROUTE');
    return this.handler(method, raw, signal);
  }; }
  readonly handler: NativeModuleHandler = (method, raw) => {
    const args = (raw ?? {}) as { page?: string; params?: RouteParams };
    if (method === 'push') { this.push(args.page ?? '', args.params); return null; }
    if (method === 'replace') { this.replace(args.page ?? '', args.params); return null; }
    if (method === 'pop' || method === 'back') { if (!this.pop()) throw new Error('ROUTER_EMPTY'); return null; }
    if (method === 'current') return this.entries[this.entries.length - 1]?.page ?? null;
    if (method === 'getParams') return this.params;
    throw new Error('UNSUPPORTED_METHOD: ' + method);
  };
}
