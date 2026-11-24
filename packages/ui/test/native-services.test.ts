import { describe, expect, it, vi } from 'vitest';
import { createNativeServices, NativeServiceError } from '../src/native-services.js';
import type { InvokeNative, NativeServices } from '../src/native-services.js';

const file = { id: 'file', name: 'file.txt', size: 1, mimeType: 'text/plain' };
const notification = { id: 'n', title: 'title', body: 'body', delaySeconds: 2 };
const background = { identifier: 'refresh', delaySeconds: 1, requiresNetwork: true };
type Contract = { path: string; input?: unknown[]; args?: unknown };
// Independently specified public calls and bridge arguments. The coverage audit
// compares these paths against the TypeScript interface, including inherited
// storage methods. New public methods require a new executable case.
export const contracts: Contract[] = [
  { path: 'notifications.register' },
  { path: 'notifications.schedule', input: [notification], args: notification },
  { path: 'notifications.cancel', input: ['n'], args: { id: 'n' } },
  { path: 'notifications.getEvents' },
  { path: 'notifications.acknowledge', input: [['n']], args: { ids: ['n'] } },
  { path: 'background.schedule', input: [background], args: background },
  { path: 'background.pending' },
  { path: 'background.cancel', input: ['refresh'], args: { identifier: 'refresh' } },
  { path: 'background.getEvents' },
  { path: 'background.acknowledge', input: [['refresh']], args: { ids: ['refresh'] } },
  { path: 'bluetooth.scan', input: [['180f'], 1000], args: { serviceUUIDs: ['180f'], durationMs: 1000 } },
  { path: 'bluetooth.connect', input: ['device'], args: { deviceId: 'device' } },
  { path: 'bluetooth.disconnect', input: ['device'], args: { deviceId: 'device' } },
  { path: 'bluetooth.getServices', input: ['device'], args: { deviceId: 'device' } },
  { path: 'bluetooth.read', input: ['device', '180f', '2a19'], args: { deviceId: 'device', service: '180f', characteristic: '2a19' } },
  { path: 'bluetooth.write', input: ['device', '180f', '2a19', [0, 255]], args: { deviceId: 'device', service: '180f', characteristic: '2a19', value: [0, 255] } },
  { path: 'bluetooth.setNotify', input: ['device', '180f', '2a19', true], args: { deviceId: 'device', service: '180f', characteristic: '2a19', enabled: true } },
  { path: 'nfc.read' },
  { path: 'nfc.writeText', input: ['tag'], args: { text: 'tag' } },
  { path: 'capabilities.has', input: ['storage', 'get'], args: { module: 'storage', method: 'get' } },
  { path: 'storage.get', input: ['key', 'space'], args: { key: 'key', namespace: 'space' } },
  { path: 'storage.set', input: ['key', '值 🪿', 'space'], args: { key: 'key', value: '值 🪿', namespace: 'space' } },
  { path: 'storage.remove', input: ['key', 'space'], args: { key: 'key', namespace: 'space' } },
  { path: 'storage.keys', input: ['space'], args: { namespace: 'space' } },
  { path: 'storage.clear', input: ['space'], args: { namespace: 'space' } },
  { path: 'secureStorage.get', input: ['key', 'space'], args: { key: 'key', namespace: 'space' } },
  { path: 'secureStorage.set', input: ['key', 'value', 'space'], args: { key: 'key', value: 'value', namespace: 'space' } },
  { path: 'secureStorage.remove', input: ['key', 'space'], args: { key: 'key', namespace: 'space' } },
  { path: 'secureStorage.keys', input: ['space'], args: { namespace: 'space' } },
  { path: 'secureStorage.clear', input: ['space'], args: { namespace: 'space' } },
  { path: 'app.getInfo' }, { path: 'device.getInfo' }, { path: 'locale.getInfo' },
  { path: 'clipboard.readText' },
  { path: 'clipboard.writeText', input: ['clipboard'], args: { text: 'clipboard' } },
  { path: 'dialogs.alert', input: ['title', 'message'], args: { title: 'title', message: 'message' } },
  { path: 'dialogs.confirm', input: ['title', 'message'], args: { title: 'title', message: 'message' } },
  { path: 'dialogs.actionSheet', input: ['title', ['one', 'two']], args: { title: 'title', options: ['one', 'two'] } },
  { path: 'linking.openURL', input: ['https://example.test'], args: { url: 'https://example.test' } },
  { path: 'linking.canOpenURL', input: ['https://example.test'], args: { url: 'https://example.test' } },
  { path: 'linking.openSettings' }, { path: 'linking.getInitialURL' },
  { path: 'share.text', input: ['text'], args: { text: 'text' } },
  { path: 'share.file', input: [file], args: { file } },
  { path: 'haptics.impact', input: ['light'], args: { style: 'light' } },
  { path: 'haptics.notification', input: ['warning'], args: { type: 'warning' } },
  { path: 'haptics.selection' }, { path: 'appState.get' }, { path: 'network.getStatus' },
  { path: 'window.getMetrics' }, { path: 'appearance.get' }, { path: 'keyboard.dismiss' },
  { path: 'permissions.check', input: ['camera'], args: { permission: 'camera' } },
  { path: 'permissions.request', input: ['camera'], args: { permission: 'camera' } },
  { path: 'location.getCurrentPosition' }, { path: 'media.pickPhoto' }, { path: 'files.pickDocument' },
  { path: 'files.release', input: [file], args: { file } },
  { path: 'transfers.download', input: ['download', 'https://example.test/file', { Accept: 'text/plain' }], args: { taskId: 'download', url: 'https://example.test/file', headers: { Accept: 'text/plain' } } },
  { path: 'transfers.upload', input: ['upload', 'https://example.test/file', file, { Authorization: 'example' }], args: { taskId: 'upload', url: 'https://example.test/file', file, headers: { Authorization: 'example' } } },
  { path: 'transfers.cancel', input: ['download'], args: { taskId: 'download' } },
];

export const subscriptionContracts = [
  { path: 'bluetooth.subscribe', module: 'bluetooth' },
  { path: 'linking.subscribe', module: 'linking' },
  { path: 'appState.subscribe', module: 'appState' },
  { path: 'network.subscribe', module: 'network' },
  { path: 'window.subscribe', module: 'window' },
  { path: 'appearance.subscribe', module: 'appearance' },
  { path: 'keyboard.subscribe', module: 'keyboard' },
  { path: 'location.watchPosition', module: 'location' },
  { path: 'transfers.subscribe', module: 'transfers' },
];

function call(services: NativeServices, path: string, args: unknown[] = []): any {
  const [module, method] = path.split('.');
  return (services as any)[module][method](...args);
}

describe.each(contracts)('$path facade', contract => {
  it('passes exact arguments and returns the host result unchanged', async () => {
    const value = { result: ['值', null, false, 0] };
    const invoke = vi.fn(async (_module: string, _method: string, _args?: unknown) => value);
    const services = createNativeServices(invoke as InvokeNative, () => () => {});
    await expect(call(services, contract.path, contract.input)).resolves.toBe(value);
    const [module, method] = contract.path.split('.');
    expect(invoke.mock.calls.map(([module, method, args]) => [module, method, args])).toEqual([[module, method, contract.args]]);
  });
  it('preserves the original host rejection', async () => {
    const error = new NativeServiceError('PERMISSION_DENIED: revoked');
    const services = createNativeServices(async () => { throw error; }, () => () => {});
    await expect(call(services, contract.path, contract.input)).rejects.toBe(error);
  });
});

describe.each(subscriptionContracts)('$path subscription facade', ({ path, module }) => {
  it('forwards both callbacks and returns the host unsubscribe function', () => {
    const receive = vi.fn(), error = vi.fn(), stop = vi.fn();
    const subscribe = vi.fn((_module: string, _receive: unknown, _error?: unknown) => stop);
    const services = createNativeServices(async () => null as any, subscribe);
    const unsubscribe = call(services, path, [receive, error]);
    expect(subscribe.mock.calls).toEqual([[module, receive, error]]);
    expect(unsubscribe).toBe(stop);
    unsubscribe(); expect(stop).toHaveBeenCalledOnce();
  });
});

it('covers exactly the runtime facade methods, including all storage methods', () => {
  const services = createNativeServices(async () => null as any, () => () => {});
  const actual = Object.entries(services).flatMap(([module, methods]) => Object.keys(methods).map(method => `${module}.${method}`));
  const expected = [...contracts, ...subscriptionContracts].map(contract => contract.path);
  expect(new Set(expected).size).toBe(expected.length);
  expect(actual.sort()).toEqual(expected.sort());
});

it('preserves every omitted optional default', async () => {
  const invoke = vi.fn(async (_module: string, _method: string, _args?: unknown) => null);
  const services = createNativeServices(invoke as InvokeNative, () => () => {});
  await services.bluetooth.scan([]); await services.capabilities.has('storage');
  await services.dialogs.alert('title'); await services.dialogs.confirm('title');
  await services.haptics.impact(); await services.haptics.notification();
  for (const store of [services.storage, services.secureStorage]) {
    await store.get('k'); await store.set('k', 'v'); await store.remove('k'); await store.keys(); await store.clear();
  }
  await services.transfers.download('d', 'https://example.test/file');
  await services.transfers.upload('u', 'https://example.test/file', file);
  expect(invoke.mock.calls).toEqual([
    ['bluetooth', 'scan', { serviceUUIDs: [], durationMs: 5000 }],
    ['capabilities', 'has', { module: 'storage', method: undefined }],
    ['dialogs', 'alert', { title: 'title', message: '' }], ['dialogs', 'confirm', { title: 'title', message: '' }],
    ['haptics', 'impact', { style: 'medium' }], ['haptics', 'notification', { type: 'success' }],
    ...['storage', 'secureStorage'].flatMap(module => [
      [module, 'get', { key: 'k', namespace: 'default' }], [module, 'set', { key: 'k', value: 'v', namespace: 'default' }],
      [module, 'remove', { key: 'k', namespace: 'default' }], [module, 'keys', { namespace: 'default' }], [module, 'clear', { namespace: 'default' }],
    ]),
    ['transfers', 'download', { taskId: 'd', url: 'https://example.test/file', headers: {} }],
    ['transfers', 'upload', { taskId: 'u', url: 'https://example.test/file', file, headers: {} }],
  ]);
});

it.each(['UNSUPPORTED', 'PERMISSION_DENIED', 'CANCELLED', 'TIMEOUT', 'INVALID_ARGUMENT', 'IO_ERROR'])('parses %s native errors', code => {
  expect(new NativeServiceError(`${code}: message`)).toMatchObject({ name: 'NativeServiceError', code, message: `${code}: message` });
});
it('classifies unknown native errors as IO_ERROR', () => {
  expect(new NativeServiceError('unexpected')).toMatchObject({ name: 'NativeServiceError', code: 'IO_ERROR' });
});
