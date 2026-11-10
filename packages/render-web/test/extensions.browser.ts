import { verifyRouting } from './routing.browser.js';
import { inbox } from '../src/service-inbox.js';
import { BrowserApplicationServices } from '../src/application-services.js';
import { installNativeServiceWorker } from '../src/service-worker-services.js';
import { BrowserNativeServices } from '../src/native-services.js';
import { BrowserReferenceHost } from '../src/index.js';
import { extensionsPage } from '../../../examples/extensions/page.js';

export async function verifyExtensions(): Promise<void> {
  await verifyRouting();
  let disposed = 0;
  const root = document.createElement('div'); root.style.width='390px'; root.style.height='844px'; document.body.append(root);
  const host = new BrowserReferenceHost(root, extensionsPage, undefined, {
    modules: { device: method => { if (method !== 'info') throw new Error('bad method'); return {platform:'WebKit'}; } },
    components: { DemoSwitch: ({document,emit}) => {
      const element = document.createElement('input'); element.type = 'checkbox';
      element.addEventListener('change', () => emit('change',{value:element.checked}));
      return {element, setProps: props => {element.checked=Boolean(props.value);}, invoke: method => {
        if(method!=='toggle') throw new Error('unsupported method'); element.checked=!element.checked; return {value:element.checked};
      }, dispose: () => {disposed++;} };
    } }
  });
  const assert = (value: unknown, message: string) => {if(!value)throw new Error(message);};
  const node = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const tick = async () => {for(let i=0;i<48;i++){await Promise.resolve();await host.flush();}};
  const tap = async (title: string) => {const button=[...root.querySelectorAll('button')].find(button=>button.textContent===title);assert(button,'missing button '+title+' DOM='+root.innerHTML+' diagnostics='+JSON.stringify(host.diagnostics));button!.click();await tick();};
  await host.mount('extensions',390,844);
  await tap('读取平台信息'); assert(node('extension-platform').textContent==='平台: WebKit','module JSON result');
  const control=node('extension-switch') as HTMLInputElement;
  control.checked=true;control.dispatchEvent(new Event('change'));await tick();
  assert(node('extension-value').textContent==='开关: on','native event callback');
  await tap('更新原生属性');assert(!control.checked,'updated native properties');
  await tap('调用原生方法');assert(control.checked,'node ref method result');assert(node('extension-status').textContent==='状态: ref toggle','node method updates state');
  await tap('测量原生节点');assert(node('extension-status').textContent==='状态: measure 100','node measurement');
  await tap('组件 ref 聚焦');assert(document.activeElement===node('extension-input'),'component imperative handle');
  await tap('卸载原生组件');assert(!node('extension-switch'),'native removal');assert(disposed===1,'dispose on removal');
  await tap('检查卸载 ref');assert(node('extension-status').textContent==='状态: ref cleared / stale rejected','clear ref and reject stale handle');
  await tap('重新挂载');assert(!!node('extension-switch'),'remount');
  await tap('读取应用 / 设备 / 语言'); assert(node('native-status').textContent?.includes('Web'), 'built-in device info coexists with custom device.info: '+node('native-status').textContent);
  await tap('普通存储：写入并读回'); assert(node('native-status').textContent?.includes('AnseronUI 原生能力示例'), 'storage persists text');
  await tap('普通存储：列出 / 删除 / 清空示例空间'); assert(node('native-status').textContent?.includes('"after":[]'), 'scoped storage clears');
  await tap('安全存储：写入 / 读取 / 列出 / 删除 / 清空'); assert(node('native-status').textContent?.includes('当前平台不支持'), 'web secure storage is not falsely emulated');
  await tap('系统确认框'); const dialog=document.querySelector('dialog'); assert(dialog, 'native dialog shown');
  [...dialog!.querySelectorAll('button')].find(button=>button.textContent==='取消')!.click(); await tick();
  assert(node('native-status').textContent?.includes('false'), 'dialog cancellation resolves false');
  await tap('监听网络 / 窗口 / 主题 / 键盘 / 前后台 / 链接 / 传输');
  const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine'); Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  window.dispatchEvent(new Event('offline')); await tick(); assert(node('native-events').textContent?.includes('network'), 'stream event delivered');
  await tap('停止环境监听'); assert(node('native-events').textContent==='已停止监听', 'stream stop');
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor); else delete (navigator as unknown as { onLine?: boolean }).onLine;
  window.dispatchEvent(new Event('online')); await tick(); assert(node('native-events').textContent==='已停止监听', 'late event discarded');
  await tap('读取通知收件箱'); assert(node('device-status').textContent?.includes('当前平台或宿主配置不支持'), 'missing worker configuration is reflected in the page');
  await host.destroy();assert(disposed===2,'dispose on page destroy');
  assert(host.diagnostics.length===0,JSON.stringify(host.diagnostics));root.remove();
  // Events are app scoped, ordered, durable across host instances and explicitly acknowledged.
  const tag = 'test-' + crypto.randomUUID();
  await inbox(indexedDB, tag, undefined, { kind: 'received', payload: { sequence: 1 } });
  await inbox(indexedDB, tag, undefined, { kind: 'opened', payload: { sequence: 2 } });
  const messages = await inbox(indexedDB, tag);
  assert(messages.length === 2 && messages[0]!.kind === 'received' && messages[1]!.kind === 'opened', 'inbox preserves both deliveries');
  await inbox(indexedDB, tag, [String(messages[0]!.id)]);
  const remaining = await inbox(indexedDB, tag); assert(remaining.length === 1 && remaining[0]!.id === messages[1]!.id, 'ack removes only the selected delivery');
  await inbox(indexedDB, tag, [String(messages[1]!.id)]);
  const tags = new Set<string>();
  const registration = { active: {}, sync: { register: async (name: string) => tags.add(name), getTags: async () => Array.from(tags) } } as unknown as ServiceWorkerRegistration;
  const appServices = new BrowserApplicationServices(window, { registration, backgroundIdentifiers: ['test-refresh'] });
  assert(!appServices.methods('background').includes('cancel'), 'sync cancellation is not falsely advertised');
  await appServices.call('background', 'schedule', { identifier: 'test-refresh', delaySeconds: 0 });
  assert(JSON.stringify(await appServices.call('background', 'pending', {})) === '["test-refresh"]', 'background submits native sync tag');
  for (const args of [{ identifier: 'unknown' }, { identifier: 'test-refresh', delaySeconds: 1 }]) {
    try { await appServices.call('background', 'schedule', args); throw new Error('invalid scheduling accepted'); }
    catch (error) { assert(/INVALID_ARGUMENT|UNSUPPORTED/.test(String(error)), 'reject unregistered handler or unsupported delay'); }
  }
  const workerListeners: Record<string, (event: any) => void> = {};
  let backgroundRan = 0;
  installNativeServiceWorker({ indexedDB, addEventListener: (name: string, listener: (event: any) => void) => { workerListeners[name] = listener; } }, { 'test-refresh': async () => { backgroundRan++; } });
  let work!: Promise<void>; workerListeners.sync!({ tag: 'anseronui:test-refresh', waitUntil: (promise: Promise<void>) => { work = promise; } }); await work;
  assert(backgroundRan === 1, 'service worker runs registered work without a page host');
  const backgroundEvents = await inbox(indexedDB, 'background');
  const completed = backgroundEvents.filter(event => event.identifier === 'test-refresh'); assert(completed.length > 0 && completed[completed.length - 1]!.success === true, 'worker persists completion');
  await inbox(indexedDB, 'background', completed.map(event => String(event.id)));
  let emit!: (result: { value?: unknown; error?: string }) => void;
  let stopped = 0;
  const native = new BrowserNativeServices(root, { 'test.events': receive => { emit = receive; return () => { stopped++; }; } });
  const signal = new AbortController();
  const first = native.call('events', 'next', { id: 'custom', module: 'test.events' }, signal.signal);
  emit({ value: 1 }); assert(await first === 1, 'custom source delivers first value');
  emit({ value: 2 }); emit({ value: 3 });
  assert(await native.call('events', 'next', { id: 'custom', module: 'test.events' }, signal.signal) === 3, 'busy subscription coalesces values');
  const waiting = native.call('events', 'next', { id: 'custom', module: 'test.events' }, signal.signal);
  signal.abort(); try { await waiting; throw new Error('missing cancellation'); } catch (error) { assert(String(error).includes('CANCELLED'), 'custom source cancellation'); }
  assert(stopped === 1, 'custom cleanup runs once');
  const originalFetch = window.fetch;
  try {
    window.fetch = async () => new Response('unauthorized', { status: 401, headers: { 'x-native-test': 'yes' } });
    const response = await native.call('http', 'request', { url: 'https://anseronui.test/api', method: 'POST', body: '{}' }, new AbortController().signal) as { status: number; headers: Record<string, string>; body: string };
    assert(response.status === 401 && response.body === 'unauthorized' && response.headers['x-native-test'] === 'yes', 'HTTP preserves non-success responses');
    window.fetch = async () => new Response('x'.repeat(50000));
    try { await native.call('http', 'request', { url: 'https://anseronui.test/large' }, new AbortController().signal); throw new Error('large response accepted'); }
    catch (error) { assert(String(error).includes('RESPONSE_TOO_LARGE'), 'HTTP enforces bridge size'); }
    window.fetch = async () => new Response('file contents', { headers: { 'content-type': 'text/plain' } });
    const selected = await native.call('transfers', 'download', { taskId: 'download-test', url: 'https://anseronui.test/test.txt' }, new AbortController().signal) as { id: string; name: string; size: number };
    assert(selected.name === 'test.txt' && selected.size === 13, 'download returns file reference');
    await native.call('files', 'release', { file: selected }, new AbortController().signal);
    try { await native.call('transfers', 'upload', { taskId: 'released-test', url: 'https://anseronui.test/upload', file: selected }, new AbortController().signal); throw new Error('released file accepted'); }
    catch (error) { assert(String(error).includes('INVALID_ARGUMENT'), 'released file cannot be uploaded'); }
    window.fetch = (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    const cancel = new AbortController(); const pending = native.call('http', 'request', { url: 'https://anseronui.test/wait' }, cancel.signal); cancel.abort();
    try { await pending; throw new Error('request did not cancel'); } catch (error) { assert(String(error).includes('CANCELLED'), 'request cancellation preserved'); }
    const timed = native.call('http', 'request', { url: 'https://anseronui.test/wait', timeout: 1 }, new AbortController().signal);
    try { await timed; throw new Error('request did not timeout'); } catch (error) { assert(String(error).includes('TIMEOUT'), 'timeout distinct from cancellation'); }
  } finally { window.fetch = originalFetch; native.dispose(); }

}
