import { BrowserHost, BrowserReferenceHost } from '../src/reference-host.js';
import { WasmRuntime } from '../src/wasm-runtime.js';
import { virtualListPage } from '../../../examples/virtual-list/page.js';

export async function verifyVirtualList(business?: Uint8Array, framework?: Uint8Array): Promise<Record<string, unknown>> {
  const root = document.createElement('div'); root.style.cssText = 'position:relative;width:390px;height:700px'; document.body.append(root);
  const host = business && framework ? new BrowserHost(root, await WasmRuntime.load(business, framework)) : new BrowserReferenceHost(root, virtualListPage);
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const wait = async (condition: () => boolean) => {
    for (let i = 0; i < 120; i++) { await host.flush(); if (host.diagnostics.length) throw new Error(JSON.stringify(host.diagnostics)); if (condition()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('List did not settle: ' + root.textContent?.slice(0, 500));
  };
  const row = (id: number) => root.querySelector<HTMLElement>('[data-testid="list-row-' + id + '"]');
  let failure: unknown; let stage = 'mount';
  (globalThis as any).__anseronuiTestState = () => ({stage, nodes:root.querySelectorAll('[data-tsn-node]').length, diagnostics:host.diagnostics});
  const setStage = (value: string) => { stage = value; };
  const samples: number[] = [];
  let maxMountedRows = 0;
  let paintWaitTimeouts = 0;
  const painted = async () => {
    // Headless WKWebView may throttle RAF. Bound the wait and report that limit.
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => { paintWaitTimeouts++; resolve(); }, 100);
      requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); }));
    });
    await host.flush();
  };
  const started = performance.now();
  try {
    setStage('mount');
    await host.mount('virtual-list', 390, 700);
    await wait(() => !!row(0));
    await painted();
    const firstFrameMs = performance.now() - started;
    await host.inspectRuntime(true, true);
    const scroll = root.querySelector<HTMLElement>('[data-testid="variable-list"]')!;
    assert(root.querySelectorAll('[data-testid^="list-row-"]').length < 60, '5000 rows must keep a bounded mounted window');
    setStage('expand');
    const first = row(0)!; const initial = first.getBoundingClientRect().height;
    first.querySelector<HTMLElement>('[role="button"]')!.click();
    await wait(() => !!row(0) && row(0)!.getBoundingClientRect().height > initial + 20);
    const heights = Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="list-row-"]')).map(element => element.getBoundingClientRect().height);
    assert(new Set(heights).size > 1, 'actual text rows must have unequal measured heights');
    setStage('scroll');
    for (let i = 1; i <= 20; i++) {
      const start = performance.now();
      scroll.scrollTop = i * 10000;
      await painted();
      samples.push(performance.now() - start);
      const mounted = root.querySelectorAll('[data-testid^="list-row-"]').length;
      maxMountedRows = Math.max(maxMountedRows, mounted);
      assert(mounted < 60, 'scrolling must retain a bounded window');
      assert(host.diagnostics.length === 0, JSON.stringify(host.diagnostics));
    }
    setStage('jump');
    root.querySelector<HTMLButtonElement>('[data-testid="list-jump"]')!.click();
    await wait(() => !!row(4000));
    assert(!row(0), 'offscreen rows must be unmounted');
    assert(Math.abs(row(4000)!.getBoundingClientRect().top - scroll.getBoundingClientRect().top) < 3, 'scrollToIndex must align the measured row');
    const top = row(4000)!.getBoundingClientRect().top;
    setStage('prepend');
    root.querySelector<HTMLButtonElement>('[data-testid="list-prepend"]')!.click();
    await wait(() => !!row(4000) && Math.abs(row(4000)!.getBoundingClientRect().top - top) < 3);
    setStage('hide');
    await host.setVisibility(false);
    const ticks = root.querySelector('[data-testid="list-active-ticks"]')!.textContent;
    await new Promise(resolve => setTimeout(resolve, 1100)); await host.flush();
    assert(root.querySelector('[data-testid="list-active-ticks"]')!.textContent === ticks, 'hidden page work must stop');
    await host.setVisibility(true);
    setStage('resize');
    await wait(() => root.querySelector('[data-testid="list-active-ticks"]')!.textContent !== ticks);
    root.style.width = '240px'; await host.resize(240, 700);
    await wait(() => !!row(4000) && row(4000)!.getBoundingClientRect().width <= 241);
    assert(host.diagnostics.length === 0, JSON.stringify(host.diagnostics));
    await painted();
    const core = await host.inspectRuntime();
    const sorted = [...samples].sort((a,b) => a-b);
    return { schemaVersion: 1, mode: business ? 'webkit-wasm' : 'webkit-reference', fixture: '5000 variable rows; expand, 20 real scrolls, jump, prepend, hide/resume, resize; two animation frames or 100ms headless fallback per scroll sample', userAgent: navigator.userAgent, firstFrameMs, samples: samples.length, updateMedianMs: sorted[10], updateP95Ms: sorted[19], maxMountedRows, paintWaitTimeouts, memory: host.runtime instanceof WasmRuntime ? host.runtime.getMemoryStats() : undefined, core, host: host.getPerformanceStats() };
  } catch (error) { failure = error; throw new Error(String(error) + ' stage=' + stage + ' stats=' + JSON.stringify('getStats' in host.runtime ? (host.runtime as any).getStats() : {}) + ' nodes=' + root.querySelectorAll('[data-tsn-node]').length); } finally { try { await host.destroy(); } catch (error) { if (!failure) throw error; } root.remove(); }
}
