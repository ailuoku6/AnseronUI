import { expect, it, vi } from 'vitest';
import { definePage, VirtualList, View, Text, Button, ScrollView, useState, useEffect, createRef } from '@anseronui/ui';
import type { VirtualListHandle } from '@anseronui/ui';
import { TestHost } from './host-harness.js';

it('keeps reverse prefetch direction when coalesced native offsets include positive height compensation', async () => {
  const clock = vi.spyOn(Date, 'now'); clock.mockReturnValue(10000);
  const data = Array.from({ length: 5000 }, (_, id) => id);
  const h = new TestHost(definePage('compensated-fling', () => <VirtualList data={data} keyExtractor={id => id}
    estimatedItemHeight={100} renderItem={id => <View testID={'row-' + id} style={{ height: 100 }} />} />));
  try {
    await h.mount('compensated-fling');
    const scroll = [...h.nodes].find(([, node]) => node.kind === 'ScrollView')![0];
    const move = async (time: number, y: number, scrollAdjustment: number) => {
      clock.mockReturnValue(time);
      h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y,
        contentWidth: 320, contentHeight: 500000, scrollAdjustment });
      await h.settle();
    };
    await move(11000, 10000, 0);
    await move(11100, 9000, 0);
    // Actual travel is -1000 although the native offset increases by 800.
    await move(11200, 9800, 1800);
    const mounted = [...h.nodes.values()].map(node => String(node.props.testID ?? '')).filter(id => id.startsWith('row-')).map(id => Number(id.slice(4)));
    expect(98 - Math.min(...mounted)).toBeGreaterThan(Math.max(...mounted) - 103);
    expect(mounted).toContain(98);
  } finally { h.runtime.dispose(); clock.mockRestore(); }
});

it('renders the latest scroll position without replaying every stale viewport in a burst', async () => {
  const data = Array.from({ length: 5000 }, (_, id) => id);
  const h = new TestHost(definePage('fast-list', () => <VirtualList data={data} keyExtractor={id => id}
    estimatedItemHeight={40} overscan={160} renderItem={id => <View testID={'row-' + id} style={{ height: 40 }} />} />));
  try {
    await h.mount('fast-list');
    const scroll = [...h.nodes].find(([, node]) => node.kind === 'ScrollView')![0];
    const before = h.runtime.getStats().commits;
    // A native fling can produce many offsets while Core is measuring/committing.
    for (let i = 1; i <= 60; i++) h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision,
      event: 'scroll', x: 0, y: i * 400, contentWidth: 320, contentHeight: 200000 });
    await h.settle();
    expect([...h.nodes.values()].some(node => node.props.testID === 'row-600')).toBe(true);
    expect(h.runtime.getStats().commits - before).toBeLessThanOrEqual(4);
  } finally { h.runtime.dispose(); }
});

it('coalesces queued scrolls without crossing a discrete tap or losing the last position', async () => {
  const events: string[] = [];
  const h = new TestHost(definePage('scroll-order', () => {
    const [offset, setOffset] = useState(0);
    return <View><ScrollView testID="scroll" onScroll={value => { events.push('scroll:' + value); setOffset(value); }}>
      <Text>{offset}</Text>
    </ScrollView><Button title="tap" onClick={() => events.push('tap')} /></View>;
  }));
  try {
    await h.mount('scroll-order');
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    const button = [...h.nodes].find(([, n]) => n.props.accessibilityRole === 'button')![0];
    const send = (y: number) => h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision,
      event: 'scroll', x: 0, y, contentWidth: 320, contentHeight: 5000 });
    send(10); send(20); send(30);
    h.send({ type: 'Tap', nodeId: button, revision: h.revision });
    send(40); send(50); send(60);
    await h.settle();
    expect(events).toEqual(['scroll:10', 'scroll:30', 'tap', 'scroll:60']);
  } finally { h.runtime.dispose(); }
});

it('accepts the latest native scroll offset even when a commit overtakes its revision', async () => {
  const data = Array.from({ length: 1000 }, (_, id) => id);
  const h = new TestHost(definePage('delayed-scroll', () => <VirtualList data={data} keyExtractor={id => id}
    estimatedItemHeight={40} renderItem={id => <View testID={'row-' + id} style={{ height: 40 }} />} />));
  try {
    await h.mount('delayed-scroll');
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    const observedRevision = h.revision;
    h.send({ type: 'NativeEvent', nodeId: scroll, revision: observedRevision, event: 'scroll', x: 0, y: 400, contentWidth: 320, contentHeight: 40000 });
    await h.settle();
    expect(h.revision).toBeGreaterThan(observedRevision);
    // The UI thread emitted this before processing the new commit, while the
    // Core owner thread was busy. The viewport still lives at this final offset.
    h.send({ type: 'NativeEvent', nodeId: scroll, revision: observedRevision, event: 'scroll', x: 0, y: 12000, contentWidth: 320, contentHeight: 40000 });
    await h.settle();
    expect([...h.nodes.values()].some(n => n.props.testID === 'row-300')).toBe(true);
  } finally { h.runtime.dispose(); }
});

it('keeps an already covered window stable during small scroll movements', async () => {
  // Model a slow gesture at frame cadence; wall-clock test speed is not velocity.
  const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
  const data = Array.from({ length: 500 }, (_, id) => id);
  let parentUpdate = () => {};
  const h = new TestHost(definePage('stable-window', () => {
    const [, tick] = useState(0); parentUpdate = () => tick(value => value + 1);
    return <VirtualList data={data} keyExtractor={id => id}
      estimatedItemHeight={40} overscan={240} renderItem={id => <View style={{ height: 40 }} />} />;
  }));
  try {
    await h.mount('stable-window');
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    const commits = h.runtime.getStats().commits;
    for (let y = 2; y <= 60; y += 2) {
      clock.mockReturnValue(10000 + y * 8);
      h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y, contentWidth: 320, contentHeight: 20000 });
      await h.settle();
    }
    expect(h.runtime.getStats().commits).toBe(commits);
    const mounted = [...h.nodes.keys()];
    parentUpdate(); await h.settle();
    expect([...h.nodes.keys()]).toEqual(mounted);
  } finally { h.runtime.dispose(); clock.mockRestore(); }
});

it('applies pending viewport state before rendering layout refinements', async () => {
  const rendered: number[] = [];
  let refine = () => {};
  const h = new TestHost(definePage('scroll-priority', () => {
    const [pass, setPass] = useState(4);
    const [offset, setOffset] = useState(0);
    refine = () => setPass(0);
    useEffect(() => { if (pass < 4) setPass(pass + 1); }, [pass]);
    rendered.push(offset);
    return <ScrollView onScroll={setOffset}><Text>{pass}:{offset}</Text></ScrollView>;
  }));
  try {
    await h.mount('scroll-priority'); rendered.length = 0;
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    refine();
    h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y: 12000, contentWidth: 320, contentHeight: 20000 });
    await h.settle();
    expect(rendered.length).toBeGreaterThan(1);
    expect(rendered.every(offset => offset === 12000)).toBe(true);
  } finally { h.runtime.dispose(); }
});

it('commits above-viewport height compensation with row frames instead of a late absolute scrollTo', async () => {
  const data = Array.from({ length: 500 }, (_, id) => id);
  let expand = () => {};
  const h = new TestHost(definePage('atomic-anchor', () => {
    const [extra, setExtra] = useState(0); expand = () => setExtra(80);
    return <VirtualList data={data} keyExtractor={id => id} estimatedItemHeight={40} overscan={240}
      renderItem={id => <View testID={'row-' + id} style={{ height: 40 + (id === 18 ? extra : 0) }} />} />;
  }));
  try {
    await h.mount('atomic-anchor');
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y: 800, contentWidth: 320, contentHeight: 20000 });
    await h.settle(); const imperativeScrolls = h.scrolls.length;
    expand(); await h.settle();
    expect(h.nodes.get(scroll)?.props.scrollAnchorOffset).toBe(80);
    expect(h.scrolls).toHaveLength(imperativeScrolls);
  } finally { h.runtime.dispose(); }
});

it('mounts a bounded window of 5000 unequal rows, scrolls to distant indices and measures height changes', async () => {
  const data = Array.from({ length: 5000 }, (_, id) => ({ id, height: 20 + id % 7 * 13 }));
  const ref = createRef<VirtualListHandle>(); let update = (_: number) => {};
  const page = definePage('list', () => {
    const [extra, setExtra] = useState(0); update = setExtra;
    return <VirtualList data={data} keyExtractor={item => item.id} ref={ref} estimatedItemHeight={40} overscan={160}
      renderItem={item => <View testID={'row-' + item.id} style={{ height: item.height + (item.id === 0 ? extra : 0) }} />} />;
  });
  const h = new TestHost(page);
  try {
    await h.mount('list');
    expect(h.nodes.size).toBeLessThan(100);
    expect([...h.nodes.values()].find(n => n.props.testID === 'row-0')?.frame?.height).toBe(20);
    update(80); await h.settle();
    expect([...h.nodes.values()].find(n => n.props.testID === 'row-0')?.frame?.height).toBe(100);
    await ref.current!.scrollToIndex(4000); await h.settle();
    expect([...h.nodes.values()].some(n => n.props.testID === 'row-4000')).toBe(true);
    expect([...h.nodes.values()].some(n => n.props.testID === 'row-0')).toBe(false);
    expect(h.nodes.size).toBeLessThan(100);
    const scroll = [...h.nodes].find(([, n]) => n.kind === 'ScrollView')![0];
    h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y: 0, contentWidth: 320, contentHeight: 200000 });
    await h.settle(); expect([...h.nodes.values()].some(n => n.props.testID === 'row-0')).toBe(true);
    expect(h.runtime.getStats().nodes).toBeLessThan(100);
  } finally { h.runtime.dispose(); }
});

it('rejects invalid list configuration and imperative scroll targets', async () => {
  for (const [suffix, overscan] of [['negative', -1], ['nan', Number.NaN], ['infinite', Number.POSITIVE_INFINITY]] as const) {
    const pageName = 'invalid-list-' + suffix;
    const h = new TestHost(definePage(pageName, () => <VirtualList data={[1]} keyExtractor={item => item}
      overscan={overscan} renderItem={item => <Text>{item}</Text>} />));
    await expect(h.mount(pageName)).rejects.toThrow('INVALID_LIST_OVERSCAN');
    h.runtime.dispose();
  }
  const ref = createRef<VirtualListHandle>();
  const h = new TestHost(definePage('invalid-targets', () => <VirtualList data={[1, 2]} keyExtractor={item => item} ref={ref}
    renderItem={item => <Text>{item}</Text>} />));
  try {
    await h.mount('invalid-targets');
    await expect(ref.current!.scrollToOffset(Number.NaN)).rejects.toThrow('INVALID_LIST_OFFSET');
    await expect(ref.current!.scrollToOffset(Number.POSITIVE_INFINITY)).rejects.toThrow('INVALID_LIST_OFFSET');
    await expect(ref.current!.scrollToIndex(-1)).rejects.toThrow('INVALID_LIST_INDEX');
    await expect(ref.current!.scrollToIndex(2)).rejects.toThrow('INVALID_LIST_INDEX');
    await expect(ref.current!.scrollToIndex(1.5)).rejects.toThrow('INVALID_LIST_INDEX');
  } finally { h.runtime.dispose(); }
});

it('uses wrapped text height and invalidates measurements when viewport width changes', async () => {
  const data = Array.from({ length: 100 }, (_, id) => ({ id, text: 'variable height content '.repeat(id % 4 + 1) }));
  const h = new TestHost(definePage('text-list', () => <VirtualList data={data} keyExtractor={item => item.id} renderItem={item => <Text testID={'text-' + item.id}>{item.text}</Text>} />));
  try {
    await h.mount('text-list', 320, 480);
    const before = [...h.nodes.values()].find(n => n.props.testID === 'text-3')!.frame!.height;
    h.send({ type: 'Resize', width: 160, height: 480 }); await h.settle();
    const after = [...h.nodes.values()].find(n => n.props.testID === 'text-3')!.frame!.height;
    expect(after).toBeGreaterThan(before);
  } finally { h.runtime.dispose(); }
});

it('keeps the viewport bounded through deep scrolling, cache turnover, prepend and resize', async () => {
  const { virtualListPage } = await import('../../../examples/virtual-list/page.js');
  const h = new TestHost(virtualListPage);
  try {
    await h.mount('virtual-list', 390, 700);
    const scroll = [...h.nodes].find(([, n]) => n.props.testID === 'variable-list')![0];
    for (let i = 0; i < 26; i++) {
      h.send({ type: 'NativeEvent', nodeId: scroll, revision: h.revision, event: 'scroll', x: 0, y: i * 12000, contentWidth: 390, contentHeight: 500000 });
      await h.settle();
      const rows = [...h.nodes.values()].filter(n => String(n.props.testID ?? '').startsWith('list-row-'));
      expect(rows.length).toBeLessThanOrEqual(32);
      // Each visible row now includes the composed Button's View and Text.
      expect(h.nodes.size).toBeLessThanOrEqual(rows.length * 7 + 16);
      expect(h.runtime.getStats().measureCacheEntries).toBeLessThanOrEqual(1024);
    }
    const prepend = [...h.nodes].find(([, n]) => n.props.testID === 'list-prepend')![0];
    h.send({ type: 'Tap', nodeId: prepend, revision: h.revision }); await h.settle();
    h.send({ type: 'Resize', width: 240, height: 700 }); await h.settle();
    expect(h.nodes.get(scroll)!.frame!.height).toBeLessThanOrEqual(700);
    const finalRows = [...h.nodes.values()].filter(n => String(n.props.testID ?? '').startsWith('list-row-'));
    expect(finalRows.length).toBeLessThanOrEqual(32);
    expect(h.nodes.size).toBeLessThanOrEqual(finalRows.length * 7 + 16);
    h.send({ type: 'DestroySurface' }); await h.settle();
    expect(h.runtime.getStats()).toMatchObject({ surfaces: 0, measureCacheEntries: 0 });
  } finally { h.runtime.dispose(); }
});
