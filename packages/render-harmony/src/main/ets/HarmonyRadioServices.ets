import { abilityAccessCtrl, common, bundleManager } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { ble, access, constant } from '@kit.ConnectivityKit';
import { tag, nfcController } from '@kit.ConnectivityKit';
import { util } from '@kit.ArkTS';

export interface RadioArgs {
  deviceId?: string; serviceUUIDs?: string[]; durationMs?: number;
  service?: string; characteristic?: string; value?: number[]; enabled?: boolean; text?: string;
}
interface Device { id: string; name: string; rssi: number; }
interface Characteristic { service: string; characteristic: string; readable: boolean; writable: boolean; notifiable: boolean; }
interface BluetoothValue { deviceId: string; service: string; characteristic: string; value: number[]; }
interface NdefRecord { type: string; text: string; }
interface NdefMessage { records: NdefRecord[]; }
class Connection {
  client: ble.GattClientDevice;
  services: ble.GattService[] = [];
  connected: boolean = false;
  state: (value: ble.BLEConnectionChangeState) => void = () => {};
  changed: (value: ble.BLECharacteristic) => void = () => {};
  constructor(client: ble.GattClientDevice) { this.client = client; }
}
export function bluetoothUUID(value: string | undefined): string {
  if (typeof value !== 'string') throw new Error('INVALID_ARGUMENT: UUID');
  let full = value.toLowerCase();
  if (/^[a-f0-9]{4}$/.test(full)) full = '0000' + full + '-0000-1000-8000-00805f9b34fb';
  else if (/^[a-f0-9]{8}$/.test(full)) full += '-0000-1000-8000-00805f9b34fb';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(full)) throw new Error('INVALID_ARGUMENT: UUID');
  return full;
}
export function decodeNdef(records: tag.NdefRecord[]): NdefMessage {
  if (records.length > 128) throw new Error('IO_ERROR: too many NDEF records');
  const prefixes = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.', 'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://', 'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:', 'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://', 'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:', 'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:'];
  const result: NdefRecord[] = [];
  for (const record of records) {
    const payload = record.payload;
    if (payload.length > 32768) throw new Error('IO_ERROR: NDEF payload limit');
    const type = new util.TextDecoder('utf-8').decodeWithStream(new Uint8Array(record.rtdType));
    if (record.tnf === tag.TnfType.TNF_WELL_KNOWN && type === 'T') {
      if (!payload.length || payload.length < 1 + (payload[0] & 63)) throw new Error('IO_ERROR: malformed NDEF text');
      const bytes = payload.slice(1 + (payload[0] & 63));
      const encoding = payload[0] & 128 ? (bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : 'utf-16be') : 'utf-8';
      result.push({ type: 'text', text: new util.TextDecoder(encoding).decodeWithStream(new Uint8Array(bytes)) });
    } else if (record.tnf === tag.TnfType.TNF_WELL_KNOWN && type === 'U') {
      if (!payload.length || payload[0] >= prefixes.length) throw new Error('IO_ERROR: malformed NDEF URI');
      result.push({ type: 'url', text: prefixes[payload[0]] + new util.TextDecoder('utf-8').decodeWithStream(new Uint8Array(payload.slice(1))) });
    } else if (record.tnf === tag.TnfType.TNF_ABSOLUTE_URI) result.push({ type: 'url', text: type });
    else result.push({ type, text: new util.Base64Helper().encodeToStringSync(new Uint8Array(payload)) });
  }
  return { records: result };
}

/** One operation per radio owner; disposal cancels waits and closes native resources. */
export class HarmonyRadioServices {
  private context: common.UIAbilityContext;
  private emit: (value: BluetoothValue) => void;
  private devices: Set<string> = new Set();
  private connections: Map<string, Connection> = new Map();
  private cancelBluetooth: (() => void) | null = null;
  private cancelNFC: (() => void) | null = null;
  private pendingDevice: string = '';
  private failBluetooth: ((error: Error) => void) | null = null;
  private closed: boolean = false;
  private static nfcOwner: HarmonyRadioServices | null = null;
  constructor(context: common.UIAbilityContext, emit: (value: BluetoothValue) => void) { this.context = context; this.emit = emit; }
  supports(module: string, method?: string): boolean {
    let methods: string[] = [];
    if (module === 'bluetooth' && canIUse('SystemCapability.Communication.Bluetooth.Core')) methods = ['scan','connect','disconnect','getServices','read','write','setNotify','subscribe'];
    if (module === 'nfc' && canIUse('SystemCapability.Communication.NFC.Tag')) {
      try { if (nfcController.isNfcAvailable()) methods = ['read','writeText']; } catch (_error) {}
    }
    return method === undefined ? methods.length > 0 : methods.includes(method);
  }
  async invoke(module: string, method: string, args: RadioArgs, setCancel: (cancel: () => void) => void): Promise<Object | null> {
    if (this.closed) throw new Error('CANCELLED');
    if (!this.supports(module, method)) throw new Error('UNSUPPORTED: ' + module + '.' + method);
    if (module === 'nfc') return await this.nfc(method, args, setCancel);
    if (this.cancelBluetooth) throw new Error('INVALID_ARGUMENT: Bluetooth operation busy');
    let cancelled = false, cancelAction: () => void = () => {}, rejectCancel: (error: Error) => void = () => {};
    const cancellation = new Promise<Object | null>((_resolve, reject) => { rejectCancel = reject; });
    const cancel = (): void => { if (cancelled) return; cancelled = true; try { cancelAction(); } finally { rejectCancel(new Error('CANCELLED')); } };
    this.cancelBluetooth = cancel; setCancel(cancel);
    this.failBluetooth = error => { cancelled = true; rejectCancel(error); };
    const check = (): void => { if (cancelled || this.closed) throw new Error('CANCELLED'); };
    const timeout = setTimeout(() => { if (!cancelled) { cancelled = true; try { cancelAction(); } finally { rejectCancel(new Error('TIMEOUT: Bluetooth')); } } }, 35000);
    try {
      const operation = async (): Promise<Object | null> => {
        const filters: ble.ScanFilter[] = [];
        const duration = args.durationMs ?? 5000;
        if (method === 'scan') {
          if (!Array.isArray(args.serviceUUIDs) || args.serviceUUIDs.length > 32 || !Number.isFinite(duration) || duration < 500 || duration > 30000) throw new Error('INVALID_ARGUMENT: scan');
          for (const service of args.serviceUUIDs) filters.push({ serviceUuid: bluetoothUUID(service) });
        }
        const manager = abilityAccessCtrl.createAtManager();
        let granted = await manager.checkAccessToken(this.context.applicationInfo.accessTokenId, 'ohos.permission.ACCESS_BLUETOOTH'); check();
        if (granted !== abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED && method === 'scan') {
          const permission = await manager.requestPermissionsFromUser(this.context, ['ohos.permission.ACCESS_BLUETOOTH']); check();
          granted = permission.authResults[0];
        }
        if (granted !== abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) throw new Error('PERMISSION_DENIED: Bluetooth');
        const state = access.getState();
        if (state !== access.BluetoothState.STATE_ON && state !== access.BluetoothState.STATE_BLE_ON) throw new Error('UNSUPPORTED: Bluetooth powered off');
        if (method === 'scan') {
          const scanner = ble.createBleScanner(), found: Map<string, Device> = new Map();
          let timer = -1, stopped = false;
          const listener = (report: ble.ScanReport): void => {
            if (cancelled || stopped) return;
            for (const item of report.scanResult) {
              if (found.size >= 512 && !found.has(item.deviceId)) continue;
              found.set(item.deviceId, { id: item.deviceId, name: item.deviceName ?? '', rssi: item.rssi });
            }
          };
          const stop = (): void => {
            if (stopped) return; stopped = true; clearTimeout(timer);
            scanner.off('BLEDeviceFind', listener); void scanner.stopScan().catch(() => {});
          };
          cancelAction = stop; scanner.on('BLEDeviceFind', listener);
          try {
            await scanner.startScan(filters.length ? filters : [{}], { dutyMode: ble.ScanDuty.SCAN_MODE_LOW_LATENCY });
            if (cancelled) { await scanner.stopScan().catch(() => {}); check(); }
            await new Promise<void>(resolve => { timer = setTimeout(resolve, duration); }); check();
            found.forEach((_device, id) => { if (this.devices.size < 512) this.devices.add(id); });
            return Array.from(found.values());
          } finally { stop(); }
        }
        const id = args.deviceId ?? '';
        this.pendingDevice = id;
        if (!id) throw new Error('INVALID_ARGUMENT: deviceId');
        if (method === 'connect') {
          if (!this.devices.has(id)) throw new Error('INVALID_ARGUMENT: deviceId (scan first)');
          if (this.connections.size >= 16 && !this.connections.has(id)) throw new Error('IO_ERROR: connection limit');
          this.disconnect(id);
          const item = new Connection(ble.createGattClientDevice(id)); this.connections.set(id, item);
          cancelAction = () => this.disconnect(id, item);
          item.changed = value => {
            if (this.closed || this.connections.get(id) !== item || !item.connected) return;
            this.emit({ deviceId: id, service: value.serviceUuid.toLowerCase(), characteristic: value.characteristicUuid.toLowerCase(), value: Array.from(new Uint8Array(value.characteristicValue)) });
          };
          item.client.on('BLECharacteristicChange', item.changed);
          try {
            await new Promise<void>((resolve, reject) => {
              item.state = value => {
                if (this.connections.get(id) !== item) return;
                if (value.state === constant.ProfileConnectionState.STATE_CONNECTED) { item.connected = true; resolve(); }
                else if (value.state === constant.ProfileConnectionState.STATE_DISCONNECTED) {
                  item.connected = false; this.disconnect(id, item);
                  const error = new Error('IO_ERROR: Bluetooth disconnected'); reject(error);
                  if (this.pendingDevice === id) this.failBluetooth?.(error);
                }
              };
              item.client.on('BLEConnectionStateChange', item.state); item.client.connect();
            }); check(); return null;
          } catch (error) { this.disconnect(id, item); throw new Error(String(error)); }
        }
        const item = this.connections.get(id);
        if (!item || !item.connected) throw new Error('INVALID_ARGUMENT: disconnected device');
        cancelAction = () => this.disconnect(id, item);
        if (method === 'disconnect') { this.disconnect(id); return null; }
        if (method === 'getServices') {
          const services = await item.client.getServices(); check(); item.services = services;
          const result: Characteristic[] = [];
          for (const service of services) for (const characteristic of service.characteristics) result.push({
            service: service.serviceUuid.toLowerCase(), characteristic: characteristic.characteristicUuid.toLowerCase(),
            readable: characteristic.properties?.read === true, writable: characteristic.properties?.write === true,
            notifiable: characteristic.properties?.notify === true || characteristic.properties?.indicate === true,
          });
          return result;
        }
        const service = bluetoothUUID(args.service), characteristic = bluetoothUUID(args.characteristic);
        const field = item.services.find(value => value.serviceUuid.toLowerCase() === service)?.characteristics.find(value => value.characteristicUuid.toLowerCase() === characteristic);
        if (!field) throw new Error('INVALID_ARGUMENT: characteristic (getServices first)');
        if (method === 'read') { const value = await item.client.readCharacteristicValue(field); check(); return Array.from(new Uint8Array(value.characteristicValue)); }
        if (method === 'write') {
          if (!Array.isArray(args.value) || args.value.length > 20 || args.value.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('INVALID_ARGUMENT: maximum 20 bytes (default ATT MTU)');
          if (!field.properties?.write) throw new Error('UNSUPPORTED: write with response');
          field.characteristicValue = new Uint8Array(args.value).buffer as ArrayBuffer;
          await item.client.writeCharacteristicValue(field, ble.GattWriteType.WRITE); check(); return null;
        }
        if (method === 'setNotify') {
          if (typeof args.enabled !== 'boolean') throw new Error('INVALID_ARGUMENT: enabled');
          if (field.properties?.notify) await item.client.setCharacteristicChangeNotification(field, args.enabled);
          else if (field.properties?.indicate) await item.client.setCharacteristicChangeIndication(field, args.enabled);
          else throw new Error('UNSUPPORTED: characteristic notifications');
          check(); return null;
        }
        throw new Error('UNSUPPORTED');
      };
      return await Promise.race([operation(), cancellation]);
    } finally { clearTimeout(timeout); if (this.cancelBluetooth === cancel) { this.cancelBluetooth = null; this.failBluetooth = null; this.pendingDevice = ''; } }
  }
  private disconnect(id: string, expected?: Connection): void {
    const item = this.connections.get(id); if (!item || (expected && expected !== item)) return;
    this.connections.delete(id); item.connected = false;
    try { item.client.off('BLEConnectionStateChange', item.state); item.client.off('BLECharacteristicChange', item.changed); } catch (_error) {}
    try { item.client.disconnect(); } catch (_error) {}
    try { item.client.close(); } catch (_error) {}
  }
  private nfc(method: string, args: RadioArgs, setCancel: (cancel: () => void) => void): Promise<Object | null> {
    if (HarmonyRadioServices.nfcOwner) throw new Error('INVALID_ARGUMENT: NFC busy');
    if (!nfcController.isNfcOpen()) throw new Error('UNSUPPORTED: enable NFC in settings');
    if (method === 'writeText' && (typeof args.text !== 'string' || new util.TextEncoder().encodeInto(args.text).length > 32768)) throw new Error('INVALID_ARGUMENT: NFC text');
    const element: bundleManager.ElementName = { bundleName: this.context.abilityInfo.bundleName, abilityName: this.context.abilityInfo.name };
    return new Promise<Object | null>((resolve, reject) => {
      let finished = false, reading = false, session: tag.NdefTag | null = null, timer = -1;
      const finish = (error: Error | null, result: Object | null): void => {
        if (finished) return; finished = true; clearTimeout(timer);
        if (HarmonyRadioServices.nfcOwner === this) HarmonyRadioServices.nfcOwner = null;
        this.cancelNFC = null;
        try { tag.off('readerMode', element, listener); } catch (_error) {}
        try { session?.resetConnection(); } catch (_error) {}
        if (error) reject(error); else resolve(result);
      };
      const listener = (error: BusinessError, info: tag.TagInfo): void => {
        if (finished || reading) return;
        if (error) { finish(new Error(String(error)), null); return; }
        reading = true;
        const read = async (): Promise<Object | null> => {
          if (!info.technology.includes(tag.NDEF)) throw new Error('UNSUPPORTED: NDEF tag');
          session = tag.getNdef(info); session.connect(); session.setTimeout(5000);
          if (method === 'writeText') {
            if (!session.isNdefWritable()) throw new Error('PERMISSION_DENIED: read-only tag');
            await session.writeNdef(tag.ndef.createNdefMessage([tag.ndef.makeTextRecord(args.text!, 'en')])); return null;
          }
          return decodeNdef((await session.readNdef()).getNdefRecords());
        };
        void read().then(value => finish(null, value)).catch((failure: Error) => finish(new Error(String(failure)), null));
      };
      HarmonyRadioServices.nfcOwner = this;
      this.cancelNFC = () => finish(new Error('CANCELLED'), null); setCancel(this.cancelNFC);
      timer = setTimeout(() => finish(new Error('TIMEOUT: NFC'), null), 30000);
      try { tag.on('readerMode', element, [tag.NFC_A, tag.NFC_B, tag.NFC_F, tag.NFC_V], listener); }
      catch (error) { finish(new Error(String(error)), null); }
    });
  }
  setActive(active: boolean): void { if (!active) this.cancelNFC?.(); }
  dispose(): void {
    this.closed = true; this.cancelBluetooth?.(); this.cancelNFC?.();
    for (const id of Array.from(this.connections.keys())) this.disconnect(id);
    this.devices.clear();
  }
}
