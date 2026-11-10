import { BrowserReferenceHost, BrowserPageStack } from '../src/index.js';
import { counterPage } from '../../../examples/counter/page.js';
import { asyncFormPage } from '../../../examples/async-form/page.js';

export async function verifyRouting(): Promise<void> {
  const root = document.createElement('div'); root.style.cssText = 'width:390px;height:844px'; document.body.append(root);
  const hosts: BrowserReferenceHost[] = []; let failure: unknown;
  const stack = new BrowserPageStack(root, async (surface, page, router) => {
    surface.style.cssText = 'width:390px;height:844px';
    const host = new BrowserReferenceHost(surface, page === 'counter' ? counterPage : asyncFormPage, undefined, { router }); hosts.push(host);
    await host.mount(page, 390, 844); return host;
  }, error => { failure = error; });
  const router = stack.router;
  const wait = async (condition: () => boolean) => { for (let i = 0; i < 100; i++) { if (failure) throw failure; await stack.host?.flush(); if (condition()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Routing did not settle: ' + root.textContent); };
  const node = (id: string) => root.querySelector<HTMLElement>('[data-testid="' + id + '"]');
  const click = (title: string) => { const button = Array.from(root.querySelectorAll('button')).find(item => item.textContent === title); if (!button) throw new Error('Missing route button: ' + title); button.click(); };
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  try {
    router.load('counter', { original: '根参数', nested: { valid: true } });
    await wait(() => !!node('counter-route-params')?.textContent?.includes('根参数')); const original = stack.host;
    click('+1'); await wait(() => !!root.textContent?.includes('Count: 1'));
    click('打开 Async Form'); await wait(() => !!node('form-route-params')?.textContent?.includes('"count":1')); const form = stack.host;
    assert(node('form-route-params')?.textContent?.includes('来自 Counter 的参数'), 'Lost Unicode/nested route payload');
    const input = node('form-draft') as HTMLInputElement; input.value = '保留的输入草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); await form!.flush();
    click('打开 Counter 后返回验证表单保留'); await wait(() => !!node('counter-route-params')?.textContent?.includes('async-form'));
    assert(root.textContent?.includes('Count: 0') && stack.host !== original, 'same-page entry must have independent state');
    click('+1'); await wait(() => !!root.textContent?.includes('Count: 1'));
    click('返回上一页'); await wait(() => !!node('form-draft'));
    assert(stack.host === form && (node('form-draft') as HTMLInputElement).value === '保留的输入草稿', 'back preserves form host and draft');
    click('替换当前页并传参'); await wait(() => !!node('form-route-params')?.textContent?.includes('replace 的新参数'));
    assert(router.routeStack.length === 2 && stack.host !== form && (node('form-draft') as HTMLInputElement).value === '', 'replace releases only current entry');
    click('返回 Counter'); await wait(() => !!node('counter-route-params')?.textContent?.includes('根参数'));
    assert(root.textContent?.includes('Count: 1') && stack.host === original, 'back must restore original Counter instance and state');
    router.load('counter'); await wait(() => stack.host !== original && !!root.textContent?.includes('Count: 0'));
    for (const host of hosts) assert(host.diagnostics.length === 0, JSON.stringify(host.diagnostics));
  } finally { await stack.destroy(); root.remove(); }
}
