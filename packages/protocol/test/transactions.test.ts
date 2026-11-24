import { expect, it } from 'vitest';
import { CommitAssembler, splitCommit, utf8Length, validateEnvelope, patchProps } from '../src/index.js';
import type { RenderCommand } from '../src/index.js';
import { splitCoreMessage, CoreMessageBuffer, FrameworkWire, BusinessWire } from '../../core/src/wire.js';

it('buffers out-of-order Unicode commit chunks and rejects conflicting/partial transactions', () => {
  const commands: RenderCommand[] = Array.from({ length: 10000 }, (_, index) => ({ type: 'PatchProps', nodeId: index + 1, set: { text: '中文😀'.repeat(10) }, unset: [] }));
  const parts = splitCommit(1, 0, commands), assembler = new CommitAssembler();
  expect(parts[0].type).toBe('CommitBegin');
  for (const payload of parts) { expect(utf8Length(JSON.stringify(payload))).toBeLessThan(1024 * 1024); validateEnvelope({ protocolMajor: 2, protocolMinor: 0, bundleBuildId: 'test', runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: 1, sequence: 1, ackSequence: 0, payload }); }
  expect(assembler.accept(parts[0])).toBeNull();
  expect(() => assembler.accept(parts.at(-1)!)).toThrow('INCOMPLETE_COMMIT');
  for (const chunk of parts.slice(1, -1).reverse()) { expect(assembler.accept(chunk)).toBeNull(); expect(assembler.accept(chunk)).toBeNull(); }
  expect(assembler.accept(parts.at(-1)!)).toEqual({ type: 'Commit', revision: 1, baseRevision: 0, transactionId: 1, commands });
  expect(assembler.accept(parts.at(-1)!)).toEqual({ type: 'Commit', revision: 1, baseRevision: 0, transactionId: 1, commands });
  assembler.reset(1); expect(() => assembler.accept(parts[0])).toThrow('INVALID_COMMIT_BEGIN');
});
it('measures actual UTF-8 bytes and enforces atomic input patches', () => {
  expect(utf8Length('a中😀\ud800')).toBe(new TextEncoder().encode('a中😀\ud800').length);
  expect(() => patchProps({ value: '7', inputRevision: 0 }, { value: '8' }, [])).toThrow('INVALID_PROP_PATCH');
  expect(patchProps({ opacity: 0.2, value: '7', inputRevision: 0 }, { value: '7', inputRevision: 1 }, ['opacity'])).toEqual({ value: '7', inputRevision: 1 });
});
it('bounds both directions of the Core borrowed-string exchange', () => {
  const input = JSON.stringify({ type: 'Test', text: '中😀\\"'.repeat(300000) });
  const pieces = splitCoreMessage(input, 'test'), buffer = new CoreMessageBuffer();
  expect(pieces.length).toBeGreaterThan(1);
  for (const part of pieces) expect(utf8Length(part)).toBeLessThanOrEqual(1024 * 1024);
  let complete: string | null = null;
  for (const piece of pieces.reverse()) complete = buffer.accept(piece);
  expect(complete).toBe(input);
  const business = new BusinessWire(), framework = new FrameworkWire(); let requested = false, output = '';
  for (let i = 0; i < 100; i++) {
    const request = business.next(() => { if (requested) return ''; requested = true; return input; });
    if (!request) break;
    business.accept(framework.execute(request, value => value), value => { output = value; });
  }
  expect(output).toBe(input);
});
