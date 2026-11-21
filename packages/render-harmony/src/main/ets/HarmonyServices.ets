import { cleanup } from './Cleanup';
import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { util } from '@kit.ArkTS';
import { asset } from '@kit.AssetStoreKit';
import { fileIo as fs, fileUri, picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { uniformTypeDescriptor } from '@kit.ArkData';
import { geoLocationManager } from '@kit.LocationKit';
import { vibrator } from '@kit.SensorServiceKit';
import { systemShare } from '@kit.ShareKit';
import { http } from '@kit.NetworkKit';

export interface FileReference { id: string; name: string; size: number; mimeType: string; }
export interface StandardArgs {
  namespace?: string; key?: string; value?: string; text?: string; file?: FileReference;
  taskId?: string; url?: string; headers?: Record<string, string>; style?: string; type?: string;
}
class RetainedFile {
  path: string; reference: FileReference;
  constructor(path: string, reference: FileReference) { this.path = path; this.reference = reference; }
}
class Position {
  latitude: number; longitude: number; accuracy: number; timestamp: number;
  constructor(value: geoLocationManager.Location) { this.latitude = value.latitude; this.longitude = value.longitude; this.accuracy = value.accuracy; this.timestamp = value.timeStamp; }
}
class TransferProgress {
  taskId: string; transferred: number; total: number;
  constructor(id: string, value: number, total: number) { this.taskId = id; this.transferred = value; this.total = total; }
}
class HttpResponse {
  status: number; body: string; headers: Record<string, string>;
  constructor(status: number, body: string, headers: Record<string, string>) { this.status = status; this.body = body; this.headers = headers; }
}
class ShareResult { status: string; constructor(status: string) { this.status = status; } }

/** System services keep file paths and sensitive values on the Harmony host side. */
export class HarmonyServices {
  private context: common.UIAbilityContext;
  private emit: (module: string, value: Object) => void;
  private files: Map<string, RetainedFile> = new Map();
  private tasks: Map<string, () => void> = new Map();
  private uploads: Map<string, number> = new Map();
  private closed: boolean = false;
  private watchingLocation: boolean = false;
  private locationListener: (value: geoLocationManager.Location) => void = value => this.emit('location', new Position(value));
  constructor(context: common.UIAbilityContext, emit: (module: string, value: Object) => void) { this.context = context; this.emit = emit; }
  supports(module: string, method?: string): boolean {
    let methods: string[] = [];
    switch (module) {
      case 'secureStorage': methods = ['get','set','remove','keys','clear']; break;
      case 'media': methods = ['pickPhoto']; break;
      case 'files': methods = ['pickDocument','release']; break;
      case 'share': methods = ['text','file']; break;
      case 'haptics': methods = ['impact','notification','selection']; break;
      case 'location': methods = ['getCurrentPosition','watchPosition','subscribe']; break;
      case 'transfers': methods = ['download','upload','cancel','subscribe']; break;
    }
    return method === undefined ? methods.length > 0 : methods.includes(method);
  }
  async invoke(module: string, method: string, args: StandardArgs, setCancel: (cancel: () => void) => void): Promise<Object | null> {
    if (this.closed) throw new Error('CANCELLED');
    if (!this.supports(module, method)) throw new Error('UNSUPPORTED: ' + module + '.' + method);
    if (module === 'secureStorage') return this.secure(method, args);
    if (module === 'files' && method === 'release') { await this.release(args.file!); return null; }
    if (module === 'files' || module === 'media') {
      let cancelled = false; setCancel(() => { cancelled = true; });
      let uri = '';
      if (module === 'media') { const result = await new photoAccessHelper.PhotoViewPicker().select({ MIMEType: photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE, maxSelectNumber: 1 }); uri = result.photoUris[0] ?? ''; }
      else { const result = await new picker.DocumentViewPicker(this.context).select({ maxSelectNumber: 1 }); uri = result[0] ?? ''; }
      if (cancelled || this.closed) throw new Error('CANCELLED');
      if (!uri) return null;
      const file = await this.remember(uri);
      if (cancelled || this.closed) { if (this.files.has(file.id)) await this.release(file); throw new Error('CANCELLED'); }
      return file;
    }
    if (module === 'share') {
      const record: systemShare.SharedRecord = method === 'text' ? { utd: uniformTypeDescriptor.UniformDataType.PLAIN_TEXT, content: args.text! } : { utd: uniformTypeDescriptor.UniformDataType.FILE, uri: fileUri.getUriFromPath(this.resolve(args.file!).path) };
      const controller = new systemShare.ShareController(new systemShare.SharedData(record));
      return await new Promise<ShareResult>((resolve, reject) => {
        let completed = false;
        const done = (): void => { completed = true; };
        const dismiss = (): void => { controller.off('shareCompleted', done); controller.off('dismiss', dismiss); resolve(new ShareResult(completed ? 'completed' : 'cancelled')); };
        controller.on('shareCompleted', done); controller.on('dismiss', dismiss);
        controller.show(this.context, { previewMode: systemShare.SharePreviewMode.DEFAULT }).catch((error: Error) => { controller.off('shareCompleted', done); controller.off('dismiss', dismiss); reject(error); });
      });
    }
    if (module === 'haptics') { await vibrator.startVibration({ type: 'time', duration: method === 'selection' ? 10 : method === 'notification' ? 70 : args.style === 'heavy' ? 45 : args.style === 'light' ? 15 : 25 }, { usage: 'touch' }); return null; }
    if (module === 'location') return new Position(await geoLocationManager.getCurrentLocation({ timeoutMs: 15000 }));
    if (module === 'transfers') {
      if (method === 'cancel') { this.tasks.get(args.taskId!)?.(); return null; }
      return await this.transfer(method, args, setCancel);
    }
    throw new Error('UNSUPPORTED');
  }
  watchLocation(enabled: boolean): void {
    if (enabled === this.watchingLocation) return;
    if (enabled) geoLocationManager.on('locationChange', { timeInterval: 1, distanceInterval: 0 }, this.locationListener);
    else geoLocationManager.off('locationChange', this.locationListener);
    this.watchingLocation = enabled;
  }
  private bytes(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value); }
  private decode(value: asset.Value | undefined): string { return new util.TextDecoder('utf-8').decodeWithStream(value as Uint8Array); }
  private async secure(method: string, args: StandardArgs): Promise<Object | null> {
    const query: asset.AssetMap = new Map();
    const prefix = this.context.applicationInfo.name + ':anseronui:' + encodeURIComponent(args.namespace ?? 'default') + ':';
    if (['get','set','remove'].includes(method)) {
      if (typeof args.key !== 'string') throw new Error('INVALID_ARGUMENT: key');
      const alias = this.bytes(prefix + args.key);
      if (alias.length === 0 || alias.length > 256) throw new Error('INVALID_ARGUMENT: key exceeds 256 bytes');
      query.set(asset.Tag.ALIAS, alias);
    }
    try {
      if (method === 'set') {
        if (typeof args.value !== 'string') throw new Error('INVALID_ARGUMENT: value');
        // JSON encoding preserves empty strings while Asset requires a nonempty secret.
        query.set(asset.Tag.SECRET, this.bytes(JSON.stringify(args.value)));
        query.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_UNLOCKED);
        query.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
        query.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
        await asset.add(query); return null;
      }
      if (method === 'remove') { await asset.remove(query); return null; }
      query.set(asset.Tag.RETURN_TYPE, method === 'get' ? asset.ReturnType.ALL : asset.ReturnType.ATTRIBUTES);
      if (method === 'clear') {
        const values = await asset.query(query);
        for (const value of values) { const alias = value.get(asset.Tag.ALIAS); if (alias instanceof Uint8Array && this.decode(alias).startsWith(prefix)) { const item: asset.AssetMap = new Map(); item.set(asset.Tag.ALIAS, alias); await asset.remove(item); } }
        return null;
      }
      const values = await asset.query(query);
      if (method === 'get') return values.length ? JSON.parse(this.decode(values[0].get(asset.Tag.SECRET))) as string : null;
      return values.map(value => this.decode(value.get(asset.Tag.ALIAS))).filter(alias => alias.startsWith(prefix)).map(alias => alias.substring(prefix.length)).sort();
    } catch (error) {
      if ((error as BusinessError).code === asset.ErrorCode.NOT_FOUND) return method === 'keys' ? [] : null;
      throw new Error(String(error));
    }
  }
  private identity(): string { return util.generateRandomUUID(true); }
  private resolve(reference: FileReference): RetainedFile {
    const file = this.files.get(reference?.id ?? '');
    if (!file) throw new Error('INVALID_ARGUMENT: unknown or released file');
    return file;
  }
  private async release(reference: FileReference): Promise<void> {
    const file = this.resolve(reference);
    if (this.uploads.has(reference.id)) throw new Error('INVALID_ARGUMENT: file is being uploaded');
    await fs.unlink(file.path); this.files.delete(reference.id);
  }
  private async remember(uri: string): Promise<FileReference> {
    if (this.closed) throw new Error('CANCELLED');
    if (this.files.size >= 128) throw new Error('IO_ERROR: retained file limit');
    const id = this.identity(), path = this.context.cacheDir + '/anseronui-' + id;
    const source = await fs.open(uri, fs.OpenMode.READ_ONLY);
    try {
      try { await fs.copyFile(source.fd, path); } finally { await fs.close(source); }
      return await this.retain(id, path, new fileUri.FileUri(uri).name);
    } catch (error) { try { await fs.unlink(path); } catch (_cleanupError) {} throw new Error(String(error)); }
  }
  private async retain(id: string, path: string, name: string): Promise<FileReference> {
    if (this.closed) { await fs.unlink(path); throw new Error('CANCELLED'); }
    const stats = await fs.stat(path);
    if (this.closed || this.files.size >= 128) { await fs.unlink(path); throw new Error(this.closed ? 'CANCELLED' : 'IO_ERROR: retained file limit'); }
    let mime = 'application/octet-stream';
    try { const extension = name.substring(name.lastIndexOf('.')); const utd = uniformTypeDescriptor.getUniformDataTypeByFilenameExtension(extension); mime = uniformTypeDescriptor.getTypeDescriptor(utd).mimeTypes[0] ?? mime; } catch (_error) {}
    const reference: FileReference = { id, name, size: stats.size, mimeType: mime };
    this.files.set(id, new RetainedFile(path, reference)); return reference;
  }
  private async transfer(method: string, args: StandardArgs, setCancel: (cancel: () => void) => void): Promise<Object> {
    const id = args.taskId ?? '';
    if (!id || id.length > 128 || this.tasks.has(id)) throw new Error('INVALID_ARGUMENT: taskId');
    if (!/^https?:\/\//i.test(args.url ?? '')) throw new Error('INVALID_ARGUMENT: URL');
    const request = http.createHttp();
    let cancelled = false;
    let rejectCancel: (error: Error) => void = () => {};
    const cancellation = new Promise<Object>((_resolve, reject) => { rejectCancel = reject; });
    const cancel = (): void => { if (cancelled) return; cancelled = true; cleanup(() => request.destroy()); rejectCancel(new Error('CANCELLED')); };
    this.tasks.set(id, cancel); setCancel(cancel);
    const fileId = this.identity(), path = this.context.cacheDir + '/anseronui-' + fileId;
    let output: fs.File | null = null;
    let uploadId = '';
    const operation = async (): Promise<Object> => {
      try {
        if (method === 'download') {
          output = await fs.open(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
          if (cancelled) throw new Error('CANCELLED');
          let writeError: Error | null = null;
          request.on('dataReceive', (chunk: ArrayBuffer) => {
            if (cancelled || writeError || !output) return;
            try { let offset = 0; while (offset < chunk.byteLength) { const written = fs.writeSync(output.fd, chunk.slice(offset)); if (written <= 0) throw new Error('IO_ERROR: short write'); offset += written; } } catch (error) { writeError = new Error(String(error)); request.destroy(); }
          });
          request.on('dataReceiveProgress', value => { if (!cancelled && !this.closed) this.emit('transfers', new TransferProgress(id, value.receiveSize, value.totalSize)); });
          const status = await request.requestInStream(args.url!, { method: http.RequestMethod.GET, header: args.headers, usingCache: false, connectTimeout: 30000, readTimeout: 30000 });
          if (writeError) throw new Error(String(writeError));
          if (status < 200 || status >= 300) throw new Error('IO_ERROR: HTTP ' + status);
          await fs.close(output); output = null;
          if (cancelled) throw new Error('CANCELLED');
          let name = args.url!.split('?')[0].split('/').pop() ?? 'download';
          try { name = decodeURIComponent(name); } catch (_error) {}
          const retained = await this.retain(fileId, path, name || 'download');
          if (cancelled) { await this.release(retained); throw new Error('CANCELLED'); }
          return retained;
        }
        const file = this.resolve(args.file!);
        if (file.reference.size > 33554432) throw new Error('INVALID_ARGUMENT: upload exceeds 32 MiB');
        uploadId = file.reference.id; this.uploads.set(uploadId, (this.uploads.get(uploadId) ?? 0) + 1);
        const input = await fs.open(file.path, fs.OpenMode.READ_ONLY);
        const data = new ArrayBuffer(file.reference.size);
        try { let offset = 0; while (offset < data.byteLength) { if (cancelled) throw new Error('CANCELLED'); const chunk = new ArrayBuffer(Math.min(data.byteLength - offset, 65536)); const read = await fs.read(input.fd, chunk); if (!read) throw new Error('IO_ERROR: short read'); new Uint8Array(data).set(new Uint8Array(chunk, 0, read), offset); offset += read; } } finally { await fs.close(input); }
        if (cancelled) throw new Error('CANCELLED');
        request.on('dataSendProgress', value => { if (!cancelled && !this.closed) this.emit('transfers', new TransferProgress(id, value.sendSize, value.totalSize)); });
        const response = await request.request(args.url!, { method: http.RequestMethod.POST, header: args.headers, extraData: data, expectDataType: http.HttpDataType.STRING, usingCache: false, maxLimit: 65536, connectTimeout: 30000, readTimeout: 30000 });
        return new HttpResponse(response.responseCode, response.result as string, response.header as Record<string, string>);
      } finally {
        if (uploadId) { const count = (this.uploads.get(uploadId) ?? 1) - 1; if (count > 0) this.uploads.set(uploadId, count); else this.uploads.delete(uploadId); }
        cleanup(() => request.destroy());
        if (output) { try { await fs.close(output); } catch (_error) {} }
        if (!this.files.has(fileId)) { try { await fs.unlink(path); } catch (_error) {} }
      }
    };
    try { return await Promise.race<Object>([operation(), cancellation]); }
    finally { if (this.tasks.get(id) === cancel) this.tasks.delete(id); }
  }
  dispose(): void {
    this.closed = true;
    const tasks = Array.from(this.tasks.values()); this.tasks.clear(); tasks.forEach(cancel => cleanup(cancel));
    if (this.watchingLocation) { try { this.watchLocation(false); } catch (_error) {} }
    this.files.forEach(file => { void fs.unlink(file.path).catch(() => {}); }); this.files.clear();
  }
}
