import { BrowserHost, BrowserReferenceHost, WasmRuntime } from '../src/index.js';

import { componentsPage } from '../../../examples/components/page.js';

/** Exercises the shipped TSX demo through the page runtime and DOM renderer. */
export async function verifyAccessibilityDemo(business?: Uint8Array, framework?: Uint8Array): Promise<void> {
  const root = document.createElement('div'); root.style.cssText = 'width:390px;height:844px'; document.body.append(root);
  const host = business && framework ? new BrowserHost(root, await WasmRuntime.load(business, framework))
    : new BrowserReferenceHost(root, componentsPage);
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message + '; diagnostics=' + JSON.stringify(host.diagnostics)); };
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const tick = async () => { for (let i = 0; i < 20; i++) { await host.flush(); await Promise.resolve(); } };
  const node = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const button = (title: string) => [...root.querySelectorAll<HTMLElement>('[role="button"]')].find(item => item.getAttribute('aria-label') === title)!;
  try {
    await host.mount('components', 390, 844);
    for (let i = 0; i < 100 && !node('accessibility-checkbox'); i++) { await wait(10); await tick(); }
    await tick();
    const checkbox = node('accessibility-checkbox');
    assert(checkbox?.getAttribute('role') === 'checkbox', 'preserves checkbox semantics');
    checkbox.click(); await tick();
    assert(checkbox.getAttribute('aria-checked') === 'true', 'reader activation updates controlled checked state');
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await tick();
    assert(node('accessibility-result').getAttribute('aria-label') === '已触发长按', 'reader long press reaches callback');
    button('播报当前结果').click(); await tick(); await wait(80);
    assert(root.querySelector('[role="status"]')?.textContent === '已触发长按', 'ref announces through host live region');
    button('读屏聚焦到结果').click(); await tick();
    assert(document.activeElement === node('accessibility-result'), 'ref focuses the reader result');
    button('隐藏读屏内容').click(); await tick();
    assert(node('accessibility-hidden').getAttribute('aria-hidden') === 'true', 'hides reader subtree');
    assert(!node('accessibility-result').textContent?.includes('失败'), 'reader refs resolve successfully');
    assert(host.diagnostics.length === 0, 'has no diagnostics');
    await host.destroy();
    assert(root.children.length === 0, 'teardown removes nodes and live region');
  } finally { await host.destroy(); root.remove(); }
}
