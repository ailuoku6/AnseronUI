import { BrowserReferenceHost } from '../src/index.js';
import { extensionsPage } from '../../../examples/extensions/page.js';

export async function verifyExtensions(): Promise<void> {
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
  const tick = async () => {for(let i=0;i<8;i++){await Promise.resolve();await host.flush();}};
  const tap = async (title: string) => {const button=[...root.querySelectorAll('button')].find(button=>button.textContent===title);assert(button,'missing button '+title);button!.click();await tick();};
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
  await host.destroy();assert(disposed===2,'dispose on page destroy');
  assert(host.diagnostics.length===0,JSON.stringify(host.diagnostics));root.remove();
}
