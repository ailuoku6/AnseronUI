import { cleanup } from './Cleanup';
export interface PageHost {
  setVisible(visible: boolean): void;
  destroy(): void;
}
export class HarmonyRoute {
  readonly id: string;
  readonly page: string;
  readonly params: string;
  host: PageHost | null = null;
  constructor(id: string, page: string, params: string) { this.id = id; this.page = page; this.params = params; }
}

/** Navigation entries survive eviction; only hidden native hosts are released. */
export class HarmonyPageStack {
  entries: HarmonyRoute[] = [];
  onChange: () => void = () => {};
  onEvict: (page: string) => void = () => {};
  private createHost: (route: HarmonyRoute) => PageHost;
  private pages: string[];
  private serial: number = 0;
  private limit: number = Infinity;
  private visible: boolean = true;
  private closed: boolean = false;
  constructor(pages: string[], createHost: (route: HarmonyRoute) => PageHost) { this.pages = pages; this.createHost = createHost; }
  current(): HarmonyRoute | null { return this.entries[this.entries.length - 1] ?? null; }
  setMaxRetainedPages(value: number): void {
    if (value !== Infinity && (!Number.isInteger(value) || value < 1)) throw new Error('INVALID_ARGUMENT: maxRetainedPages');
    this.limit = value; this.enforceLimit(); this.onChange();
  }
  private entry(page: string, params?: Object): HarmonyRoute {
    if (this.closed) throw new Error('CANCELLED');
    if (!this.pages.includes(page)) throw new Error('UNKNOWN_PAGE: ' + page);
    if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) throw new Error('INVALID_ROUTE_PARAMS');
    const data = JSON.stringify(params ?? {});
    // Core's parameter budget is UTF-8 bytes, not UTF-16 code units.
    if (encodeURIComponent(data).replace(/%[0-9A-F]{2}/g, 'x').length > 49152) throw new Error('INVALID_ROUTE_PARAMS');
    const route = new HarmonyRoute(String(++this.serial), page, data);
    route.host = this.createHost(route); route.host.setVisible(this.visible);
    return route;
  }
  load(page: string, params?: Object): void {
    const next = this.entry(page, params), old = this.entries;
    this.entries = [next]; old.forEach(route => this.release(route)); this.onChange();
  }
  navigate(route: HarmonyRoute, method: string, page?: string, params?: Object): Object | null {
    if (method === 'getParams') return JSON.parse(route.params) as Object;
    if (method === 'current') return this.current()?.page ?? null;
    if (this.closed) throw new Error('CANCELLED');
    if (route !== this.current()) throw new Error('PAGE_NOT_ACTIVE');
    if (method === 'push' || method === 'replace') {
      const next = this.entry(page ?? '', params);
      route.host?.setVisible(false);
      if (method === 'replace') { this.entries = this.entries.slice(0, -1); this.release(route); }
      this.entries = this.entries.concat([next]); this.enforceLimit(); this.onChange(); return null;
    }
    if (method === 'pop' || method === 'back') {
      if (this.entries.length < 2) throw new Error('ROOT_PAGE');
      const previous = this.entries[this.entries.length - 2];
      if (!previous.host) previous.host = this.createHost(previous);
      this.entries = this.entries.slice(0, -1); this.release(route);
      previous.host.setVisible(this.visible); this.onChange(); return null;
    }
    throw new Error('UNSUPPORTED: router.' + method);
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.entries.forEach(route => route.host?.setVisible(visible && route === this.current()));
  }
  private release(route: HarmonyRoute): void {
    const host = route.host; route.host = null;
    if (host) { cleanup(() => host.setVisible(false)); cleanup(() => host.destroy()); }
  }
  private enforceLimit(): void {
    let alive = this.entries.filter(route => route.host !== null).length;
    for (const route of this.entries) {
      if (alive <= this.limit) break;
      if (route !== this.current() && route.host) { this.release(route); alive--; this.onEvict(route.page); }
    }
  }
  trimMemory(): void {
    for (const route of this.entries) if (route !== this.current() && route.host) { this.release(route); this.onEvict(route.page); }
    this.onChange();
  }
  destroy(): void { if (this.closed) return; this.closed = true; const entries = this.entries; this.entries = []; entries.forEach(route => this.release(route)); this.onChange(); }
}
