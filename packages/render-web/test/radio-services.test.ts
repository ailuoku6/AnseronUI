import { describe, expect, it, vi } from 'vitest';
import { BrowserNativeServices } from '../src/native-services.js';
import { BrowserRadioServices } from '../src/radio-services.js';

describe('browser BLE lifecycle', () => {
  function setup() {
    const characteristic = Object.assign(new EventTarget(), {
      uuid: '00002a19-0000-1000-8000-00805f9b34fb', properties: { read: true, write: true, notify: true },
      value: new DataView(new Uint8Array([42]).buffer), readValue: vi.fn(async () => characteristic.value),
      writeValueWithResponse: vi.fn(async (_bytes: Uint8Array) => {}), startNotifications: vi.fn(async () => {}), stopNotifications: vi.fn(async () => {}), service: undefined as any,
    });
    const service = { uuid: '0000180f-0000-1000-8000-00805f9b34fb', device: undefined as any, getCharacteristics: async () => [characteristic], getCharacteristic: async () => characteristic };
    const gatt = { connected: true, connect: vi.fn(async () => {}), disconnect: vi.fn(), getPrimaryServices: async () => [service], getPrimaryService: async () => service };
    const device = { id: 'opaque-device', name: 'Battery', gatt }; service.device = device; characteristic.service = service;
    const requestDevice = vi.fn(async (_options: unknown) => device);
    const received: unknown[] = [];
    const radio = new BrowserRadioServices({ navigator: { bluetooth: { requestDevice } } } as unknown as Window, value => received.push(value));
    const signal = new AbortController().signal;
    const args = { deviceId: device.id, service: '180f', characteristic: '2a19' };
    return { radio, received, device, characteristic, requestDevice, signal, args };
  }
  it('scopes chooser services, reads/writes bytes and releases duplicate notification listeners', async () => {
    const state = setup(); const { radio, signal, args } = state;
    expect(await radio.call('bluetooth', 'scan', { serviceUUIDs: ['180f'] }, signal)).toEqual([{ id: 'opaque-device', name: 'Battery', rssi: 0 }]);
    expect(state.requestDevice.mock.calls[0]![0]).toEqual({ filters: [{ services: ['0000180f-0000-1000-8000-00805f9b34fb'] }], optionalServices: ['0000180f-0000-1000-8000-00805f9b34fb'] });
    await radio.call('bluetooth', 'connect', args, signal);
    expect(await radio.call('bluetooth', 'read', args, signal)).toEqual([42]);
    await expect(radio.call('bluetooth', 'write', { ...args, value: [256] }, signal)).rejects.toThrow('INVALID_ARGUMENT');
    await radio.call('bluetooth', 'write', { ...args, value: [1, 2] }, signal);
    expect(state.characteristic.writeValueWithResponse).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    await radio.call('bluetooth', 'setNotify', { ...args, enabled: true }, signal);
    await radio.call('bluetooth', 'setNotify', { ...args, enabled: true }, signal);
    state.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    state.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    expect(state.received).toHaveLength(2); // Equal bytes remain distinct notifications.
    radio.dispose(); state.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    expect(state.received).toHaveLength(2); expect(state.device.gatt.disconnect).toHaveBeenCalledOnce();
  });
  it('preserves duplicate BLE events and fails explicitly on queue overflow', async () => {
    const root = { ownerDocument: { defaultView: { navigator: { bluetooth: {} } } } } as unknown as HTMLElement;
    const native = new BrowserNativeServices(root);
    const signal = new AbortController().signal;
    const emit = (native as unknown as { emit(module: string, value: unknown): void }).emit.bind(native);
    const first = native.call('events', 'next', { id: 'ble', module: 'bluetooth' }, signal);
    emit('bluetooth', { value: [1] }); expect(await first).toEqual({ value: [1] });
    emit('bluetooth', { value: [1] }); emit('bluetooth', { value: [1] });
    expect(await native.call('events', 'next', { id: 'ble', module: 'bluetooth' }, signal)).toEqual({ value: [1] });
    expect(await native.call('events', 'next', { id: 'ble', module: 'bluetooth' }, signal)).toEqual({ value: [1] });
    for (let index = 0; index < 65; index++) emit('bluetooth', index);
    await expect(native.call('events', 'next', { id: 'ble', module: 'bluetooth' }, signal)).rejects.toThrow('queue overflow');
    native.dispose();
  });
  it('rejects a chooser result that arrives after page disposal', async () => {
    const state = setup(); let resolve!: (value: typeof state.device) => void;
    state.requestDevice.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = state.radio.call('bluetooth', 'scan', { serviceUUIDs: [] }, state.signal);
    state.radio.dispose(); resolve(state.device);
    await expect(pending).rejects.toThrow('CANCELLED');
    await expect(state.radio.call('bluetooth', 'connect', state.args, state.signal)).rejects.toThrow('INVALID_ARGUMENT');
  });
});
