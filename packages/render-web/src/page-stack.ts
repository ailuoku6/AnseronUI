import { BrowserRouter } from './router.js';
import type { NativeModuleHandler } from './extensions.js';

export interface BrowserStackPage {
  setVisibility?(visible: boolean): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  handleBackPress(): Promise<boolean>;
  destroy(): Promise<void>;
}
export interface PageRetentionOptions {
  /** Total live pages including the visible entry. Default: unlimited. */
  maxRetainedPages?: number;
  onEvict?: (page: string) => void;
}
/** Owns live page hosts per stack entry. Covered DOM is detached and restored without remounting. */
export class BrowserPageStack<T extends BrowserStackPage = BrowserStackPage> {
  readonly router: BrowserRouter;
  private pages = new Map<number, { host: T; root: HTMLElement }>();
  private transition: Promise<void> = Promise.resolve();
  private disposed = false;
  private failure: unknown;
  private visible = true;
  private activeId: number | undefined;
  private maxRetainedPages: number;
  private readonly visibilityChanged = () => { void this.setVisibility(this.visible).catch(error => { this.failure = error; this.onError(error); }); };
  constructor(private container: HTMLElement,
    private createPage: (root: HTMLElement, page: string, router: NativeModuleHandler) => Promise<T>,
    private onError: (error: unknown) => void = error => console.error(error),
    private readonly retention: PageRetentionOptions = {}) {
    this.maxRetainedPages = retention.maxRetainedPages ?? Infinity;
    this.validateLimit(this.maxRetainedPages);
    this.container.ownerDocument.addEventListener('visibilitychange', this.visibilityChanged);
    this.router = new BrowserRouter(() => {
      if (this.disposed) return;
      this.transition = this.transition.then(() => this.synchronize()).catch(error => { this.failure = error; this.onError(error); });
    });
  }
  get host(): T | undefined { const id = this.router.entryId; return id === undefined ? undefined : this.pages.get(id)?.host; }
  private async synchronize(): Promise<void> {
    if (this.disposed) return;
    const retained = new Set(this.router.routeEntries.map(entry => entry.id));
    for (const [id, page] of this.pages) if (!retained.has(id)) { this.pages.delete(id); await page.host.destroy(); page.root.remove(); }
    const id = this.router.entryId; const entry = this.router.routeEntries.find(value => value.id === id);
    if (!entry) return;
    if (this.activeId !== entry.id && this.activeId !== undefined) await this.pages.get(this.activeId)?.host.setVisibility?.(false);
    let current = this.pages.get(entry.id);
    if (!current) {
      const root = this.container.ownerDocument.createElement('div'); root.className = 'surface';
      this.container.replaceChildren(root);
      try {
        const host = await this.createPage(root, entry.page, this.router.handlerFor(entry.id));
        if (this.disposed || !this.router.routeEntries.some(value => value.id === entry.id)) { await host.destroy(); root.remove(); return; }
        current = { root, host }; this.pages.set(entry.id, current);
      } catch (error) { root.remove(); throw error; }
    } else this.container.replaceChildren(current.root);
    this.activeId = entry.id;
    await this.updateVisibility();
    await this.evictHidden(this.maxRetainedPages - 1);
    // The container may have changed size while this entry was covered.
    if (this.router.entryId === entry.id) await current.host.resize(current.root.clientWidth, current.root.clientHeight);
  }
  private validateLimit(limit: number): void {
    if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) throw new Error('INVALID_PAGE_RETENTION_LIMIT');
  }
  async setVisibility(visible: boolean): Promise<void> {
    if (this.disposed) return;
    this.visible = visible;
    this.transition = this.transition.then(() => this.updateVisibility());
    await this.transition;
  }
  private async updateVisibility(): Promise<void> {
    if (this.disposed) return;
    for (const [id, page] of this.pages) await page.host.setVisibility?.(id === this.router.entryId && this.visible && !this.container.ownerDocument.hidden);
  }
  async setMaxRetainedPages(limit: number): Promise<void> {
    this.validateLimit(limit); if (this.disposed) return; this.maxRetainedPages = limit;
    this.transition = this.transition.then(() => this.evictHidden(limit - 1)); await this.transition;
  }
  /** Use on memory pressure. Only live hidden hosts are released; route entries/params survive. */
  async trimMemory(): Promise<void> {
    if (this.disposed) return;
    this.transition = this.transition.then(() => this.evictHidden(0)); await this.transition;
  }
  private async evictHidden(keep: number): Promise<void> {
    const hidden = this.router.routeEntries.filter(entry => entry.id !== this.router.entryId && this.pages.has(entry.id));
    for (const entry of hidden.slice(0, Math.max(0, hidden.length - keep))) {
      const page = this.pages.get(entry.id)!;
      this.pages.delete(entry.id); await page.host.setVisibility?.(false); await page.host.destroy(); page.root.remove();
      this.retention.onEvict?.(entry.page);
    }
  }
  async resize(): Promise<void> {
    if (this.disposed) return;
    this.transition = this.transition.then(async () => {
      if (this.disposed) return;
      const current = this.host;
      const id = this.router.entryId;
      const root = id === undefined ? undefined : this.pages.get(id)?.root;
      if (current && root) await current.resize(root.clientWidth, root.clientHeight);
    });
    await this.transition;
  }
  async handleBackPress(): Promise<boolean> {
    if (this.disposed) return false;
    await this.transition;
    if (this.disposed) return false;
    if (await this.host?.handleBackPress()) return true;
    return this.router.pop();
  }
  /** Waits for queued navigation and host creation; useful for app startup and integration tests. */
  async whenIdle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0)); await this.transition;
    if (this.failure) throw this.failure;
  }
  async destroy(): Promise<void> {
    if (this.disposed) return; this.disposed = true;
    this.container.ownerDocument.removeEventListener('visibilitychange', this.visibilityChanged);
    let failure: unknown;
    try { await this.transition; } catch (error) { failure = error; }
    const pages = Array.from(this.pages.values()); this.pages.clear();
    for (const page of pages) {
      try { await page.host.destroy(); } catch (error) { failure ??= error; }
      finally { page.root.remove(); }
    }
    if (failure) throw failure;
  }
}
