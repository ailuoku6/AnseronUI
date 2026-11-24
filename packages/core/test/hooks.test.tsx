import { expect, it } from 'vitest';
import { Text, definePage, useCallback, useEffect, useMemo, useReducer, useState } from '@anseronui/ui';
import { TestHost } from './host-harness.js';

it('reduces queued actions in order and retains memo/callback identities until dependencies change', async () => {
  let dispatch!: (amount: number) => void;
  let rerender!: () => void;
  let memoCalls = 0;
  const snapshots: Array<{ count: number; dispatch: (amount: number) => void; memo: { doubled: number }; callback: () => number }> = [];
  const effects: string[] = [];
  const host = new TestHost(definePage('hook-semantics', () => {
    const [count, send] = useReducer((value: number, amount: number) => value + amount, 1);
    const [revision, setRevision] = useState(0);
    dispatch = send; rerender = () => setRevision(value => value + 1);
    const memo = useMemo(() => { memoCalls++; return { doubled: count * 2 }; }, [count]);
    const callback = useCallback(() => count, [count]);
    useEffect(() => { effects.push('start:' + count); return () => { effects.push('stop:' + count); }; }, [count]);
    snapshots.push({ count, dispatch: send, memo, callback });
    return <Text>{revision}:{memo.doubled}</Text>;
  }));
  try {
    await host.mount('hook-semantics');
    const first = snapshots.at(-1)!;
    expect(first.count).toBe(1); expect(first.callback()).toBe(1); expect(memoCalls).toBe(1);
    rerender(); await host.settle();
    const same = snapshots.at(-1)!;
    expect(same.memo).toBe(first.memo); expect(same.callback).toBe(first.callback);
    expect(same.dispatch).toBe(first.dispatch); expect(memoCalls).toBe(1);
    expect(effects).toEqual(['start:1']);
    dispatch(2); dispatch(3); dispatch(-1); await host.settle();
    const changed = snapshots.at(-1)!;
    expect(changed.count).toBe(5); expect(changed.memo.doubled).toBe(10); expect(changed.callback()).toBe(5);
    expect(changed.memo).not.toBe(first.memo); expect(changed.callback).not.toBe(first.callback);
    expect(first.callback()).toBe(1); expect(changed.dispatch).toBe(first.dispatch);
    expect(memoCalls).toBe(2); expect(effects).toEqual(['start:1', 'stop:1', 'start:5']);
  } finally { host.runtime.dispose(); }
  expect(effects).toEqual(['start:1', 'stop:1', 'start:5', 'stop:5']);
});
