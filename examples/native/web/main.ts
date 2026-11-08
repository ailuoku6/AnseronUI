import { BrowserHost, WasmRuntime } from '@anseronui/render-web';
import './style.css';
const container=document.querySelector<HTMLElement>('#app')!;
const status=document.querySelector<HTMLElement>('#status')!;
let host: BrowserHost | undefined;
let transition=Promise.resolve();
const routeStack: string[] = [];
function select(page: string) {
  transition=transition.then(async () => {
    await host?.destroy();
    const root=document.createElement('div'); root.className='surface';
    container.replaceChildren(root);
    const runtime=await WasmRuntime.load('/core.wasm');
    host=new BrowserHost(root,runtime,undefined,{
      router: async (method, args) => {
        const target = typeof args === 'object' && args !== null && 'page' in args ? String((args as { page: unknown }).page) : '';
        // Navigation replaces the current surface after the current Core event
        // settles. Resolving the module request first avoids re-entering the
        // transition chain from inside BrowserHost.flush().
        if (method === 'push') { if (!target) throw new Error('INVALID_ROUTE'); routeStack.push(target); setTimeout(() => { void select(target); }, 0); return null; }
        if (method === 'replace') { if (!target || routeStack.length === 0) throw new Error('INVALID_ROUTE'); routeStack[routeStack.length - 1] = target; setTimeout(() => { void select(target); }, 0); return null; }
        if (method === 'pop' || method === 'back') { if (routeStack.length <= 1) throw new Error('ROUTER_EMPTY'); routeStack.pop(); setTimeout(() => { void select(routeStack[routeStack.length - 1]); }, 0); return null; }
        if (method === 'current') return routeStack[routeStack.length - 1] ?? null;
        throw new Error('UNSUPPORTED_METHOD: ' + method);
      },
      modules: { device: (method) => {
        if (method !== 'info') throw new Error('UNSUPPORTED_METHOD: ' + method);
        return { platform: 'Web', version: navigator.userAgent };
      } },
      components: { DemoSwitch: ({document,emit}) => {
        const element=document.createElement('input'); element.type='checkbox';
        const change=()=>emit('change',{value:element.checked}); element.addEventListener('change',change);
        return { element, setProps: props => { element.checked=Boolean(props.value); },
          invoke: method => { if(method!=='toggle')throw new Error('UNSUPPORTED_METHOD'); element.checked=!element.checked; return {value:element.checked}; },
          dispose:()=>element.removeEventListener('change',change) };
      } }
    });
    await host.mount(page,root.clientWidth,root.clientHeight);
    status.textContent='Ready';
  }).catch(error=>{status.textContent=String(error);console.error(error);});
}
function selectRoot(page: string) { routeStack.splice(0, routeStack.length, page); select(page); }
document.querySelector('#counter')!.addEventListener('click',()=>selectRoot('counter'));
document.querySelector('#form')!.addEventListener('click',()=>selectRoot('async-form'));
document.querySelector('#components')!.addEventListener('click',()=>selectRoot('components'));
document.querySelector('#timers')!.addEventListener('click',()=>selectRoot('timers'));
document.querySelector('#extensions')!.addEventListener('click',()=>selectRoot('extensions'));
window.addEventListener('resize',()=>{const root=container.firstElementChild as HTMLElement|null;if(root)void host?.resize(root.clientWidth,root.clientHeight);});
window.addEventListener('keydown', async event => {
  if (event.key !== 'Escape' && event.key !== 'BrowserBack') return;
  if (await host?.handleBackPress()) { event.preventDefault(); return; }
  if (routeStack.length > 1) { event.preventDefault(); routeStack.pop(); select(routeStack[routeStack.length - 1]); }
});
selectRoot('counter');
