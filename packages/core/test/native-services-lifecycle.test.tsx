import { afterEach, describe, expect, it } from 'vitest';
import { Text, View, definePage, useServices, useState } from '@anseronui/ui';
import type { Services } from '@anseronui/ui';
import type { OutputPayload } from '@anseronui/protocol';
import { TestHost } from './host-harness.js';

const hosts: TestHost[] = [];
afterEach(() => { for (const host of hosts.splice(0)) host.runtime.dispose(); });
type Call = Extract<OutputPayload, { type: 'InvokeModule' }>;
const calls = (outputs: OutputPayload[]) => outputs.filter((output): output is Call => output.type === 'InvokeModule' && output.purpose !== 'renderWatchdog');

async function setup() {
  let services!: Services;
  let remove!: () => void;
  function Child() { services = useServices(); return <Text>services</Text>; }
  const host = new TestHost(definePage('services', () => {
    const [visible, setVisible] = useState(true); remove = () => setVisible(false);
    return <View>{visible ? <Child /> : null}</View>;
  }));
  hosts.push(host); await host.mount('services');
  return { host, get services() { return services; }, remove: () => remove() };
}

// Exercise the public facade through the real runtime's ownership and request
// registry. These tests do not claim that a mocked result proves OS behavior.
describe('service requests across component lifetimes', () => {
  it('matches out-of-order results to their callers and preserves JSON/UTF-8 values', async () => {
    const { host, services } = await setup();
    const first = services.storage.get('第一项');
    const second = services.permissions.check('camera');
    const pending = calls(await host.settle());
    expect(pending).toHaveLength(2);
    host.send({ type: 'ModuleResult', requestId: pending[1]!.requestId, ok: true, value: '"denied"' });
    host.send({ type: 'ModuleResult', requestId: pending[0]!.requestId, ok: true, value: '"值 🪿\\n第二行"' });
    await host.settle();
    await expect(first).resolves.toBe('值 🪿\n第二行');
    await expect(second).resolves.toBe('denied');
    host.send({ type: 'ModuleResult', requestId: pending[0]!.requestId, ok: false, value: 'IO_ERROR: duplicate' });
    expect(calls(await host.settle())).toEqual([]);
  });

  it.each(['UNSUPPORTED', 'PERMISSION_DENIED', 'CANCELLED', 'TIMEOUT', 'INVALID_ARGUMENT', 'IO_ERROR'])('exposes %s and retains the platform message', async code => {
    const { host, services } = await setup();
    const result = services.location.getCurrentPosition();
    const rejection = expect(result).rejects.toMatchObject({ name: 'NativeServiceError', code, message: expect.stringContaining(`${code}: 平台拒绝`) });
    const [request] = calls(await host.settle());
    host.send({ type: 'ModuleResult', requestId: request!.requestId, ok: false, value: `${code}: 平台拒绝` });
    await host.settle(); await rejection;
  });
});

const subscriptions: [string, (services: Services, receive: (value: any) => void, error: (error: Error) => void) => () => void, unknown][] = [
  ['appState', (s, receive, error) => s.appState.subscribe(receive, error), 'active'],
  ['network', (s, receive, error) => s.network.subscribe(receive, error), { connected: true, type: 'wifi' }],
  ['window', (s, receive, error) => s.window.subscribe(receive, error), { width: 320, height: 480, scale: 2, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } }],
  ['appearance', (s, receive, error) => s.appearance.subscribe(receive, error), 'dark'],
  ['keyboard', (s, receive, error) => s.keyboard.subscribe(receive, error), { visible: true, height: 260 }],
  ['location', (s, receive, error) => s.location.watchPosition(receive, error), { latitude: 1, longitude: 2, accuracy: 3, timestamp: 4 }],
  ['linking', (s, receive, error) => s.linking.subscribe(receive, error), 'anseronui://相同链接'],
  ['transfers', (s, receive, error) => s.transfers.subscribe(receive, error), { taskId: '下载', transferred: 1, total: 2 }],
  ['bluetooth', (s, receive, error) => s.bluetooth.subscribe(receive, error), { deviceId: 'device', service: '180f', characteristic: '2a19', value: [0, 255] }],
];

describe.each(subscriptions)('%s subscription ownership', (module, subscribe, value) => {
  it('keeps two owners independent, cancels on unmount and discards late delivery', async () => {
    const first = await setup(), second = await setup();
    const a: unknown[] = [], b: unknown[] = [], errors: Error[] = [];
    const stopA = subscribe(first.services, value => a.push(value), error => errors.push(error));
    const stopB = subscribe(second.services, value => b.push(value), error => errors.push(error));
    const [requestA] = calls(await first.host.settle()), [requestB] = calls(await second.host.settle());
    expect(JSON.parse(requestA!.argument).module).toBe(module);
    first.remove();
    const removed = await first.host.settle();
    expect(removed).toContainEqual({ type: 'CancelRequest', requestId: requestA!.requestId });
    expect(calls(removed)).toContainEqual(expect.objectContaining({ module: 'events', method: 'close' }));
    first.host.send({ type: 'ModuleResult', requestId: requestA!.requestId, ok: true, value: JSON.stringify(value) });
    second.host.send({ type: 'ModuleResult', requestId: requestB!.requestId, ok: true, value: JSON.stringify(value) });
    await first.host.settle(); await second.host.settle();
    expect(a).toEqual([]); expect(b).toEqual([value]); expect(errors).toEqual([]);
    stopA(); stopA(); stopB(); stopB();
    const stopped = await second.host.settle();
    expect(calls(stopped).filter(call => call.method === 'close')).toHaveLength(1);
  });

  it('delivers a platform rejection once and stops requesting further events', async () => {
    const { host, services } = await setup();
    const values: unknown[] = [], errors: Error[] = [];
    const stop = subscribe(services, value => values.push(value), error => errors.push(error));
    const [request] = calls(await host.settle());
    host.send({ type: 'ModuleResult', requestId: request!.requestId, ok: false, value: 'PERMISSION_DENIED: revoked' });
    const outputs = await host.settle();
    expect(values).toEqual([]); expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(calls(outputs).filter(call => call.method === 'next')).toEqual([]);
    stop(); await host.settle();
  });
});
