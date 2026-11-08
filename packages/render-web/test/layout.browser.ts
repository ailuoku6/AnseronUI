import { BrowserReferenceHost } from '../src/index.js';
import { componentsPage } from '../../../examples/components/page.js';

export async function verifyLayout(): Promise<void> {
  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:390px;height:844px'; document.body.append(root);
  const host = new BrowserReferenceHost(root, componentsPage);
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const node = (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  const tick = async () => { for (let i=0;i<10;i++) { await Promise.resolve(); await host.flush(); } };
  const tap = async (id: string) => { node(id).click(); await tick(); };
  const near = (a: number, b: number) => assert(Math.abs(a-b)<1, `${a} != ${b}`);
  try {
    await host.mount('components',390,844); await tick();
    const ball=node('floating-ball'); const initial=ball.getBoundingClientRect();
    const pointer = async (type: string, x: number, y: number) => {
      node('floating-ball-label').dispatchEvent(new PointerEvent(type, {bubbles:true,pointerId:7,pointerType:'touch',clientX:x,clientY:y})); await tick();
    };
    await pointer('pointerdown',initial.x+28,initial.y+28);
    await pointer('pointermove',initial.x-42,initial.y+158);
    near(ball.getBoundingClientRect().x,initial.x-70); near(ball.getBoundingClientRect().y,initial.y+130);
    await pointer('pointerup',initial.x-42,initial.y+158);
    assert(node('floating-ball-label').textContent==='拖动','drag release');
    const fixed=ball.getBoundingClientRect();
    const scroll=node('component-scroll'); scroll.scrollTop=300;
    near(ball.getBoundingClientRect().y,fixed.y); assert(scroll.scrollTop>0,'content scrolls independently');
    assert(ball.style.touchAction==='none','native scroll ownership');
    await tap('layout-mode-toggle');
    near(node('layout-between').getBoundingClientRect().width,280);
    near(node('layout-grow-b').getBoundingClientRect().width,2*node('layout-grow-a').getBoundingClientRect().width);
    near(node('layout-wrap').getBoundingClientRect().height,88);
    assert(node('layout-clip').style.overflow==='hidden','overflow clipping');
    assert(node('layout-hidden').style.visibility==='hidden','hidden slot');
    await tap('layout-width-toggle');
    near(node('layout-between').getBoundingClientRect().width,220);
    near(node('layout-wrap').getBoundingClientRect().height,128);
    near(ball.getBoundingClientRect().y,fixed.y);
    await pointer('pointerdown',fixed.x+28,fixed.y+28);
    await pointer('pointermove',2000,2000);
    await pointer('pointercancel',2000,2000);
    near(parseFloat(ball.style.left),326); near(parseFloat(ball.style.top),780);
    await host.resize(320,500); await tick();
    near(parseFloat(ball.style.left),256); near(parseFloat(ball.style.top),436);
    assert(host.diagnostics.length===0,JSON.stringify(host.diagnostics));
  } finally { await host.destroy(); root.remove(); }
}
