/** Portable system services. Values crossing the host boundary are JSON only. */
export type Unsubscribe = () => void;
export type NativeErrorCode = 'UNSUPPORTED' | 'PERMISSION_DENIED' | 'CANCELLED' | 'TIMEOUT' | 'INVALID_ARGUMENT' | 'IO_ERROR';
export class NativeServiceError extends Error {
  readonly code: NativeErrorCode;
  constructor(message: string) {
    super(message); this.name = 'NativeServiceError';
    const codes: NativeErrorCode[] = ['UNSUPPORTED', 'PERMISSION_DENIED', 'CANCELLED', 'TIMEOUT', 'INVALID_ARGUMENT', 'IO_ERROR'];
    this.code = codes.find(code => message.includes(code)) ?? 'IO_ERROR';
  }
}
export interface HttpRequest { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number }
export interface HttpResponse { status: number; headers: Record<string, string>; body: string }
export interface FileReference { id: string; name: string; size: number; mimeType: string }
export interface Position { latitude: number; longitude: number; accuracy: number; timestamp: number }
export interface NetworkStatus { connected: boolean; type: string }
export interface WindowMetrics { width: number; height: number; scale: number; safeArea: { top: number; right: number; bottom: number; left: number } }
export interface KeyboardState { visible: boolean; height: number }
export type PermissionName = 'location' | 'camera' | 'photos' | 'microphone' | 'notifications';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'restricted' | 'limited' | 'unsupported';
export interface TransferProgress { taskId: string; transferred: number; total: number }
export interface NotificationEvent { id: string; kind: 'received' | 'opened' | 'token'; payload: Record<string, unknown>; timestamp: number }
export interface LocalNotification { id: string; title: string; body: string; delaySeconds?: number }
export interface BackgroundRequest { identifier: string; delaySeconds?: number; requiresNetwork?: boolean }
export interface BackgroundEvent { id: string; identifier: string; success: boolean; timestamp: number }
export interface BluetoothDevice { id: string; name: string; rssi: number }
export interface BluetoothCharacteristic { service: string; characteristic: string; readable: boolean; writable: boolean; notifiable: boolean }
export interface BluetoothValue { deviceId: string; service: string; characteristic: string; value: number[] }
export interface NFCMessage { records: { type: string; text: string }[] }
export interface NativeServices {
  notifications: {
    register(): Promise<{ token: string; provider: string }>;
    schedule(notification: LocalNotification): Promise<void>;
    cancel(id: string): Promise<void>;
    getEvents(): Promise<NotificationEvent[]>;
    acknowledge(ids: string[]): Promise<void>;
  };
  background: {
    schedule(request: BackgroundRequest): Promise<void>;
    pending(): Promise<string[]>;
    cancel(identifier: string): Promise<void>;
    getEvents(): Promise<BackgroundEvent[]>;
    acknowledge(ids: string[]): Promise<void>;
  };
  bluetooth: {
    scan(serviceUUIDs: string[], durationMs?: number): Promise<BluetoothDevice[]>;
    connect(deviceId: string): Promise<void>;
    disconnect(deviceId: string): Promise<void>;
    getServices(deviceId: string): Promise<BluetoothCharacteristic[]>;
    read(deviceId: string, service: string, characteristic: string): Promise<number[]>;
    write(deviceId: string, service: string, characteristic: string, value: number[]): Promise<void>;
    setNotify(deviceId: string, service: string, characteristic: string, enabled: boolean): Promise<void>;
    subscribe(listener: (value: BluetoothValue) => void, onError?: (error: Error) => void): Unsubscribe;
  };
  nfc: { read(): Promise<NFCMessage>; writeText(text: string): Promise<void> };

  capabilities: { has(module: string, method?: string): Promise<boolean> };
  storage: KeyValueStorage;
  secureStorage: KeyValueStorage;
  app: { getInfo(): Promise<{ name: string; version: string; build: string; applicationId: string }> };
  device: { getInfo(): Promise<{ platform: string; version: string; model: string }> };
  locale: { getInfo(): Promise<{ language: string; timezone: string }> };
  clipboard: { readText(): Promise<string>; writeText(text: string): Promise<void> };
  dialogs: {
    alert(title: string, message?: string): Promise<void>;
    confirm(title: string, message?: string): Promise<boolean>;
    actionSheet(title: string, options: string[]): Promise<number | null>;
  };
  linking: {
    openURL(url: string): Promise<void>; canOpenURL(url: string): Promise<boolean>; openSettings(): Promise<void>;
    getInitialURL(): Promise<string | null>;
    subscribe(listener: (url: string) => void, onError?: (error: Error) => void): Unsubscribe;
  };
  share: { text(text: string): Promise<{ status: 'completed' | 'cancelled' | 'unknown' }>; file(file: FileReference): Promise<{ status: 'completed' | 'cancelled' | 'unknown' }> };
  haptics: { impact(style?: 'light' | 'medium' | 'heavy'): Promise<void>; notification(type?: 'success' | 'warning' | 'error'): Promise<void>; selection(): Promise<void> };
  appState: { get(): Promise<string>; subscribe(listener: (state: string) => void, onError?: (error: Error) => void): Unsubscribe };
  network: { getStatus(): Promise<NetworkStatus>; subscribe(listener: (state: NetworkStatus) => void, onError?: (error: Error) => void): Unsubscribe };
  window: { getMetrics(): Promise<WindowMetrics>; subscribe(listener: (state: WindowMetrics) => void, onError?: (error: Error) => void): Unsubscribe };
  appearance: { get(): Promise<string>; subscribe(listener: (theme: string) => void, onError?: (error: Error) => void): Unsubscribe };
  keyboard: { dismiss(): Promise<void>; subscribe(listener: (state: KeyboardState) => void, onError?: (error: Error) => void): Unsubscribe };
  permissions: { check(permission: PermissionName): Promise<PermissionStatus>; request(permission: PermissionName): Promise<PermissionStatus> };
  location: { getCurrentPosition(): Promise<Position>; watchPosition(listener: (position: Position) => void, onError?: (error: Error) => void): Unsubscribe };
  media: { pickPhoto(): Promise<FileReference | null> };
  files: { pickDocument(): Promise<FileReference | null>; release(file: FileReference): Promise<void> };
  transfers: {
    download(taskId: string, url: string, headers?: Record<string, string>): Promise<FileReference>;
    upload(taskId: string, url: string, file: FileReference, headers?: Record<string, string>): Promise<HttpResponse>;
    cancel(taskId: string): Promise<void>;
    subscribe(listener: (progress: TransferProgress) => void, onError?: (error: Error) => void): Unsubscribe;
  };
}
export interface KeyValueStorage {
  get(key: string, namespace?: string): Promise<string | null>;
  set(key: string, value: string, namespace?: string): Promise<void>;
  remove(key: string, namespace?: string): Promise<void>;
  keys(namespace?: string): Promise<string[]>;
  clear(namespace?: string): Promise<void>;
}
export type InvokeNative = <T = unknown>(module: string, method: string, args?: unknown) => Promise<T>;
export type SubscribeNative = <T>(module: string, listener: (value: T) => void, onError?: (error: Error) => void) => Unsubscribe;
/** Used by the runtime; the returned facade belongs to the calling component. */
export function createNativeServices(invoke: InvokeNative, subscribe: SubscribeNative): NativeServices {
  const storage = (module: string): KeyValueStorage => ({
    get: (key, namespace = 'default') => invoke(module, 'get', { key, namespace }),
    set: (key, value, namespace = 'default') => invoke(module, 'set', { key, value, namespace }),
    remove: (key, namespace = 'default') => invoke(module, 'remove', { key, namespace }),
    keys: (namespace = 'default') => invoke(module, 'keys', { namespace }),
    clear: (namespace = 'default') => invoke(module, 'clear', { namespace }),
  });
  return {
    notifications: {
      register: () => invoke('notifications', 'register'), schedule: notification => invoke('notifications', 'schedule', notification),
      cancel: id => invoke('notifications', 'cancel', { id }), getEvents: () => invoke('notifications', 'getEvents'), acknowledge: ids => invoke('notifications', 'acknowledge', { ids }),
    },
    background: {
      schedule: request => invoke('background', 'schedule', request), pending: () => invoke('background', 'pending'), cancel: identifier => invoke('background', 'cancel', { identifier }),
      getEvents: () => invoke('background', 'getEvents'), acknowledge: ids => invoke('background', 'acknowledge', { ids }),
    },
    bluetooth: {
      scan: (serviceUUIDs, durationMs = 5000) => invoke('bluetooth', 'scan', { serviceUUIDs, durationMs }), connect: deviceId => invoke('bluetooth', 'connect', { deviceId }), disconnect: deviceId => invoke('bluetooth', 'disconnect', { deviceId }), getServices: deviceId => invoke('bluetooth', 'getServices', { deviceId }),
      read: (deviceId, service, characteristic) => invoke('bluetooth', 'read', { deviceId, service, characteristic }), write: (deviceId, service, characteristic, value) => invoke('bluetooth', 'write', { deviceId, service, characteristic, value }),
      setNotify: (deviceId, service, characteristic, enabled) => invoke('bluetooth', 'setNotify', { deviceId, service, characteristic, enabled }), subscribe: (listener, error) => subscribe('bluetooth', listener, error),
    },
    nfc: { read: () => invoke('nfc', 'read'), writeText: text => invoke('nfc', 'writeText', { text }) },
    capabilities: { has: (module, method) => invoke('capabilities', 'has', { module, method }) },
    storage: storage('storage'), secureStorage: storage('secureStorage'),
    app: { getInfo: () => invoke('app', 'getInfo') }, device: { getInfo: () => invoke('device', 'getInfo') }, locale: { getInfo: () => invoke('locale', 'getInfo') },
    clipboard: { readText: () => invoke('clipboard', 'readText'), writeText: text => invoke('clipboard', 'writeText', { text }) },
    dialogs: { alert: (title, message = '') => invoke('dialogs', 'alert', { title, message }), confirm: (title, message = '') => invoke('dialogs', 'confirm', { title, message }), actionSheet: (title, options) => invoke('dialogs', 'actionSheet', { title, options }) },
    linking: { openURL: url => invoke('linking', 'openURL', { url }), canOpenURL: url => invoke('linking', 'canOpenURL', { url }), openSettings: () => invoke('linking', 'openSettings'), getInitialURL: () => invoke('linking', 'getInitialURL'), subscribe: (listener, error) => subscribe('linking', listener, error) },
    share: { text: text => invoke('share', 'text', { text }), file: file => invoke('share', 'file', { file }) },
    haptics: { impact: (style = 'medium') => invoke('haptics', 'impact', { style }), notification: (type = 'success') => invoke('haptics', 'notification', { type }), selection: () => invoke('haptics', 'selection') },
    appState: { get: () => invoke('appState', 'get'), subscribe: (listener, error) => subscribe('appState', listener, error) },
    network: { getStatus: () => invoke('network', 'getStatus'), subscribe: (listener, error) => subscribe('network', listener, error) },
    window: { getMetrics: () => invoke('window', 'getMetrics'), subscribe: (listener, error) => subscribe('window', listener, error) },
    appearance: { get: () => invoke('appearance', 'get'), subscribe: (listener, error) => subscribe('appearance', listener, error) },
    keyboard: { dismiss: () => invoke('keyboard', 'dismiss'), subscribe: (listener, error) => subscribe('keyboard', listener, error) },
    permissions: { check: permission => invoke('permissions', 'check', { permission }), request: permission => invoke('permissions', 'request', { permission }) },
    location: { getCurrentPosition: () => invoke('location', 'getCurrentPosition'), watchPosition: (listener, error) => subscribe('location', listener, error) },
    media: { pickPhoto: () => invoke('media', 'pickPhoto') }, files: { pickDocument: () => invoke('files', 'pickDocument'), release: file => invoke('files', 'release', { file }) },
    transfers: { download: (taskId, url, headers = {}) => invoke('transfers', 'download', { taskId, url, headers }), upload: (taskId, url, file, headers = {}) => invoke('transfers', 'upload', { taskId, url, file, headers }), cancel: taskId => invoke('transfers', 'cancel', { taskId }), subscribe: (listener, error) => subscribe('transfers', listener, error) },
  };
}
