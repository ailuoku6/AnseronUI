import { afterEach, expect, it, vi } from 'vitest';
import { definePage, Text, useState, useTimers, usePageEffect, usePageVisibility } from '@anseronui/ui';
import { TestHost } from './host-harness.js';
afterEach(() => vi.useRealTimers());

it('cleans up visible work once per hide, preserves hook state, and resumes timer remaining delay with a new request identity', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const events: string[] = []; let schedule = () => {}; let increment = () => {};
  const h = new TestHost(definePage('lifecycle', () => {
    const [value, setValue] = useState(0); const visible = usePageVisibility(); const timers = useTimers();
    increment = () => setValue(v => v + 1);
    schedule = () => { timers.setTimeout(() => events.push('fired'), 1000); };
    usePageEffect(() => { events.push('show'); return () => events.push('hide'); }, []);
    return <Text>{String(visible)}:{value}</Text>;
  }));
  try {
    await h.mount('lifecycle'); increment(); await h.settle(); schedule();
    const start = (await h.settle()).find(p => p.type === 'InvokeModule' && p.module === 'timer');
    if (!start || start.type !== 'InvokeModule') throw new Error('missing timer');
    vi.setSystemTime(1300);
    h.send({ type: 'SurfaceVisibility', visible: false });
    const hidden = await h.settle();
    expect(events).toEqual(['show', 'hide']);
    expect(hidden).toContainEqual({ type: 'CancelRequest', requestId: start.requestId });
    h.send({ type: 'SurfaceVisibility', visible: false }); await h.settle();
    h.send({ type: 'ModuleResult', requestId: start.requestId, ok: true, value: '' }); await h.settle();
    expect(events).not.toContain('fired');
    vi.setSystemTime(9000); increment();
    expect(await h.settle()).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'Commit' })]));
    h.send({ type: 'SurfaceVisibility', visible: true });
    const resumed = await h.settle();
    const timer = resumed.find(p => p.type === 'InvokeModule' && p.module === 'timer');
    expect(timer).toMatchObject({ argument: '700' });
    expect(timer?.type === 'InvokeModule' && timer.requestId).not.toBe(start.requestId);
    expect(events).toEqual(['show', 'hide', 'show']);
    expect([...h.nodes.values()].some(n => n.props.text === 'true:2')).toBe(true);
    if (timer?.type === 'InvokeModule') h.send({ type: 'ModuleResult', requestId: timer.requestId, ok: true, value: '' });
    await h.settle(); expect(events.at(-1)).toBe('fired');
    h.send({ type: 'DestroySurface' }); await h.settle();
    expect(events.filter(e => e === 'hide')).toHaveLength(2);
    expect(h.runtime.getStats()).toMatchObject({ surfaces: 0, nodes: 0, frames: 0, timers: 0, modules: 0 });
  } finally { h.runtime.dispose(); }
});
it('does not start a background-created surface until shown and cancels a timer scheduled while hidden', async () => {
  let mounted = 0;
  const h = new TestHost(definePage('hidden', () => { usePageEffect(() => { mounted++; }, []); return <Text>ready</Text>; }));
  try {
    h.send({ type: 'CreateSurface', page: 'hidden', width: 320, height: 480, visible: false }); await h.settle();
    expect(mounted).toBe(0); expect(h.runtime.hasPendingWork()).toBe(false);
    h.send({ type: 'SurfaceVisibility', visible: true }); await h.settle(); expect(mounted).toBe(1);
  } finally { h.runtime.dispose(); }
});
