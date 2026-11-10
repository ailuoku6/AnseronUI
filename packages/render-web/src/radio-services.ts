/** Browser BLE and NFC are optional secure-context APIs. Browser chooser replaces an unrestricted BLE scan. */
export class BrowserRadioServices {
  private devices = new Map<string, any>();
  private listeners = new Map<any, EventListener>();
  private controllers = new Set<AbortController>();
  private disposed = false;
  constructor(private win: Window, private emit: (value: unknown) => void) {}
  private get nav(): any { return this.win.navigator; }
  methods(module: string): string[] {
    if (module === 'bluetooth' && this.nav.bluetooth) return ['scan', 'connect', 'disconnect', 'getServices', 'read', 'write', 'setNotify', 'subscribe'];
    if (module === 'nfc' && (this.win as any).NDEFReader) return ['read', 'writeText'];
    return [];
  }
  async call(module: string, method: string, args: any, signal: AbortSignal): Promise<unknown> {
    if (module === 'nfc') return this.nfc(method, args, signal);
    const uuid = (value: unknown): string => {
      const text = String(value); if (/^[0-9a-f]{4}$/i.test(text)) return '0000' + text.toLowerCase() + '-0000-1000-8000-00805f9b34fb';
      if (/^[0-9a-f]{8}$/i.test(text)) return text.toLowerCase() + '-0000-1000-8000-00805f9b34fb';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text.toLowerCase();
      throw new Error('INVALID_ARGUMENT: UUID');
    };
    try {
      if (method === 'scan') {
        if (!Array.isArray(args.serviceUUIDs)) throw new Error('INVALID_ARGUMENT: serviceUUIDs');
        const services = args.serviceUUIDs.map(uuid);
        const device = await this.nav.bluetooth.requestDevice(services.length ? { filters: services.map((service: string) => ({ services: [service] })), optionalServices: services } : { acceptAllDevices: true });
        if (this.disposed || signal.aborted) throw new Error('CANCELLED'); this.devices.set(device.id, device);
        return [{ id: device.id, name: device.name ?? '', rssi: 0 }];
      }
      const device = this.devices.get(args.deviceId); if (!device) throw new Error('INVALID_ARGUMENT: deviceId (choose first)');
      if (method === 'disconnect') { this.removeListeners(device); device.gatt.disconnect(); return null; }
      if (method === 'connect') { await device.gatt.connect(); if (this.disposed || signal.aborted) { device.gatt.disconnect(); throw new Error('CANCELLED'); } return null; }
      if (!device.gatt.connected) throw new Error('IO_ERROR: disconnected');
      if (method === 'getServices') {
        const output = []; for (const service of await device.gatt.getPrimaryServices()) for (const item of await service.getCharacteristics()) output.push({ service: service.uuid, characteristic: item.uuid, readable: item.properties.read, writable: item.properties.write, notifiable: item.properties.notify || item.properties.indicate }); return output;
      }
      const service = await device.gatt.getPrimaryService(uuid(args.service)); const item = await service.getCharacteristic(uuid(args.characteristic));
      if (method === 'read') { const data = await item.readValue(); return Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)); }
      if (method === 'write') { if (!Array.isArray(args.value) || !args.value.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255)) throw new Error('INVALID_ARGUMENT: bytes'); await item.writeValueWithResponse(new Uint8Array(args.value)); return null; }
      if (method === 'setNotify') {
        if (typeof args.enabled !== 'boolean') throw new Error('INVALID_ARGUMENT: enabled');
        if (args.enabled) {
          if (!this.listeners.has(item)) { const changed = () => { const data = item.value as DataView; this.emit({ deviceId: device.id, service: service.uuid, characteristic: item.uuid, value: Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) }); }; item.addEventListener('characteristicvaluechanged', changed); this.listeners.set(item, changed); }
          await item.startNotifications();
        } else { await item.stopNotifications(); const listener = this.listeners.get(item); if (listener) item.removeEventListener('characteristicvaluechanged', listener); this.listeners.delete(item); }
        return null;
      }
      throw new Error('UNSUPPORTED');
    } catch (error) { this.mapError(error); }
  }
  private mapError(error: unknown): never {
    const value = error as Error;
    if (value.name === 'NotAllowedError' || value.name === 'SecurityError') throw new Error('PERMISSION_DENIED: ' + value.message);
    if (value.name === 'NotFoundError' || value.name === 'AbortError') throw new Error('CANCELLED: ' + value.message);
    throw error;
  }
  private async nfc(method: string, args: any, signal: AbortSignal): Promise<unknown> {
    const reader = new (this.win as any).NDEFReader(); const controller = new AbortController(); this.controllers.add(controller);
    const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    const timeout = this.win.setTimeout(() => controller.abort('TIMEOUT'), 30000);
    try {
      if (method === 'writeText') { if (typeof args.text !== 'string') throw new Error('INVALID_ARGUMENT: text'); await reader.write({ records: [{ recordType: 'text', data: args.text }] }, { signal: controller.signal }); return null; }
      return await new Promise((resolve, reject) => {
        const done = (value: unknown, error?: Error) => { reader.onreading = null; reader.onreadingerror = null; controller.signal.removeEventListener('abort', cancelled); controller.abort(); if (error) reject(error); else resolve(value); };
        const cancelled = () => done(null, new Error(controller.signal.reason === 'TIMEOUT' ? 'TIMEOUT' : 'CANCELLED'));
        controller.signal.addEventListener('abort', cancelled, { once: true });
        reader.onreading = (event: any) => { try { done({ records: Array.from(event.message.records as any[]).map((record: any) => ({ type: record.recordType, text: ['text', 'url'].includes(record.recordType) ? new TextDecoder(record.encoding ?? 'utf-8').decode(record.data) : btoa(String.fromCharCode(...new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength))) })) }); } catch (error) { done(null, error as Error); } };
        reader.onreadingerror = () => done(null, new Error('IO_ERROR: NFC read'));
        reader.scan({ signal: controller.signal }).catch((error: Error) => done(null, error));
      });
    } catch (error) { this.mapError(error); }
    finally { this.win.clearTimeout(timeout); signal.removeEventListener('abort', abort); controller.abort(); this.controllers.delete(controller); }
  }
  private removeListeners(device?: any) { for (const [item, listener] of this.listeners) if (!device || item.service.device === device) { item.removeEventListener('characteristicvaluechanged', listener); this.listeners.delete(item); } }
  dispose() { this.disposed = true; for (const controller of this.controllers) controller.abort(); this.removeListeners(); for (const device of this.devices.values()) device.gatt?.disconnect(); this.devices.clear(); }
}
