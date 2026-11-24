import { expect, it, vi } from 'vitest';
import { BrowserNativeServices } from '../src/native-services.js';
import { BrowserHost } from '../src/reference-host.js';
import { DOMRenderer } from '../src/renderer.js';
import { WasmRuntime } from '../src/wasm-runtime.js';

it('aborts an ordinary HTTP request when its service owner is disposed', async () => {
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetch);
  const native = new BrowserNativeServices({ ownerDocument: { defaultView: {
    navigator: {}, location: { href: 'https://example.test/' }, setTimeout, clearTimeout,
  } } } as unknown as HTMLElement);
  try {
    const pending = native.call('http', 'request', { url: 'https://example.test/pending' }, new AbortController().signal);
    const cancelled = expect(pending).rejects.toThrow('CANCELLED');
    native.dispose(); await cancelled;
  } finally { vi.unstubAllGlobals(); }
});

it('shuts down both Wasm bundles even when business disposal traps', () => {
  const runtime = Object.create(WasmRuntime.prototype) as any, calls: string[] = [];
  Object.assign(runtime, { disposed: false,
    business: { call(name: string) { calls.push('business:' + name); if (name === 'dispose') throw new Error('Wasm trap'); return name === 'shutdown' ? 1 : 0; } },
    framework: { call(name: string) { calls.push('framework:' + name); } },
  });
  expect(() => runtime.dispose()).toThrow('Wasm trap');
  expect(calls).toEqual(['business:dispose', 'framework:dispose', 'business:async_pending', 'business:shutdown', 'framework:shutdown']);
  runtime.dispose(); expect(calls).toHaveLength(5);
});

it('releases subscriptions, pending polls and transfers after a subscription cleanup throws', async () => {
  const released: string[] = [];
  const native = new BrowserNativeServices({ ownerDocument: { defaultView: { navigator: {} } } } as unknown as HTMLElement, {
    first: () => () => { released.push('first'); throw new Error('unsubscribe failed'); },
    second: () => () => { released.push('second'); },
  });
  const signal = new AbortController().signal;
  const first = native.call('events', 'next', { id: '1', module: 'first' }, signal);
  const second = native.call('events', 'next', { id: '2', module: 'second' }, signal);
  const failures = [expect(first).rejects.toThrow('CANCELLED'), expect(second).rejects.toThrow('CANCELLED')];
  const state = native as any;
  const transfer = new AbortController(); transfer.signal.addEventListener('abort', () => released.push('transfer'));
  state.tasks.set('request', transfer); state.files.set('file', {});
  state.disposers.add(() => { released.push('dialog'); });
  expect(() => native.dispose()).toThrow('unsubscribe failed');
  await Promise.all(failures);
  expect(released).toEqual(['first', 'second', 'dialog', 'transfer']);
  expect(state.files.size).toBe(0); expect(state.streams.size).toBe(0);
  expect(() => native.dispose()).not.toThrow();
});

it('disposes renderer and Core even when request cancellation and service cleanup throw', async () => {
  const released: string[] = [];
  const host = Object.create(BrowserHost.prototype) as any;
  Object.assign(host, {
    disposed: false, send: vi.fn(), flush: vi.fn(async () => {}), profileWaiter: null, backWaiter: null,
    requests: new Map([[1, () => { released.push('cancel'); throw new Error('cancel failed'); }]]),
    nativeServices: { dispose() { released.push('services'); throw new Error('service failed'); } },
    environmentCleanups: [], renderer: { dispose() { released.push('renderer'); } }, runtime: { dispose() { released.push('core'); } },
  });
  await expect(host.destroy()).rejects.toThrow('cancel failed');
  expect(released).toEqual(['cancel', 'services', 'renderer', 'core']);
  await host.destroy(); expect(released).toHaveLength(4);
});

it('releases all native views, media, animations and DOM listeners after a plugin throws', () => {
  const renderer = Object.create(DOMRenderer.prototype) as any;
  const released: string[] = [];
  Object.assign(renderer, {
    disposed: false, topology: {clear() {}}, resumeVideos: new Set(), pointers: new Map(), revision: 1,
    root: { replaceChildren() { released.push('root'); }, removeEventListener() { released.push('listener'); } },
    appearance: null, pointerListeners: new Map([['pointerdown', () => {}]]),
    records: new Map([1, 2].map(id => [id, { kind: 'Video', animation: { cancel() { released.push('animation' + id); } },
      element: { pause() { released.push('video' + id); }, removeAttribute() {}, load() {} },
      native: { dispose() { released.push('plugin' + id); if (id === 1) throw new Error('plugin failed'); } },
    }])),
  });
  expect(() => renderer.dispose()).toThrow('plugin failed');
  expect(released).toEqual(['animation1', 'video1', 'plugin1', 'animation2', 'video2', 'plugin2', 'root', 'listener']);
  expect(renderer.records.size).toBe(0); expect(() => renderer.dispose()).not.toThrow();
});
