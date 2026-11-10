/// <reference types="vite/client" />
import nativeWorkerURL from './native-worker?worker&url';
import { BrowserHost, BrowserPageStack, WasmRuntime } from '@anseronui/render-web';
import './style.css';
const container=document.querySelector<HTMLElement>('#app')!;
const status=document.querySelector<HTMLElement>('#status')!;
const nativeServices = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register(nativeWorkerURL, { type: 'module' }).then(async registration => {
      await navigator.serviceWorker.ready; return { registration, backgroundIdentifiers: ['org.anseronui.demo.refresh'] };
    }).catch(() => ({}))
  : Promise.resolve({});
const stack = new BrowserPageStack(container, async (root, page, router) => {
    const runtime=await WasmRuntime.load('/core.wasm');
    const host=new BrowserHost(root,runtime,undefined,{
      services: await nativeServices,
      router,
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
    return host;
}, error => { status.textContent=String(error); console.error(error); });
const router = stack.router;
function selectRoot(page: string) { router.load(page); }
document.querySelector('#counter')!.addEventListener('click',()=>selectRoot('counter'));
document.querySelector('#form')!.addEventListener('click',()=>selectRoot('async-form'));
document.querySelector('#components')!.addEventListener('click',()=>selectRoot('components'));
document.querySelector('#timers')!.addEventListener('click',()=>selectRoot('timers'));
document.querySelector('#extensions')!.addEventListener('click',()=>selectRoot('extensions'));
window.addEventListener('resize',()=>{ void stack.resize(); });
window.addEventListener('keydown', async event => {
  if (event.key !== 'Escape' && event.key !== 'BrowserBack') return;
  if (await stack.handleBackPress()) event.preventDefault();
});
selectRoot('counter');
