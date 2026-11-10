import { BrowserRadioServices } from './radio-services.js';
import { BrowserApplicationServices } from './application-services.js';
import type { BrowserServiceOptions } from './application-services.js';
import type { NativeEventSource } from './extensions.js';
import type { FileReference, HttpRequest } from '@anseronui/ui';

type Stream = { queue?: unknown[]; last?: string; module: string; value?: unknown; error?: string; waiting?: (value: unknown, error?: string) => void; stop: () => void };
const fail = (code: string): never => { throw new Error(code); };
/** A host-owned service registry. Streams coalesce to the latest event while Core is busy. */
export class BrowserNativeServices {
  private streams = new Map<string, Stream>();
  private files = new Map<string, File>();
  private tasks = new Map<string, AbortController>();
  private disposers = new Set<() => void>();
  private sequence = 0;
  private radio: BrowserRadioServices;
  private application: BrowserApplicationServices;
  constructor(private root: HTMLElement, private sources: Record<string, NativeEventSource> = {}, options: BrowserServiceOptions = {}) {
    this.radio = new BrowserRadioServices(this.win, value => this.emit('bluetooth', value));
    this.application = new BrowserApplicationServices(this.win, options);
  }
  private get win(): Window { return this.root.ownerDocument.defaultView!; }
  private get nav(): Navigator { return this.win.navigator; }
  private metrics() {
    const w = this.win; const probe = this.root.ownerDocument.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    this.root.append(probe); const style = w.getComputedStyle(probe);
    const safeArea = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 }; probe.remove();
    return { width: this.root.clientWidth, height: this.root.clientHeight, scale: w.devicePixelRatio, safeArea };
  }
  private network() { return { connected: this.nav.onLine, type: (this.nav as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? 'unknown' }; }
  private theme() { return this.win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  available(module: string, method?: string): boolean {
    const extra = this.radio.methods(module).concat(this.application.methods(module));
    if (extra.length) return method ? extra.includes(method) : true;
    const methods: Record<string, string[]> = {
      http: ['request', 'getText'], storage: ['get', 'set', 'remove', 'keys', 'clear'], app: ['getInfo'], device: ['getInfo'], locale: ['getInfo'],
      dialogs: ['alert', 'confirm', 'actionSheet'], linking: ['openURL', 'canOpenURL', 'getInitialURL', 'subscribe'], appState: ['get', 'subscribe'], network: ['getStatus', 'subscribe'], window: ['getMetrics', 'subscribe'], appearance: ['get', 'subscribe'],
      keyboard: ['dismiss', ...(this.win.visualViewport ? ['subscribe'] : [])], permissions: ['check', 'request'], files: ['pickDocument', 'release'], media: ['pickPhoto'], transfers: ['download', 'upload', 'cancel', 'subscribe'], capabilities: ['has'],
      clipboard: this.nav.clipboard ? ['readText', 'writeText'] : [], share: typeof this.nav.share === 'function' ? ['text', ...(typeof this.nav.canShare === 'function' ? ['file'] : [])] : [],
      haptics: typeof this.nav.vibrate === 'function' ? ['impact', 'notification', 'selection'] : [], location: this.nav.geolocation ? ['getCurrentPosition', 'watchPosition', 'subscribe'] : [],
    };
    if (Object.prototype.hasOwnProperty.call(this.sources, module)) { methods[module] = [...(methods[module] ?? []), 'subscribe']; }
    return method ? (methods[module] ?? []).includes(method) : (methods[module]?.length ?? 0) > 0;
  }
  private emit(module: string, value: unknown) {
    for (const stream of this.streams.values()) if (stream.module === module) {
      if (module === 'bluetooth') {
       if (stream.waiting) { const resolve = stream.waiting; stream.waiting = undefined; resolve(value); }
       else { const queue = stream.queue ??= []; if (queue.length < 64) queue.push(value); else stream.error = 'IO_ERROR: Bluetooth event queue overflow'; }
       continue;
     }
     const encoded = JSON.stringify(value); if (stream.last === encoded) continue; stream.last = encoded;
      if (stream.waiting) { const resolve = stream.waiting; stream.waiting = undefined; resolve(value); }
      else stream.value = value;
    }
  }
  private event(id: string, module: string, signal: AbortSignal): Promise<unknown> {
    let stream = this.streams.get(id);
    if (!stream) {
      if (!this.available(module, module === 'location' ? 'watchPosition' : 'subscribe')) fail('UNSUPPORTED: ' + module + '.subscribe');
      const stops: (() => void)[] = [];
      stream = { module, stop: () => stops.forEach(stop => stop()) };
      this.streams.set(id, stream);
      const source = Object.prototype.hasOwnProperty.call(this.sources, module) ? this.sources[module] : undefined;
      if (source) {
        let stop: (() => void) | void;
        try { stop = source(result => { const current = this.streams.get(id); if (!current) return; if (current.waiting) { const resolve = current.waiting; current.waiting = undefined; resolve(result.value ?? null, result.error); } else if (result.error) current.error = result.error; else current.value = result.value ?? null; }); } catch (error) { this.close(id); throw error; }
        if (stop) stops.push(stop);
      }
      const listen = (target: EventTarget, name: string, callback: () => void) => { target.addEventListener(name, callback); stops.push(() => target.removeEventListener(name, callback)); };
      if (module === 'appState') { const update = () => this.emit(module, this.root.ownerDocument.hidden ? 'background' : 'active'); listen(this.root.ownerDocument, 'visibilitychange', update); update(); }
      if (module === 'network') { const update = () => this.emit(module, this.network()); listen(this.win, 'online', update); listen(this.win, 'offline', update); update(); }
      if (module === 'window') { const update = () => this.emit(module, this.metrics()); const observer = new ResizeObserver(update); observer.observe(this.root); stops.push(() => observer.disconnect()); listen(this.win, 'resize', update); update(); }
      if (module === 'appearance') { const query = this.win.matchMedia('(prefers-color-scheme: dark)'); const update = () => this.emit(module, this.theme()); listen(query, 'change', update); update(); }
      if (module === 'keyboard') { const viewport = this.win.visualViewport!; const update = () => { const height = Math.max(0, this.win.innerHeight - viewport.height - viewport.offsetTop); this.emit(module, { visible: height > 100, height: height > 100 ? height : 0 }); }; listen(viewport, 'resize', update); update(); }
      if (module === 'linking') { const update = () => this.emit(module, this.win.location.href); listen(this.win, 'popstate', update); listen(this.win, 'hashchange', update); }
      if (module === 'location') {
        const watch = this.nav.geolocation.watchPosition(p => this.emit(module, { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }), e => { for (const item of this.streams.values()) if (item.module === module) { const error = e.code === 1 ? 'PERMISSION_DENIED' : e.code === 3 ? 'TIMEOUT' : 'IO_ERROR'; if (item.waiting) { const reject = item.waiting; item.waiting = undefined; reject(null, error); } else item.error = error; } }, { timeout: 15000 });
        stops.push(() => this.nav.geolocation.clearWatch(watch));
      }
    }
    const current = stream;
    return new Promise((resolve, reject) => {
      const abort = () => { this.close(id); reject(new Error('CANCELLED')); };
      signal.addEventListener('abort', abort, { once: true });
      const complete = (value: unknown, error?: string) => { signal.removeEventListener('abort', abort); if (error) { this.close(id); reject(new Error(error)); } else resolve(value); };
      if (signal.aborted) { abort(); return; }
      if (current.error) { complete(null, current.error); return; }
      if (current.queue?.length) { complete(current.queue.shift()); return; }
      if (current.value !== undefined) { const value = current.value; current.value = undefined; complete(value); }
      else current.waiting = complete;
    });
  }
  private close(id: string) { this.streams.get(id)?.stop(); this.streams.delete(id); }
  private remember(file: File): FileReference { const id = 'web-file-' + ++this.sequence; this.files.set(id, file); return { id, name: file.name, size: file.size, mimeType: file.type }; }
  private file(args: any): File { return this.files.get(String(args?.id)) ?? fail('INVALID_ARGUMENT: unknown file'); }
  private pick(photo: boolean, signal: AbortSignal): Promise<FileReference | null> {
    return new Promise(resolve => {
      const input = this.root.ownerDocument.createElement('input'); input.type = 'file'; if (photo) input.accept = 'image/*'; input.style.display = 'none'; this.root.append(input);
      const done = (file: File | null) => { input.remove(); signal.removeEventListener('abort', cancel); this.disposers.delete(cancel); resolve(file ? this.remember(file) : null); };
      const cancel = () => done(null); this.disposers.add(cancel); signal.addEventListener('abort', cancel, { once: true });
      input.onchange = () => done(input.files?.[0] ?? null); input.addEventListener('cancel', cancel, { once: true }); input.click();
    });
  }
  private dialog(method: string, args: any, signal: AbortSignal): Promise<unknown> {
    return new Promise(resolve => {
      const doc = this.root.ownerDocument; const dialog = doc.createElement('dialog'); const title = doc.createElement('h3'); title.textContent = String(args.title ?? ''); const message = doc.createElement('p'); message.textContent = String(args.message ?? ''); dialog.append(title, message);
      const done = (value: unknown) => { signal.removeEventListener('abort', cancel); this.disposers.delete(cancel); dialog.remove(); resolve(value); };
      const cancel = () => done(method === 'confirm' ? false : null); this.disposers.add(cancel); signal.addEventListener('abort', cancel, { once: true });
      const button = (label: string, value: unknown) => { const b = doc.createElement('button'); b.textContent = label; b.style.margin = '8px'; b.onclick = () => done(value); dialog.append(b); };
      if (method === 'actionSheet') (args.options as string[]).forEach((label, index) => button(label, index)); else button('确定', method === 'confirm' ? true : null);
      if (method !== 'alert') button('取消', method === 'confirm' ? false : null);
      dialog.addEventListener('cancel', e => { e.preventDefault(); cancel(); }); doc.body.append(dialog); dialog.showModal();
    });
  }
  private upload(args: any, signal: AbortSignal): Promise<unknown> {
    const taskId = String(args.taskId ?? '');
    if (!taskId || this.tasks.has(taskId)) fail('INVALID_ARGUMENT: duplicate taskId');
    const file = this.file(args.file);
    const url = new URL(String(args.url), this.win.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) fail('INVALID_ARGUMENT: URL');
    const controller = new AbortController(); this.tasks.set(taskId, controller);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', url.href); xhr.timeout = 30000;
      for (const [key, value] of Object.entries(args.headers ?? {})) xhr.setRequestHeader(key, String(value));
      const cancel = () => xhr.abort();
      const finish = (error?: Error) => {
        signal.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', cancel); this.tasks.delete(taskId);
        if (error) { reject(error); return; }
        const headers: Record<string, string> = {};
        xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => { const index = line.indexOf(':'); if (index > 0) headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim(); });
        resolve({ status: xhr.status, headers, body: xhr.responseText });
      };
      signal.addEventListener('abort', cancel, { once: true }); controller.signal.addEventListener('abort', cancel, { once: true });
      xhr.upload.onprogress = event => this.emit('transfers', { taskId, transferred: event.loaded, total: event.lengthComputable ? event.total : file.size });
      let tooLarge = false;
      xhr.onprogress = event => { if (event.loaded > 48000) { tooLarge = true; xhr.abort(); } };
      xhr.onload = () => finish(xhr.responseText.length > 48000 ? new Error('IO_ERROR: RESPONSE_TOO_LARGE') : undefined);
      xhr.onerror = () => finish(new Error('IO_ERROR: upload'));
      xhr.ontimeout = () => finish(new Error('TIMEOUT'));
      xhr.onabort = () => finish(new Error(tooLarge ? 'IO_ERROR: RESPONSE_TOO_LARGE' : 'CANCELLED'));
      if (signal.aborted) { finish(new Error('CANCELLED')); return; }
      xhr.send(file);
    });
  }
  async call(module: string, method: string, raw: unknown, signal: AbortSignal): Promise<unknown> {
    const args = (raw ?? {}) as any;
    if (signal.aborted) fail('CANCELLED');
    if (module === 'events') { if (method === 'close') { this.close(String(args.id)); return null; } if (method === 'next') return this.event(String(args.id), String(args.module), signal); fail('UNSUPPORTED'); }
    if (module === 'capabilities') return this.available(String(args.module), args.method);
    if (!this.available(module, method)) fail('UNSUPPORTED: ' + module + '.' + method);
    if (this.radio.methods(module).length) return this.radio.call(module, method, args, signal);
    if (this.application.methods(module).length) return this.application.call(module, method, args);
    if (module === 'storage') {
      const store = this.win.localStorage; const prefix = 'anseronui:' + encodeURIComponent(String(args.namespace ?? 'default')) + ':'; const key = prefix + String(args.key ?? '');
      if (method === 'get') return store.getItem(key);
      if (method === 'set') { if (typeof args.value !== 'string' || typeof args.key !== 'string') fail('INVALID_ARGUMENT'); store.setItem(key, args.value); return null; }
      if (method === 'remove') { store.removeItem(key); return null; }
      const keys = Object.keys(store).filter(key => key.startsWith(prefix)); if (method === 'keys') return keys.map(key => key.slice(prefix.length)); keys.forEach(key => store.removeItem(key)); return null;
    }
    if (module === 'app') return { name: this.root.ownerDocument.title, version: 'web', build: '', applicationId: this.win.location.origin };
    if (module === 'device') return { platform: 'Web', version: this.nav.userAgent, model: this.nav.platform };
    if (module === 'locale') return { language: this.nav.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (module === 'clipboard') { try { if (method === 'readText') return await this.nav.clipboard.readText(); await this.nav.clipboard.writeText(String(args.text)); return null; } catch { fail('PERMISSION_DENIED'); } }
    if (module === 'dialogs') return this.dialog(method, args, signal);
    if (module === 'linking') {
      if (method === 'getInitialURL') return this.win.location.href;
      const url = new URL(String(args.url), this.win.location.href); const valid = ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol);
      if (method === 'canOpenURL') return valid; if (!valid) fail('INVALID_ARGUMENT: URL scheme');
      const opened = this.win.open('about:blank', '_blank'); if (!opened) throw new Error('IO_ERROR: POPUP_BLOCKED');
      opened.opener = null; opened.location.href = url.href; return null;
    }
    if (module === 'share') { try { const data = method === 'file' ? { files: [this.file(args.file)] } : { text: String(args.text) }; if (method === 'file' && !this.nav.canShare(data)) fail('UNSUPPORTED'); await this.nav.share(data); return { status: 'completed' }; } catch (error) { if ((error as Error).name === 'AbortError') return { status: 'cancelled' }; throw error; } }
    if (module === 'haptics') { const accepted = this.nav.vibrate(method === 'notification' ? [20, 60, 20] : method === 'selection' ? 5 : args.style === 'heavy' ? 30 : 15); if (!accepted) fail('UNSUPPORTED'); return null; }
    if (module === 'appState') return this.root.ownerDocument.hidden ? 'background' : 'active';
    if (module === 'network') return this.network(); if (module === 'window') return this.metrics(); if (module === 'appearance') return this.theme();
    if (module === 'keyboard') { (this.root.ownerDocument.activeElement as HTMLElement | null)?.blur(); return null; }
    if (module === 'permissions') {
      if (!['location', 'camera', 'photos', 'microphone', 'notifications'].includes(args.permission)) fail('INVALID_ARGUMENT: permission');
      if (method === 'request' && args.permission === 'location') { try { await this.call('location', 'getCurrentPosition', {}, signal); return 'granted'; } catch (error) { if (String(error).includes('PERMISSION_DENIED')) return 'denied'; throw error; } }
      if (method === 'request' && (args.permission === 'camera' || args.permission === 'microphone')) { try { const stream = await this.nav.mediaDevices.getUserMedia(args.permission === 'camera' ? { video: true } : { audio: true }); stream.getTracks().forEach(track => track.stop()); return 'granted'; } catch { return 'denied'; } }
      if (method === 'request' && args.permission === 'notifications') return typeof Notification === 'undefined' ? 'unsupported' : ({ default: 'prompt', granted: 'granted', denied: 'denied' })[await Notification.requestPermission()];
      try { const state = await this.nav.permissions.query({ name: args.permission === 'location' ? 'geolocation' : args.permission }); return state.state; } catch { return 'unsupported'; }
    }
    if (module === 'location') return new Promise((resolve, reject) => {
      const abort = () => { this.nav.geolocation.clearWatch(id); reject(new Error('CANCELLED')); };
      const done = () => { this.nav.geolocation.clearWatch(id); signal.removeEventListener('abort', abort); };
      const id = this.nav.geolocation.watchPosition(p => { done(); resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: p.timestamp }); }, e => { done(); reject(new Error(e.code === 1 ? 'PERMISSION_DENIED' : e.code === 3 ? 'TIMEOUT' : 'IO_ERROR')); }, { timeout: 15000 }); signal.addEventListener('abort', abort, { once: true });
    });
    if (module === 'media' || (module === 'files' && method === 'pickDocument')) return this.pick(module === 'media', signal);
    if (module === 'files') { this.files.delete(String(args.file?.id)); return null; }
    if (module === 'transfers' && method === 'upload') return this.upload(args, signal);
    if (module === 'http' || module === 'transfers') {
      if (method === 'cancel') { this.tasks.get(String(args.taskId))?.abort(); return null; }
      const timeout = Number(args.timeout ?? 30000); if (!Number.isFinite(timeout) || timeout <= 0) fail('INVALID_ARGUMENT: timeout');
      const taskId = String(args.taskId ?? ''); if (module === 'transfers') { if (!taskId || this.tasks.has(taskId)) fail('INVALID_ARGUMENT: duplicate taskId'); }
      const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
      if (module === 'transfers') this.tasks.set(taskId, controller);
      let timedOut = false;
      const timer = this.win.setTimeout(() => { timedOut = true; abort(); }, timeout);
      try {
        const options = args as HttpRequest;
        if (!['http:', 'https:'].includes(new URL(options.url, this.win.location.href).protocol)) fail('INVALID_ARGUMENT: URL');
        const response = await fetch(options.url, { method: options.method ?? 'GET', headers: options.headers, body: options.body, signal: controller.signal });
        const headers: Record<string, string> = {}; response.headers.forEach((value, key) => { headers[key] = value; });
        if (module === 'transfers' && !response.ok) fail('IO_ERROR: HTTP ' + response.status);
        const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0; const total = Number(response.headers.get('content-length') ?? 0);
        if (reader) { try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (method !== 'download' && size > 48000) { await reader.cancel(); fail('IO_ERROR: RESPONSE_TOO_LARGE'); } chunks.push(part.value); if (module === 'transfers') this.emit('transfers', { taskId, transferred: size, total, phase: 'response' }); } } finally { reader.releaseLock(); } }
        const blob = new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? 'application/octet-stream' });
        if (method === 'download') return this.remember(new File([blob], new URL(options.url, this.win.location.href).pathname.split('/').pop() || 'download', { type: blob.type }));
        return { status: response.status, headers, body: await blob.text() };
      } catch (error) { if (controller.signal.aborted) fail(timedOut ? 'TIMEOUT' : 'CANCELLED'); throw error; }
      finally { this.win.clearTimeout(timer); signal.removeEventListener('abort', abort); if (module === 'transfers') this.tasks.delete(taskId); }
    }
    fail('UNSUPPORTED');
  }
  dispose() { this.radio.dispose(); for (const id of this.streams.keys()) this.close(id); for (const stop of this.disposers) stop(); this.disposers.clear(); for (const task of this.tasks.values()) task.abort(); this.tasks.clear(); this.files.clear(); }
}
