import { utf8Length } from '@anseronui/protocol';
export const CORE_CHUNK_BYTES = 1024 * 1024;
export const CORE_MESSAGE_BYTES = 32 * 1024 * 1024;
type Chunk = { type: 'CoreChunk'; id: string; index: number; count: number; totalBytes: number; data: string };
/** Strings are split at Unicode boundaries before JSON escaping. The conservative
 * character cap also bounds the worst case (six-byte JSON escapes). */
export function splitCoreMessage(value: string, id: string): string[] {
  const bytes = utf8Length(value);
  if (bytes > CORE_MESSAGE_BYTES) throw new Error('CORE_MESSAGE_LIMIT');
  if (bytes <= CORE_CHUNK_BYTES) return [value];
  const pieces: string[] = [];
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 128 * 1024, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
    pieces.push(value.slice(start, end)); start = end;
  }
  return pieces.map((data, index) => JSON.stringify({ type: 'CoreChunk', id, index, count: pieces.length, totalBytes: bytes, data }));
}
export class CoreMessageBuffer {
  private header: Chunk | null = null;
  private parts = new Map<number, string>();
  private bytes = 0;
  clear(): void { this.header = null; this.parts.clear(); this.bytes = 0; }
  accept(value: string): string | null {
    if (utf8Length(value) > CORE_CHUNK_BYTES) throw new Error('CORE_CHUNK_LIMIT');
    const header = JSON.parse(value) as { type: string };
    if (header.type !== 'CoreChunk') return value;
    const input = JSON.parse(value) as Chunk;
    if (typeof input.id !== 'string' || input.id.length > 256 || !Number.isInteger(input.count) || input.count < 2 || input.count > 4096 || !Number.isInteger(input.index) || input.index < 0 || input.index >= input.count || !Number.isInteger(input.totalBytes) || input.totalBytes < 1 || input.totalBytes > CORE_MESSAGE_BYTES || typeof input.data !== 'string') throw new Error('INVALID_CORE_CHUNK');
    if (this.header && (this.header.id !== input.id || this.header.count !== input.count || this.header.totalBytes !== input.totalBytes)) throw new Error('CONFLICTING_CORE_CHUNK');
    if (!this.header) this.header = input;
    const previous = this.parts.get(input.index);
    if (previous !== undefined) { if (previous !== input.data) throw new Error('CONFLICTING_CORE_CHUNK'); return null; }
    this.parts.set(input.index, input.data); this.bytes += utf8Length(input.data);
    if (this.bytes > input.totalBytes) throw new Error('CORE_BUFFER_LIMIT');
    if (this.parts.size !== input.count) return null;
    const parts: string[] = []; for (let i = 0; i < input.count; i++) parts.push(this.parts.get(i)!);
    const result = parts.join('');
    if (utf8Length(result) !== input.totalBytes) throw new Error('CORE_BYTE_MISMATCH');
    this.clear(); return result;
  }
}
/** The borrowed-string native bridge and Wasm use the same bounded exchange. */
export class FrameworkWire {
  private buffer = new CoreMessageBuffer();
  private outgoing: string[] = [];
  execute(input: string, execute: (input: string) => string): string {
    const header = JSON.parse(input) as { type: string };
    if (header.type === 'CorePull') { const value = this.outgoing.shift(); if (!value) throw new Error('UNEXPECTED_CORE_PULL'); return value; }
    if (this.outgoing.length) throw new Error('CORE_REPLY_PENDING');
    const complete = this.buffer.accept(input);
    if (complete === null) return '{"type":"CoreReceipt"}';
    const result = execute(complete);
    this.outgoing = splitCoreMessage(result, 'reply'); return this.outgoing.shift()!;
  }
  clear(): void { this.buffer.clear(); this.outgoing = []; }
}
export class BusinessWire {
  private buffer = new CoreMessageBuffer();
  private outgoing: string[] = [];
  next(request: () => string): string {
    if (this.outgoing.length) return this.outgoing.shift()!;
    const value = request(); if (!value) return '';
    this.outgoing = splitCoreMessage(value, 'request'); return this.outgoing.shift()!;
  }
  accept(value: string, accept: (value: string) => void): void {
    const input = JSON.parse(value) as { type: string; index?: number; count?: number };
    if (input.type === 'CoreReceipt') return;
    const complete = this.buffer.accept(value);
    if (input.type === 'CoreChunk' && input.index! < input.count! - 1) this.outgoing.unshift('{"type":"CorePull"}');
    if (complete !== null) accept(complete);
  }
  clear(): void { this.buffer.clear(); this.outgoing = []; }
}
