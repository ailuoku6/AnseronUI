import { DOMRenderer } from '../src/renderer.js';
import type { RenderCommand, RenderProps } from '@anseronui/protocol';

export async function verifyStyles(): Promise<void> {
  const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const original = window.matchMedia;
  const query = new EventTarget() as MediaQueryList;
  let dark = false;
  Object.defineProperty(query, 'matches', { get: () => dark });
  window.matchMedia = () => query;
  const root = document.createElement('div'); root.style.cssText = 'width:400px;height:400px'; document.body.append(root);
  let nativeUpdates = 0;
  const renderer = new DOMRenderer(root, () => {}, { Test: () => ({ element:document.createElement('div'), setProps() { nativeUpdates++; } }) });
  const base: RenderProps = { backgroundColor:'#ffffff', dmBackgroundColor:'#111111', borderColor:'#123456', dmBorderColor:'#abcdef', borderWidth:2, borderRadius:12, shadowColor:'#000000', dmShadowColor:'#ffffff', shadowOpacity:0.5, shadowRadius:8, shadowOffsetX:-2, shadowOffsetY:4 };
  const commands: RenderCommand[] = [];
  const create = (nodeId:number, kind:'View'|'Text'|'RichText'|'TextInput'|'Native'|'Video', props:RenderProps, parentId=0) => {
    commands.push({ type:'CreateNode', nodeId, kind, ...(kind === 'Native' ? { nativeName:'Test' } : {}) }, { type:'SetProps', nodeId, props }, { type:'InsertChild',nodeId,parentId,index:parentId === 0 ? 0 : nodeId-2 }, { type:'SetFrame',nodeId,frame:{ x:20,y:20+(nodeId-1)*40,width:300,height:32 } });
  };
  create(1,'View',base); create(2,'Text',{text:'Theme',color:'#112233',dmColor:'#ddeeff'},1);
  create(3,'RichText',{spans:JSON.stringify([{text:'tinted span',color:'#123456',dmColor:'#abcdef'},{text:'fallback',color:'#654321'}])},1);
  create(4,'TextInput',{ value:'declared',placeholder:'Placeholder',placeholderTextColor:'#666666',dmPlaceholderTextColor:'#aaaaaa',color:'#000000',dmColor:'#ffffff' },1);
  create(5,'Native',{},1);
  create(6,'Video',{playControl:'pause'},1);
  try {
    renderer.apply(1,commands);
    const card = renderer.getNode(1)!, text = renderer.getNode(2)!, rich = renderer.getNode(3)!, input = renderer.getNode(4)! as HTMLInputElement;
    assert(getComputedStyle(card).backgroundColor === 'rgb(255, 255, 255)','light background');
    assert(card.style.boxShadow.includes('16px') && card.style.boxShadow.includes('0.5'),'shadow radius/opacity');
    input.value = 'local composition'; input.dispatchEvent(new CompositionEvent('compositionstart'));
    const video = renderer.getNode(6)! as HTMLVideoElement;
    let mediaCommands = 0;
    video.pause = () => { mediaCommands++; };
    video.play = async () => { mediaCommands++; };
    const frame = card.getBoundingClientRect();
    dark = true; query.dispatchEvent(new Event('change'));
    assert(getComputedStyle(card).backgroundColor === 'rgb(17, 17, 17)','dark background');
    assert(getComputedStyle(card).borderColor === 'rgb(171, 205, 239)','dark border');
    assert(getComputedStyle(text).color === 'rgb(221, 238, 255)','dark text');
    assert(getComputedStyle(rich.children[0]).color === 'rgb(171, 205, 239)','dark span');
    assert(getComputedStyle(rich.children[1]).color === 'rgb(101, 67, 33)','span fallback');
    assert(input.style.getPropertyValue('--placeholder-color') === '#aaaaaa','dark placeholder');
    assert(card.style.boxShadow.includes('255, 255, 255'),'dark shadow color');
    assert(input.value === 'local composition','theme must preserve composing input');
    assert(nativeUpdates === 1,'theme must not replay native props');
    assert(mediaCommands === 0,'theme must not replay media playback controls');
    assert(card.getBoundingClientRect().width === frame.width,'theme must not affect layout');
    renderer.apply(2,[{type:'SetProps',nodeId:1,props:{backgroundColor:'#eeeeee'}}]);
    assert(getComputedStyle(card).backgroundColor === 'rgb(238, 238, 238)' && card.style.boxShadow === 'none','removed dark/shadow reset');
    dark = false; query.dispatchEvent(new Event('change'));
    assert(getComputedStyle(text).color === 'rgb(17, 34, 51)','light restored');
    assert(input.style.getPropertyValue('--placeholder-color') === '#666666','placeholder restored');
    renderer.dispose(); dark = true; query.dispatchEvent(new Event('change')); assert(root.children.length === 0,'disposed theme listener');
  } finally { renderer.dispose(); root.remove(); window.matchMedia = original; }
}
