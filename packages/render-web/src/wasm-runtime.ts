import type { Envelope, InputPayload, OutputPayload } from '@anseronui/protocol';
import type { BrowserRuntimeAdapter } from './reference-host.js';

type Source = string | URL | Uint8Array;
interface ModuleExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  scriptc_alloc(size: number): number;
  scriptc_free(pointer: number): void;
}
/** One isolated allocator/runtime per compiled artifact. Never share pointers. */
class WasmModule {
  private constructor(private readonly api: ModuleExports, private readonly prefix: string) {}
  static async load(source: Source, prefix: string): Promise<WasmModule> {
    let bytes: Uint8Array;
    if (source instanceof Uint8Array) bytes = source;
    else {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Bundle download failed: ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    let api: ModuleExports;
    const view = () => new DataView(api.memory.buffer);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const badFile = () => 8; // WASI EBADF: this reactor exposes no filesystem.
    const wasi = {
      environ_sizes_get(count: number, size: number) { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
      environ_get() { return 0; },
      clock_time_get(clock: number, _precision: bigint, result: number) {
        if (clock !== 0 && clock !== 1) return 28;
        const ms = clock === 0 ? Date.now() : performance.now();
        view().setBigUint64(result, BigInt(Math.floor(ms * 1e6)), true); return 0;
      },
      fd_close: badFile, fd_prestat_get: badFile, fd_prestat_dir_name: badFile,
      fd_read: badFile, fd_seek: badFile, path_open: badFile,
      fd_fdstat_set_flags(fd: number) { return fd === 1 || fd === 2 ? 0 : 8; },
      fd_fdstat_get(fd: number, result: number) {
        if (fd !== 1 && fd !== 2) return 8;
        new Uint8Array(api.memory.buffer, result, 24).fill(0);
        view().setUint8(result, 2); return 0;
      },
      fd_write(fd: number, vectors: number, count: number, written: number) {
        if (fd !== 1 && fd !== 2) return 8;
        let total = 0;
        for (let i=0; i<count; i++) {
          const pointer = view().getUint32(vectors+i*8, true);
          const length = view().getUint32(vectors+i*8+4, true);
          const message = decoder.decode(new Uint8Array(api.memory.buffer, pointer, length));
          if (fd === 2) console.error(message); else console.log(message);
          total += length;
        }
        view().setUint32(written, total, true); return 0;
      },
      proc_exit(code: number) { throw new Error(`Core exited: ${code}`); },
    };
    const result = await WebAssembly.instantiate(bytes as BufferSource, {
      wasi_snapshot_preview1: wasi,
      scriptc: { panic(pointer: number, length: number) {
        throw new Error(decoder.decode(new Uint8Array(api.memory.buffer, pointer, length)));
      } },
    });
    api = result.instance.exports as ModuleExports;
    api._initialize();
    return new WasmModule(api, prefix);
  }
  call(name: string, ...args: number[]): number {
    const fn = this.api[this.prefix + name];
    if (typeof fn !== 'function') throw new Error('BUNDLE_EXPORT_MISSING: ' + this.prefix + name);
    return (fn as (...args: number[]) => number)(...args);
  }
  input(name: string, text: string): void {
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 16_777_216) throw new Error('Bundle message too large');
    const pointer = this.api.scriptc_alloc(bytes.length || 1);
    if (!pointer) throw new Error('Bundle input allocation failed');
    try {
      new Uint8Array(this.api.memory.buffer, pointer, bytes.length).set(bytes);
      this.call(name, pointer, bytes.length);
    } finally { this.api.scriptc_free(pointer); }
  }
  output(name: string, input?: string): string {
    const slots = this.api.scriptc_alloc(8);
    if (!slots) throw new Error('Bundle result allocation failed');
    let pointer = 0;
    try {
      if (input === undefined) this.call(name, slots, slots + 4);
      else {
        const bytes = new TextEncoder().encode(input);
        if (bytes.length > 16_777_216) throw new Error('Bundle message too large');
        pointer = this.api.scriptc_alloc(bytes.length || 1);
        if (!pointer) throw new Error('Bundle input allocation failed');
        new Uint8Array(this.api.memory.buffer, pointer, bytes.length).set(bytes);
        this.call(name, pointer, bytes.length, slots, slots + 4);
      }
      const view = new DataView(this.api.memory.buffer);
      return new TextDecoder('utf-8', {fatal:true}).decode(new Uint8Array(this.api.memory.buffer, view.getUint32(slots,true), view.getUint32(slots+4,true)));
    } finally {
      if (pointer) this.api.scriptc_free(pointer);
      this.api.scriptc_free(slots);
      this.call('reset');
    }
  }
}

/** Composition of a reusable Framework Core and an independently compiled business bundle. */
export class WasmRuntime implements BrowserRuntimeAdapter {
  readonly runtimeEpoch = 1;
  private disposed = false;
  private constructor(private readonly business: WasmModule, private readonly framework: WasmModule, readonly bundleBuildId: string) {}

  static async load(source: Source, frameworkSource?: Source, bundleBuildId = 'anseronui-demo'): Promise<WasmRuntime> {
    if (frameworkSource === undefined) {
      if (source instanceof Uint8Array) throw new Error('Framework bytes or URL required for split bundle');
      const url = new URL(String(source), typeof location === 'undefined' ? 'http://localhost/' : location.href);
      url.pathname = url.pathname.replace(/[^/]*$/, 'framework.wasm');
      frameworkSource = url;
    }
    const [business, framework] = await Promise.all([
      WasmModule.load(source, 'anseronui_business_'),
      WasmModule.load(frameworkSource, 'anseronui_framework_'),
    ]);
    framework.call('init'); business.call('init');
    if (framework.call('version') !== 1 || business.call('version') !== 1) {
      business.call('shutdown'); framework.call('shutdown');
      throw new Error('CORE_ABI_MISMATCH');
    }
    business.call('create');
    return new WasmRuntime(business, framework, bundleBuildId);
  }
  post(input: Envelope<InputPayload>): void {
    if (this.disposed) throw new Error('CORE_DISPOSED');
    const text = JSON.stringify(input);
    if (new TextEncoder().encode(text).length > 1_048_576) throw new Error('Input message too large');
    this.business.input('post', text);
  }
  step(maxMessages = 64): Envelope<OutputPayload>[] {
    if (this.disposed) return [];
    if (!Number.isInteger(maxMessages) || maxMessages <= 0) throw new Error('Invalid step budget');
    if (this.business.call('async_step', 1024)) return [];
    this.business.call('advance');
    for (let turns = 0; ; turns++) {
      const request = this.business.output('coreRequest');
      if (!request) break;
      if (turns >= 4096) throw new Error('CORE_BRIDGE_BUDGET');
      const response = this.framework.output('execute', request);
      this.business.input('coreResult', response);
    }
    return JSON.parse(this.business.output('step')) as Envelope<OutputPayload>[];
  }
  hasPendingWork(): boolean {
    return !this.disposed && (this.business.call('async_pending') !== 0 || this.business.call('pending') !== 0);
  }
  dispose(): void {
    if (this.disposed) return;
    this.business.call('dispose');
    for (let i=0; i<100 && this.business.call('async_pending'); i++) this.business.call('async_step', 1024);
    this.disposed = true;
    const stopped = this.business.call('shutdown');
    this.framework.call('shutdown');
    if (!stopped) throw new Error('Core has unresolved async work at shutdown');
  }
}
