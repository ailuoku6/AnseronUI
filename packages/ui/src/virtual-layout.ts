/** Keyed variable-height index. Measurements and viewport queries are O(log n). */
export class VariableHeightLayout {
  private keys: string[] = [];
  private indices = new Map<string, number>();
  private measured = new Map<string, number>();
  private heights: number[] = [];
  private sums: number[] = [0];
  private estimate = 48;
  generation = 0;
  get count(): number { return this.keys.length; }
  get totalHeight(): number { return this.offset(this.count); }
  key(index: number): string { return this.keys[index] ?? ''; }
  index(key: string): number { return this.indices.get(key) ?? -1; }
  height(index: number): number { return this.heights[index] ?? 0; }
  reset(keys: string[], estimate: number, invalidate = false): void {
    if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('INVALID_ESTIMATED_ITEM_HEIGHT');
    const next = new Map<string, number>();
    for (let i = 0; i < keys.length; i++) {
      if (next.has(keys[i])) throw new Error('DUPLICATE_LIST_KEY: ' + keys[i]);
      next.set(keys[i], i);
    }
    for (const key of this.measured.keys()) if (invalidate || !next.has(key)) this.measured.delete(key);
    this.keys = keys; this.indices = next; this.estimate = estimate; this.generation++;
    this.heights = keys.map(key => this.measured.get(key) ?? estimate);
    this.sums = new Array<number>(keys.length + 1).fill(0);
    // Linear Fenwick construction.
    for (let i = 1; i <= keys.length; i++) {
      this.sums[i] += this.heights[i - 1];
      const parent = i + (i & -i);
      if (parent <= keys.length) this.sums[parent] += this.sums[i];
    }
  }
  measure(key: string, height: number, generation: number): boolean {
    if (generation !== this.generation || !Number.isFinite(height) || height < 0) return false;
    const index = this.index(key);
    if (index < 0) return false;
    const delta = height - this.heights[index];
    this.measured.set(key, height);
    if (Math.abs(delta) < 0.5) return false;
    this.heights[index] = height;
    for (let i = index + 1; i < this.sums.length; i += i & -i) this.sums[i] += delta;
    return true;
  }
  offset(index: number): number {
    let sum = 0;
    for (let i = Math.min(this.count, Math.max(0, Math.floor(index))); i > 0; i -= i & -i) sum += this.sums[i];
    return sum;
  }
  /** First row whose trailing edge is beyond offset. */
  at(offset: number): number {
    if (!this.count) return 0;
    let index = 0, sum = 0, bit = 1;
    while (bit * 2 <= this.count) bit *= 2;
    for (; bit > 0; bit = Math.floor(bit / 2)) {
      const next = index + bit;
      if (next <= this.count && sum + this.sums[next] <= Math.max(0, offset)) { index = next; sum += this.sums[next]; }
    }
    return Math.min(index, this.count - 1);
  }
  range(offset: number, viewport: number, overscan: number): { start: number; end: number } {
    if (!this.count || viewport <= 0) return { start: 0, end: 0 };
    return { start: this.at(Math.max(0, offset - overscan)), end: Math.min(this.count, this.at(offset + viewport + overscan) + 1) };
  }
}
