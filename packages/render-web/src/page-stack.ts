import { BrowserRouter } from './router.js';
import type { NativeModuleHandler } from './extensions.js';

export interface BrowserStackPage {
  resize(width: number, height: number): Promise<void>;
  handleBackPress(): Promise<boolean>;
  destroy(): Promise<void>;
}
/** Owns live page hosts per stack entry. Covered DOM is detached and restored without remounting. */
export class BrowserPageStack<T extends BrowserStackPage = BrowserStackPage> {
  readonly router: BrowserRouter;
  private pages = new Map<number, { host: T; root: HTMLElement }>();
  private transition: Promise<void> = Promise.resolve();
  private disposed = false;
  private failure: unknown;
  constructor(private container: HTMLElement,
    private createPage: (root: HTMLElement, page: string, router: NativeModuleHandler) => Promise<T>,
    private onError: (error: unknown) => void = error => console.error(error)) {
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
    // The container may have changed size while this entry was covered.
    if (this.router.entryId === entry.id) await current.host.resize(current.root.clientWidth, current.root.clientHeight);
  }
  async resize(): Promise<void> {
    const id = this.router.entryId; const current = id === undefined ? undefined : this.pages.get(id);
    if (current) await current.host.resize(current.root.clientWidth, current.root.clientHeight);
  }
  async handleBackPress(): Promise<boolean> {
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
    await this.transition;
    const pages = Array.from(this.pages.values()); this.pages.clear();
    for (const page of pages) { await page.host.destroy(); page.root.remove(); }
  }
}
