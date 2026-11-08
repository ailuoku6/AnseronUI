import { BrowserHost, WasmRuntime } from '../src/index.js';

/** Real Wasm → host timer → Wasm → DOM round-trip, including cancellation. */
export async function verifySplitTimers(business: Uint8Array, framework: Uint8Array): Promise<void> {
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:390px;height:844px';
  document.body.append(root);
  const runtime = await WasmRuntime.load(business, framework);
  const host = new BrowserHost(root, runtime);
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const node = (id: string) => {
    const result = root.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!result) throw new Error('Missing node: ' + id + '; DOM=' + root.outerHTML + '; diagnostics=' + JSON.stringify(host.diagnostics));
    return result;
  };
  const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
  const tick = async () => { for (let i=0; i<10; i++) { await host.flush(); await Promise.resolve(); } };
  const tap = async (id: string) => { node(id).click(); await tick(); };
  try {
    await host.mount('timers',390,844);
    for (let i=0; i<100 && !root.querySelector('[data-testid="timer-count"]'); i++) { await wait(10); await tick(); }
    await tick();
    assert(node('timer-count').textContent === '计时次数: 0', 'initial count');
    await tap('timer-start');
    assert(node('timer-status').textContent === '状态: 等待中', 'asynchronous start');
    await wait(1200); await tick();
    assert(node('timer-count').textContent === '计时次数: 1', 'host timer fires');
    await tap('timer-start'); await tap('timer-cancel');
    await wait(1200); await tick();
    assert(node('timer-count').textContent === '计时次数: 1', 'cancel prevents callback');
    assert(node('timer-status').textContent === '状态: 已取消', 'cancel status');
    await tap('timer-await'); await wait(150); await tick();
    assert(node('timer-count').textContent === '计时次数: 2', 'timer after await');
    await tap('timer-start');
    await host.destroy(); await wait(1200);
    assert(root.childElementCount === 0, 'destroy removes nodes');
    assert(host.diagnostics.length === 0, JSON.stringify(host.diagnostics));
  } finally { await host.destroy(); root.remove(); }
}
