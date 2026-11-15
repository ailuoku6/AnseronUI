import { expect, it } from 'vitest';
import { Image, Text, View, Button, definePage, useState } from '@anseronui/ui';
import type { LayoutEvent } from '@anseronui/ui';
import { TestHost } from './host-harness.js';

it('transports dmSrc and remeasures lineHeight changes before publishing onLayout', async () => {
  let change = (_: number) => {};
  const frames: LayoutEvent[] = [];
  const h = new TestHost(definePage('appearance-layout', () => {
    const [lineHeight, set] = useState(24); change = set;
    return <View style={{ padding: 10, flexDirection: 'column' }}>
      <Image testID="image" src="asset://light.png" dmSrc="asset://dark.png" style={{ width: 40, height: 20 }} />
      <Text testID="label" style={{ fontSize: 16, lineHeight }} onLayout={frame => frames.push(frame)}>{'first\nsecond'}</Text>
      <Button title="action" style={{ lineHeight }} />
    </View>;
  }));
  await h.mount('appearance-layout');
  const image = [...h.nodes.values()].find(n => n.props.testID === 'image')!;
  expect(image.props).toMatchObject({ src: 'asset://light.png', dmSrc: 'asset://dark.png' });
  expect(frames).toHaveLength(1);
  expect(frames[0]).toMatchObject({ x: 10, y: 30, height: 48 });
  const before = h.outputs.filter(p => p.type === 'MeasureRequest').length;
  change(32); await h.settle();
  expect(h.outputs.filter(p => p.type === 'MeasureRequest').length).toBeGreaterThan(before);
  expect(frames).toHaveLength(2); expect(frames[1].height).toBe(64);
  change(32); await h.settle(); expect(frames).toHaveLength(2);
  expect([...h.nodes.values()].some(n => n.props.text === 'action' && n.props.lineHeight === 32)).toBe(true);
  h.runtime.dispose();
});
