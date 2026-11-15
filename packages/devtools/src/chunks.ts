import type { DevtoolsSnapshot } from './protocol.js';

/** Atomic snapshots over the native module's 64 KiB argument boundary. */
export class SnapshotAssembler {
  private pending = new Map<string, { seq: number; count: number; parts: Map<number, string>; size: number; at: number }>();
  accept(value: unknown): DevtoolsSnapshot | undefined {
    const chunk = value as { protocol: number; type: string; pagerId: string; seq: number; index: number; count: number; data: string };
    if (chunk?.type !== 'snapshotChunk') return value as DevtoolsSnapshot;
    const now = Date.now();
    for (const [id, entry] of this.pending) if (now - entry.at > 10000) this.pending.delete(id);
    if (chunk.protocol !== 1 || typeof chunk.pagerId !== 'string' || chunk.pagerId.length > 256 ||
        !Number.isSafeInteger(chunk.seq) || !Number.isInteger(chunk.count) || chunk.count < 1 || chunk.count > 512 ||
        !Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= chunk.count ||
        typeof chunk.data !== 'string' || chunk.data.length > 12000) throw new Error('INVALID_SNAPSHOT_CHUNK');
    let entry = this.pending.get(chunk.pagerId);
    if (entry && entry.seq > chunk.seq) return;
    if (!entry || entry.seq !== chunk.seq) {
      if (this.pending.size >= 32) this.pending.delete(this.pending.keys().next().value!);
      entry = { seq: chunk.seq, count: chunk.count, parts: new Map(), size: 0, at: now };
      this.pending.set(chunk.pagerId, entry);
    }
    if (entry.count !== chunk.count) throw new Error('INVALID_SNAPSHOT_CHUNK_COUNT');
    entry.size += chunk.data.length - (entry.parts.get(chunk.index)?.length ?? 0);
    if (entry.size > 6 * 1024 * 1024) { this.pending.delete(chunk.pagerId); throw new Error('SNAPSHOT_TOO_LARGE'); }
    entry.parts.set(chunk.index, chunk.data);
    if (entry.parts.size !== entry.count) return;
    this.pending.delete(chunk.pagerId);
    const snapshot = JSON.parse(Array.from({length: entry.count}, (_, i) => entry!.parts.get(i)).join('')) as DevtoolsSnapshot;
    if (snapshot.pagerId !== chunk.pagerId || snapshot.seq !== chunk.seq || snapshot.type !== 'snapshot') throw new Error('INVALID_SNAPSHOT_IDENTITY');
    return snapshot;
  }
}
