import { expect, it } from 'vitest';
import { Button, View, definePage, useState, createRef } from '@anseronui/ui';
import { TestHost } from './host-harness.js';

it('composes Button from basic nodes with shared geometry, press feedback and disabled guards', async () => {
  const ref = createRef<import('@anseronui/ui').NodeHandle>();
  let disable = (_: boolean) => {};
  let clicks = 0;
  const h = new TestHost(definePage('buttons', () => {
    const [disabled, setDisabled] = useState(false); disable = setDisabled;
    return <View style={{ flexDirection: 'column', alignItems: 'start' }}>
      <Button testID="padding" title="内边距" style={{ padding: 20 }} />
      <Button ref={ref} testID="action" title="确认" disabled={disabled}
        style={{ width: 160, height: 44, fontSize: 18, color: '#123456', dmColor: '#abcdef' }} onClick={() => clicks++} />
    </View>;
  }));
  await h.mount('buttons');
  const root = () => [...h.nodes].find(([, node]) => node.props.testID === 'action')!;
  const [id, node] = root();
  expect([...h.nodes.values()].some(n => n.kind === 'Button')).toBe(false);
  expect(node.kind).toBe('View');
  expect(node.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: '确认', opacity: 1 });
  const label = [...h.nodes.values()].find(n => n.parent === id)!;
  expect(label.kind).toBe('Text');
  expect(label.props).toMatchObject({ text: '确认', fontSize: 18, color: '#123456', dmColor: '#abcdef', numberOfLines: 1, textAlign: 'center' });
  expect(node.frame).toMatchObject({ width: 160, height: 44 });
  expect(label.frame!.x + label.frame!.width / 2).toBeCloseTo(80, 0);
  const [paddedId, padded] = [...h.nodes].find(([, n]) => n.props.testID === 'padding')!;
  const paddedLabel = [...h.nodes.values()].find(n => n.parent === paddedId)!;
  expect(paddedLabel.frame!.x).toBe(20);
  expect(padded.frame!.height).toBe(paddedLabel.frame!.height + 40);
  expect(ref.current?.nodeId).toBe(id);
  h.send({ type: 'NativeEvent', event: 'touchDown', nodeId: id, revision: h.revision, x: 10, y: 10, pageX: 10, pageY: 10, pointerId: 1, touches: [] }); await h.settle();
  expect(root()[1].props.opacity).toBe(0.6);
  h.send({ type: 'NativeEvent', event: 'touchCancel', nodeId: id, revision: h.revision, x: 10, y: 10, pageX: 10, pageY: 10, pointerId: 1, touches: [] }); await h.settle();
  expect(root()[1].props.opacity).toBe(1);
  h.send({ type: 'Tap', nodeId: id, revision: h.revision }); await h.settle(); expect(clicks).toBe(1);
  disable(true); await h.settle();
  expect(root()[1].props).toMatchObject({ disabled: true, opacity: 0.4 });
  h.send({ type: 'Tap', nodeId: id, revision: h.revision }); await h.settle(); expect(clicks).toBe(1);
  disable(false); await h.settle();
  expect(root()[0]).toBe(id); expect(root()[1].props.opacity).toBe(1);
  h.runtime.dispose(); expect(ref.current).toBeNull();
});
