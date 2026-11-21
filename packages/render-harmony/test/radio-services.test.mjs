import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let scanListener, nfcListener, scansStopped = 0, nfcStopped = 0, writes = 0;
  const clients = [], events = [];
  const serviceUuid = '0000180f-0000-1000-8000-00805f9b34fb', characteristicUuid = '00002a19-0000-1000-8000-00805f9b34fb';
  const characteristic = { serviceUuid, characteristicUuid, characteristicValue: new Uint8Array([42]).buffer, descriptors: [], properties: { read: true, write: true, notify: true } };
  const permission = { checkAccessToken: async () => 0, requestPermissionsFromUser: async () => ({ authResults: [0] }) };
  const scanner = { on(_type, cb) { scanListener = cb; }, off() { scanListener = null; }, async startScan() {}, async stopScan() { scansStopped++; } };
  const tag = {
    NDEF: 6, NFC_A: 1, NFC_B: 2, NFC_F: 4, NFC_V: 5, TnfType: { TNF_WELL_KNOWN: 1, TNF_ABSOLUTE_URI: 3 },
    on(_type, _element, _tech, cb) { nfcListener = cb; }, off() { nfcStopped++; nfcListener = null; },
    getNdef() { return { connect() {}, setTimeout() {}, resetConnection() {}, isNdefWritable: () => true, readNdef: async () => ({ getNdefRecords: () => [{ tnf: 1, rtdType: [84], payload: [2,101,110,...new TextEncoder().encode('鸿蒙')] }] }), writeNdef: async () => { writes++; } }; },
    ndef: { makeTextRecord: (text, lang) => ({ text, lang }), createNdefMessage: value => value },
  };
  const mocks = {
    '@kit.AbilityKit': { abilityAccessCtrl: { createAtManager: () => permission, GrantStatus: { PERMISSION_GRANTED: 0 } } },
    '@kit.ConnectivityKit': {
      access: { getState: () => 2, BluetoothState: { STATE_ON: 2, STATE_BLE_ON: 5 } },
      constant: { ProfileConnectionState: { STATE_CONNECTED: 2, STATE_DISCONNECTED: 0 } },
      ble: {
        createBleScanner: () => scanner, ScanDuty: { SCAN_MODE_LOW_LATENCY: 2 }, GattWriteType: { WRITE: 1 },
        createGattClientDevice: id => {
          const handlers = new Map();
          const client = {
            closed: false, handlers, on: (event, fn) => handlers.set(event, fn), off: event => handlers.delete(event),
            connect() { handlers.get('BLEConnectionStateChange')({ deviceId: id, state: 2 }); }, disconnect() {}, close() { this.closed = true; },
            getServices: async () => [{ serviceUuid, characteristics: [characteristic] }],
            readCharacteristicValue: async () => characteristic,
            writeCharacteristicValue: async value => { writes++; assert.equal(value.characteristicValue.byteLength, 2); },
            setCharacteristicChangeNotification: async () => {},
          }; clients.push(client); return client;
        },
      }, tag, nfcController: { isNfcAvailable: () => true, isNfcOpen: () => true },
    },
    '@kit.ArkTS': { util: {
      TextDecoder: class { constructor(encoding) { this.decoder = new TextDecoder(encoding); } decodeWithStream(bytes) { return this.decoder.decode(bytes); } },
      TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text); } },
      Base64Helper: class { encodeToStringSync(bytes) { return Buffer.from(bytes).toString('base64'); } },
    } },
  };
  const classes = loadETS('HarmonyRadioServices', mocks, { canIUse: () => true });
  const context = { abilityInfo: { bundleName: 'org.example', name: 'EntryAbility' }, applicationInfo: { accessTokenId: 1 } };
  const service = new classes.HarmonyRadioServices(context, event => events.push(event));
  return { ...classes, service, context, events, clients, permission, scanner, tag, characteristic, report: () => scanListener({ scanResult: [{ deviceId: 'd1', deviceName: 'Battery', rssi: -30 }] }), detect: () => nfcListener(null, { technology: [6] }), get scansStopped() { return scansStopped; }, get nfcStopped() { return nfcStopped; }, get writes() { return writes; } };
}
const invoke = (f, module, method, args = {}) => f.service.invoke(module, method, args, () => {});
test('disposing an unused page does not stop NFC or BLE', () => {
  const f = fixture();
  f.service.dispose(); f.service.dispose();
  assert.equal(f.nfcStopped, 0); assert.equal(f.scansStopped, 0);
});
test('page disposal tolerates BLE listener removal throwing and still stops scanning', async () => {
  const f = fixture();
  f.scanner.off = () => { throw new Error('PERMISSION_DENIED'); };
  const result = invoke(f, 'bluetooth', 'scan', { serviceUUIDs: [], durationMs: 500 });
  const rejected = assert.rejects(result, /CANCELLED/);
  await drain();
  assert.doesNotThrow(() => f.service.dispose());
  await rejected;
  assert.equal(f.scansStopped, 1);
});
async function scan(f, t) {
  const result = invoke(f, 'bluetooth', 'scan', { serviceUUIDs: ['180f'], durationMs: 500 });
  await drain(); f.report(); t.mock.timers.tick(500); return result;
}
test('BLE scan, GATT read/write/notify and disposal follow the shared contract', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture();
  assert.deepEqual(await scan(f, t), [{ id: 'd1', name: 'Battery', rssi: -30 }]); assert.equal(f.scansStopped, 1);
  await invoke(f, 'bluetooth', 'connect', { deviceId: 'd1' });
  const fields = await invoke(f, 'bluetooth', 'getServices', { deviceId: 'd1' }); assert.equal(fields[0].readable, true);
  const args = { deviceId: 'd1', service: '180f', characteristic: '2a19' };
  assert.deepEqual(await invoke(f, 'bluetooth', 'read', args), [42]);
  await invoke(f, 'bluetooth', 'write', { ...args, value: [1, 255] });
  await assert.rejects(invoke(f, 'bluetooth', 'write', { ...args, value: [256] }), /INVALID_ARGUMENT/);
  await invoke(f, 'bluetooth', 'setNotify', { ...args, enabled: true });
  const callback = f.clients[0].handlers.get('BLECharacteristicChange'); callback(f.characteristic);
  assert.deepEqual(f.events[0].value, [1, 255]);
  f.service.dispose(); callback(f.characteristic); assert.equal(f.events.length, 1); assert.equal(f.clients[0].closed, true);
});
test('cancelled permission requests never start a later BLE scan', async () => {
  const f = fixture(); let authorize, cancel;
  f.permission.checkAccessToken = () => new Promise(resolve => { authorize = resolve; });
  const result = f.service.invoke('bluetooth', 'scan', { serviceUUIDs: [], durationMs: 500 }, action => { cancel = action; });
  cancel(); authorize(0); await assert.rejects(result, /CANCELLED/); await drain(); assert.equal(f.scansStopped, 0);
});
test('cancel after scanner setup stops scanning and concurrent operations are rejected', async () => {
  const f = fixture(); let cancel;
  const result = f.service.invoke('bluetooth', 'scan', { serviceUUIDs: [], durationMs: 500 }, action => { cancel = action; });
  await drain();
  await assert.rejects(invoke(f, 'bluetooth', 'scan', { serviceUUIDs: [], durationMs: 500 }), /busy/);
  cancel(); await assert.rejects(result, /CANCELLED/); assert.equal(f.scansStopped, 1);
});
test('unsolicited disconnect fails an outstanding GATT request promptly', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture(); await scan(f, t);
  await invoke(f, 'bluetooth', 'connect', { deviceId: 'd1' });
  f.clients[0].getServices = () => new Promise(() => {});
  const request = invoke(f, 'bluetooth', 'getServices', { deviceId: 'd1' }); await drain();
  f.clients[0].handlers.get('BLEConnectionStateChange')({ state: 0 });
  await assert.rejects(request, /disconnected/); assert.equal(f.clients[0].closed, true);
});
test('NFC reads text, writes once, releases reader ownership and cancels on background', async () => {
  const f = fixture();
  let result = invoke(f, 'nfc', 'read'); f.detect(); assert.deepEqual(await result, { records: [{ type: 'text', text: '鸿蒙' }] });
  result = invoke(f, 'nfc', 'writeText', { text: 'hello' }); f.detect(); await result; assert.equal(f.writes, 1);
  result = invoke(f, 'nfc', 'read'); f.service.setActive(false); await assert.rejects(result, /CANCELLED/);
  assert.equal(f.nfcStopped, 3);
});
test('NFC has one reader owner across retained pages and a bounded timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const f = fixture();
  const other = new f.HarmonyRadioServices(f.context, () => {});
  const result = invoke(f, 'nfc', 'read');
  await assert.rejects(other.invoke('nfc', 'read', {}, () => {}), /busy/);
  t.mock.timers.tick(30000); await assert.rejects(result, /TIMEOUT/); assert.equal(f.nfcStopped, 1);
});
test('UUID and NDEF decoding validate malformed data without corrupting payloads', () => {
  const f = fixture(); assert.equal(f.bluetoothUUID('180F'), '0000180f-0000-1000-8000-00805f9b34fb');
  assert.throws(() => f.bluetoothUUID('bad-uuid'), /INVALID_ARGUMENT/);
  const record = { tnf: 1, rtdType: [85], payload: [4, ...new TextEncoder().encode('example.com')] };
  assert.deepEqual(f.decodeNdef([record]), { records: [{ type: 'url', text: 'https://example.com' }] });
  assert.throws(() => f.decodeNdef([{ tnf: 1, rtdType: [84], payload: [8, 0] }]), /malformed/);
});
