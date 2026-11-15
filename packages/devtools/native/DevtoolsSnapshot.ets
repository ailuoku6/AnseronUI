/** Platform-neutral native snapshot encoder. The caller owns transport and lifecycle. */
export class AnseronUIDevtoolsReporter {
  private sequence: number = 0;
  constructor(private readonly pagerId: string, private readonly platform: string, private readonly sink: (payload: string) => void) {
    if (!pagerId || !platform) throw new Error('INVALID_DEVTOOLS_REPORTER');
  }
  snapshot(page: string, stats: Record<string, number> = {}, diagnostics: Object[] = []): void {
    const payload = { protocol: 1, type: 'snapshot', pagerId: this.pagerId, page, platform: this.platform,
      ts: Date.now(), seq: ++this.sequence, stats, diagnostics };
    this.sink(JSON.stringify(payload));
  }
}
