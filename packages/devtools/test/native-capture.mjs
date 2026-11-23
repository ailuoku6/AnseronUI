// Device acceptance, after installing the Debug native fixture and starting
// `anseronui devtools`. Pixel checks use the PNG returned by the real host.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, join} from 'node:path';
import {parseArgs} from 'node:util';
import {PNG} from 'pngjs';
import {adaptSnapshot} from '../ui/src/adapter.ts';
import {hitTestNode, visualFrame} from '../ui/src/tree.ts';

const {positionals:[platform],values} = parseArgs({allowPositionals:true,options:{
  server:{type:'string',default:'http://127.0.0.1:8091'},pager:{type:'string'},out:{type:'string'},
}});
assert.ok(['ios','android','harmony'].includes(platform),'Usage: npm run test:devtools:native -- <ios|android|harmony> [--pager ID]');
const base = new URL('/__anseronui_devtools/',values.server);
const get = async path => {
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,`HTTP ${response.status}`);
  return response.json();
};
let state;
for(let attempt=0;attempt<40&&!state;attempt++) {
  const sessions=(await get('api/sessions')).sessions;
  for(const session of sessions) {
    if(session.stale || values.pager && session.pagerId!==values.pager) continue;
    const candidate=await get('api/session?pagerId='+encodeURIComponent(session.pagerId));
    if(candidate.platform===platform && candidate.page==='devtools-native') {state=candidate;break;}
  }
  if(!state)await new Promise(resolve=>setTimeout(resolve,250));
}
assert.ok(state,'Start the devtools-native fixture on '+platform+' first');
const pagerId=state.pagerId;
const refresh=async()=>state=await get('api/session?pagerId='+encodeURIComponent(pagerId));
const command=async command=>{
  const response=await fetch(new URL('api/command',base),{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000),
    body:JSON.stringify({pagerId,command}),
  });
  const result=await response.json();
  assert.ok(response.ok&&result.ok,JSON.stringify(result));
  return result;
};
const out=resolve(values.out??'.verification/devtools-native-'+platform);
await mkdir(out,{recursive:true});
async function save(name,shot) {
  assert.ok(shot?.data?.startsWith('data:image/png;base64,'),'real PNG screenshot');
  const path=join(out,name+'.png');
  const bytes=Buffer.from(shot.data.split(',')[1],'base64');
  await writeFile(path,bytes);
  if(platform==='ios') {
    // UIKit may emit Display P3. pngjs reads raw channels, so convert before
    // comparing to the sRGB color sent through the rendering protocol.
    assert.equal(process.platform,'darwin','iOS pixel checks require macOS ColorSync');
    const converted=join(out,name+'-srgb.png');
    execFileSync('/usr/bin/sips',['--matchTo','/System/Library/ColorSync/Profiles/sRGB Profile.icc',path,'--out',converted],{stdio:'pipe'});
    return PNG.sync.read(await readFile(converted));
  }
  return PNG.sync.read(bytes);
}
function greenRatio(png,rect,shot) {
  const sx=png.width/shot.ow,sy=png.height/shot.oh;
  let green=0,total=0;
  for(let y=Math.max(0,Math.ceil((rect[1]-shot.oy)*sy));y<Math.min(png.height,(rect[1]+rect[3]-shot.oy)*sy);y++) {
    for(let x=Math.max(0,Math.ceil((rect[0]-shot.ox)*sx));x<Math.min(png.width,(rect[0]+rect[2]-shot.ox)*sx);x++) {
      const i=(y*png.width+x)*4;total++;
      if(Math.abs(png.data[i]-25)<12&&Math.abs(png.data[i+1]-211)<12&&Math.abs(png.data[i+2]-123)<12&&png.data[i+3]>240) green++;
    }
  }
  assert.ok(total>100&&green>total*.3,JSON.stringify({rect,green,total}));
  return {green,total};
}

for(let i=0;i<30&&!state.nodes.some(n=>n.props.testID==='devtools-ready'&&n.props.text==='capture-ready');i++) {
  await new Promise(resolve=>setTimeout(resolve,200));await refresh();
}
assert.ok(state.nodes.some(n=>n.props.testID==='devtools-ready'&&n.props.text==='capture-ready'),'fixture scroll completed');
const scroller=state.nodes.find(n=>n.props.testID==='devtools-scroll');
assert.ok(scroller?.scrollOffset?.[1]>=119,'host scroll event reported');
const node=state.nodes.find(n=>n.props.testID==='devtools-target');
assert.ok(node,'fixture target');
const original=node.props.backgroundColor??'transparent';
try {
  await command({type:'set',id:node.id,target:'p',key:'backgroundColor',value:'#19d37b'});
  await command({type:'shot',id:0,sample:1});await refresh();
  const png=await save('page',state.screenshot),shot=state.screenshot;
  const map=new Map(adaptSnapshot(state).nodes.map(n=>[n.id,n]));
  const frame=visualFrame(map,map.get(node.id));
  assert.ok(frame&&frame[1]<node.rect.y-100,'scroll changes visual position');
  const pixels=greenRatio(png,frame,shot);
  assert.equal(hitTestNode(map,frame[0]+frame[2]/2,frame[1]+frame[3]/2)?.id,node.id,'screenshot point selects host node');
  let component=map.get(node.id);
  while(component&&!component.cv)component=map.get(component.pid);
  assert.equal(component?.n,'CaptureCard','component selection resolves nearest owner');
  await command({type:'shot',id:node.id,sample:2});await refresh();
  const crop=await save('node',state.screenshot),rect=state.screenshot;
  for(const [actual,expected] of [[rect.ox,frame[0]],[rect.oy,frame[1]],[rect.ow,frame[2]],[rect.oh,frame[3]]])assert.ok(Math.abs(actual-expected)<2,JSON.stringify({rect:{...rect,data:undefined},frame}));
  greenRatio(crop,frame,rect);
  assert.ok(Math.abs(crop.width/crop.height-frame[2]/frame[3])<.2,'node capture aspect ratio');
  await command({type:'shot',id:0,sample:2});await refresh();
  const sampled=await save('page-sampled',state.screenshot);
  assert.ok(sampled.width<=png.width&&sampled.height<=png.height,'sampled image is bounded');
  await writeFile(join(out,'state.json'),JSON.stringify(state));
  const result={platform,pagerId,nodeId:node.id,component:component.n,scrollOffset:scroller.scrollOffset,frame,pixels:[png.width,png.height],...pixels,crop:[crop.width,crop.height]};
  await writeFile(join(out,'result.json'),JSON.stringify(result,null,2));
  console.log('PASS: native scrolled page/node PNG pixels, sampling and element/component hit testing',result);
} finally {
  await command({type:'set',id:node.id,target:'p',key:'backgroundColor',value:original});
}
