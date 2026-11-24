import { afterEach, expect, it } from 'vitest';
import { definePage, useServices, useState, useTextMeasurer, View } from '@anseronui/ui';
import type { MeasureTextOptions, Services, TextMeasurer } from '@anseronui/ui';
import { validateEnvelope } from '@anseronui/protocol';
import type { OutputPayload } from '@anseronui/protocol';
import { TestHost } from './host-harness.js';

const hosts: TestHost[] = [];
afterEach(() => { for (const host of hosts.splice(0)) host.runtime.dispose(); });
async function setup() {
  let measure!: TextMeasurer, services!: Services, remove!: () => void;
  function Child() { measure = useTextMeasurer(); services = useServices(); return <View />; }
  const host = new TestHost(definePage('measurement', () => {
    const [visible, setVisible] = useState(true); remove = () => setVisible(false);
    return <View>{visible ? <Child /> : null}</View>;
  }));
  hosts.push(host); await host.mount('measurement');
  return { host, measure, services, remove };
}
function requests(host: TestHost) {
  return host.runtime.takeOutputs().map(message => {
    validateEnvelope(message); host.ack = message.sequence; return message.payload;
  }).filter((p): p is Extract<OutputPayload, { type: 'MeasureRequest' }> => p.type === 'MeasureRequest');
}

it('measures detached text, forwards typography and matches concurrent results independently of layout', async () => {
  const { host, measure, services } = await setup();
  const count = host.nodes.size;
  const first = measure({ text: '中文 🪿\nsecond', maxWidth: 180, maxHeight: 35,
    style: { fontSize: 18, fontWeight: 'bold', fontStyle: 'italic', lineHeight: 24 }, numberOfLines: 2, ellipsizeMode: 'clip' });
  const second = services.measureText({ text: 'short' });
  const [a, b] = requests(host);
  expect(a).toMatchObject({ text: '中文 🪿\nsecond', fontSize: 18, maxWidth: 180,
    props: { fontWeight: 'bold', fontStyle: 'italic', lineHeight: 24, numberOfLines: 2, ellipsizeMode: 'clip' } });
  expect(host.nodes.has(a.nodeId)).toBe(false);
  host.send({ type: 'MeasureResult', requestId: b.requestId, nodeId: b.nodeId, width: 28, height: 20, baseline: 16 });
  host.send({ type: 'MeasureResult', requestId: a.requestId, nodeId: b.nodeId, width: 999, height: 999, baseline: 16 });
  await host.settle();
  await expect(second).resolves.toEqual({ width: 28, height: 20 });
  host.send({ type: 'MeasureResult', requestId: a.requestId, nodeId: a.nodeId, width: 181, height: 48, baseline: 18 });
  await host.settle();
  await expect(first).resolves.toEqual({ width: 180, height: 35 });
  expect(host.nodes.size).toBe(count);
  expect(host.runtime.getStats().modules).toBe(0);
});

it('handles empty content and zero constraints without platform work', async () => {
  const { host, measure } = await setup();
  for (const options of [{ text: '' }, { text: 'content', maxWidth: 0 }, { text: 'content', maxHeight: 0 }]) {
    await expect(measure(options)).resolves.toEqual({ width: 0, height: 0 });
  }
  expect(requests(host)).toEqual([]);
});

it.each([
  { text: 'x', maxWidth: -1 }, { text: 'x', maxWidth: Infinity }, { text: 'x', maxHeight: NaN },
  { text: 'x', numberOfLines: 1.5 }, { text: 'x', numberOfLines: -1 },
  { text: 'x', style: { fontSize: 0 } }, { text: 'x', style: { lineHeight: -2 } },
  { text: 'x', style: { fontWeight: '500' } }, { text: 'x'.repeat(65537) },
])('rejects invalid input before crossing the platform boundary', async options => {
  const { host, measure } = await setup();
  await expect(measure(options as MeasureTextOptions)).rejects.toThrow('INVALID_TEXT_MEASUREMENT');
  expect(requests(host)).toEqual([]);
});

it('cancels owner requests on unmount and ignores a late measurement', async () => {
  const { host, measure, remove } = await setup();
  const pending = measure({ text: 'pending' });
  const rejected = expect(pending).rejects.toThrow('SURFACE_DISPOSED');
  const [request] = requests(host);
  remove();
  expect(await host.settle()).toContainEqual({ type: 'CancelRequest', requestId: request.requestId });
  await rejected;
  host.send({ type: 'MeasureResult', requestId: request.requestId, nodeId: request.nodeId, width: 10, height: 20, baseline: 16 });
  await host.settle();
  await expect(measure({ text: '' })).rejects.toThrow('SURFACE_DISPOSED');
});

it('rejects outstanding requests on surface destruction', async () => {
  const { host, measure } = await setup();
  const pending = measure({ text: 'pending' });
  const rejected = expect(pending).rejects.toThrow('SURFACE_DISPOSED');
  requests(host);
  host.send({ type: 'DestroySurface' }); await host.settle();
  await rejected;
});

it('rejects measurement calls made during render', async () => {
  let result!: Promise<unknown>;
  const host = new TestHost(definePage('bad-measurement', () => {
    result = useTextMeasurer()({ text: 'during render' }).catch(error => String(error));
    return <View />;
  }));
  hosts.push(host); await host.mount('bad-measurement');
  await expect(result).resolves.toContain('SERVICE_DURING_RENDER');
});
