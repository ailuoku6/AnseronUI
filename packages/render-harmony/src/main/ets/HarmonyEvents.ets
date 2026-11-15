class Subscription {
  readonly module: string;
  queue: Object[] = [];
  resolve: ((value: Object) => void) | null = null;
  reject: ((reason: Error) => void) | null = null;
  error: Error | null = null;
  constructor(module: string) { this.module = module; }
}
/** The shared protocol uses one cancellable long-poll per subscription. */
export class HarmonyEvents {
  private entries: Map<string, Subscription> = new Map();
  private closed: boolean = false;
  onChange: (module: string, enabled: boolean) => void = () => {};
  next(id: string, module: string): Promise<Object> {
    if (this.closed) throw new Error('CANCELLED');
    if (!id || id.length > 128) throw new Error('INVALID_ARGUMENT: subscription ID');
    if (!this.entries.has(id)) {
      if (this.entries.size >= 128) throw new Error('IO_ERROR: subscription limit');
      const active = this.hasModule(module);
      this.entries.set(id, new Subscription(module));
      try { if (!active) this.onChange(module, true); }
      catch (error) { this.entries.delete(id); throw new Error(String(error)); }
    }
    const entry = this.entries.get(id)!;
    if (entry.module !== module || entry.resolve) throw new Error('INVALID_ARGUMENT: overlapping subscription');
    if (entry.error) return Promise.reject<Object>(entry.error);
    if (entry.queue.length > 0) return Promise.resolve<Object>(entry.queue.shift()!);
    return new Promise<Object>((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
  }
  emit(module: string, value: Object): void {
    this.entries.forEach(entry => {
      if (entry.module !== module) return;
      if (entry.resolve) { const resolve = entry.resolve; entry.resolve = null; entry.reject = null; resolve(value); }
      else if (module === 'bluetooth' || module === 'linking') {
        if (entry.error) return;
        if (entry.queue.length >= 64) { entry.queue = []; entry.error = new Error('IO_ERROR: subscription queue overflow'); }
        else entry.queue.push(value);
      } else { entry.queue = [value]; }
    });
  }
  close(id: string): void {
    const entry = this.entries.get(id); if (!entry) return;
    this.entries.delete(id); entry.reject?.(new Error('CANCELLED'));
    if (!this.hasModule(entry.module)) this.onChange(entry.module, false);
  }
  hasModule(module: string): boolean { for (const entry of this.entries.values()) if (entry.module === module) return true; return false; }
  dispose(): void { this.closed = true; const ids = Array.from(this.entries.keys()); for (const id of ids) this.close(id); }
}
