/** Main demo acceptance: build anseronui.config.json and install before running. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { harmonyTools, selectHarmony } from './harmony-app.mjs';
const { hdc } = harmonyTools();
function run(args) {
  const result = spawnSync(hdc, args, { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const device = selectHarmony(run(['list', 'targets']), process.argv[2]);
const out = resolve('.verification/harmony/acceptance');
mkdirSync(out, { recursive: true });
const shell = (...args) => run(['-t', device, 'shell', ...args]);
const build = JSON.parse(readFileSync(resolve('.verification/harmony/build.json'), 'utf8'));
shell('aa', 'force-stop', build.bundleName);
shell('aa', 'start', '-a', 'EntryAbility', '-b', build.bundleName);
function snapshot(name) {
  const remote = '/data/local/tmp/anseronui-acceptance.json';
  shell('uitest', 'dumpLayout', '-p', remote);
  const path = join(out, name + '.json');
  run(['-t', device, 'file', 'recv', remote, path]);
  const nodes = new Map();
  function visit(node) {
    if (node.attributes) nodes.set(node.attributes.id || 'accessibility:' + node.attributes.accessibilityId, node.attributes);
    for (const child of node.children ?? []) visit(child);
  }
  visit(JSON.parse(readFileSync(path, 'utf8')));
  return nodes;
}
async function expect(name, id, expected) {
  const until = Date.now() + 15000;
  let nodes;
  do {
    nodes = snapshot(name);
    if (nodes.get(id)?.text?.replace(/\s/g, '').includes(expected.replace(/\s/g, ''))) return nodes;
    await new Promise(resolve => setTimeout(resolve, 300));
  } while (Date.now() < until);
  assert.fail(`${id}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(nodes.get(id))}`);
}
function click(nodes, id) {
  const bounds = nodes.get(id)?.bounds.match(/-?\d+/g).map(Number);
  assert.ok(bounds?.length === 4, 'Missing control: ' + id);
  shell('uitest', 'uiInput', 'click', String(Math.round((bounds[0] + bounds[2]) / 2)), String(Math.round((bounds[1] + bounds[3]) / 2)));
}
function swipe(nodes, id) {
  const b = nodes.get(id)?.bounds.match(/-?\d+/g).map(Number);
  assert.ok(b?.length === 4, 'Missing swipe region: ' + id);
  const x = Math.round((b[0] + b[2]) / 2);
  shell('uitest', 'uiInput', 'swipe', String(x), String(b[3] - 50), String(x), String(b[1] + 50), '600');
}
async function tab(page) {
  for(let i=0;i<8;i++) {
    const nodes=snapshot('main-tabs');
    for(const [id,n] of nodes) if(n.text===page) {
      const b=n.bounds.match(/-?\d+/g).map(Number);
      if(b[2]-b[0]>120) {click(nodes,id);return;}
    }
    const pages = ['appearance','counter','async-form','components','extensions','timers','virtual-list'];
    const tabs = [...nodes.values()].filter(n => pages.includes(n.text)).map(n => n.bounds.match(/-?\d+/g).map(Number));
    if (!tabs.length) {
      if ([...nodes.keys()].some(id => id.startsWith('gesture_dock'))) shell('uitest','uiInput','keyEvent','Back');
      await new Promise(resolve => setTimeout(resolve, 300));
      continue;
    }
    const left = Math.min(...tabs.map(b => b[0])), right = Math.max(...tabs.map(b => b[2]));
    const y = Math.round((tabs[0][1] + tabs[0][3]) / 2);
    // Stay away from system edge gestures (sidebar/back).
    shell('uitest','uiInput','swipe',String(Math.round(left+(right-left)*.82)),String(y),String(Math.round(left+(right-left)*.18)),String(y),'600');
  }
  throw new Error('Missing tab '+page);
}
await new Promise(resolve=>setTimeout(resolve,1500));
await tab('components');
// The accessibility tree retains text even when maxLines=0 paints nothing.
// Check actual pixels as well as Core's collapsed/expanded frame heights.
let measurement = await expect('text-measure-ready','text-measure-toggle','展开文本');
const textFrame = nodes => nodes.get('text-measure-preview').bounds.match(/-?\d+/g).map(Number);
const collapsedText = textFrame(measurement);
click(measurement,'text-measure-toggle');
measurement = await expect('text-measure-expanded','text-measure-toggle','收起文本');
measurement = await reveal('text-measure-preview');
const expandedText = textFrame(measurement);
assert.ok(expandedText[3]-expandedText[1]>collapsedText[3]-collapsedText[1],'Expanded paragraph grows beyond two lines');
const textScreenshot = join(out,'text-measure-expanded.jpeg');
shell('snapshot_display','-f','/data/local/tmp/text-measure-expanded.jpeg');
run(['-t',device,'file','recv','/data/local/tmp/text-measure-expanded.jpeg',textScreenshot]);
const textPng = join(out,'text-measure-expanded.png');
const textConversion = spawnSync('/usr/bin/sips',['-s','format','png',textScreenshot,'--out',textPng],{encoding:'utf8'});
assert.equal(textConversion.status,0,textConversion.stderr);
const textPixels = PNG.sync.read(readFileSync(textPng));
let ink = 0;
for(let y=Math.max(0,expandedText[1]);y<Math.min(textPixels.height,expandedText[3]);y++) {
  for(let x=Math.max(0,expandedText[0]);x<Math.min(textPixels.width,expandedText[2]);x++) {
    const offset=(y*textPixels.width+x)*4;
    if(textPixels.data[offset]<100&&textPixels.data[offset+1]<100&&textPixels.data[offset+2]<100)ink++;
  }
}
assert.ok(ink>100,'Expanded paragraph must paint visible text, not an empty frame');
click(measurement,'text-measure-toggle');
measurement = await expect('text-measure-recollapsed','text-measure-toggle','展开文本');
const recollapsedText = textFrame(measurement);
assert.equal(recollapsedText[3]-recollapsedText[1],collapsedText[3]-collapsedText[1],'Collapse restores the two-line height');
let buttons=await expect('main-buttons-initial','component-count','点击: 0');
const frame=id=>buttons.get(id)?.bounds.match(/-?\d+/g).map(Number);
for(let attempt=0;attempt<6;attempt++) {
  const action=frame('component-increment'), viewport=frame('component-scroll');
  if(action && viewport && action[1]>=viewport[1] && action[3]<=viewport[3]) break;
  swipe(buttons,'component-scroll'); buttons=snapshot('main-buttons-visible');
}
assert.equal(buttons.get('component-disabled')?.enabled, 'false');
assert.ok(Math.abs(Number(buttons.get('component-disabled')?.opacity)-0.4)<0.01, 'Shared disabled opacity');
const fixed=frame('animation-mode-toggle');
// Check the shared explicit aspect ratio without assuming display density.
assert.ok(Math.abs((fixed[2]-fixed[0])/(fixed[3]-fixed[1])-52/44)<0.03,'Shared fixed button size');
click(buttons,'component-increment');
buttons=await expect('main-buttons-click','component-count','点击: 1');
click(buttons,'component-disabled'); buttons=snapshot('main-buttons-disabled');
assert.equal(buttons.get('component-count').text,'点击: 1');
assert.ok(!buttons.get('component-event').text.includes('disabled ERROR'));
shell('snapshot_display','-f','/data/local/tmp/shared-buttons-harmony.jpeg');
run(['-t',device,'file','recv','/data/local/tmp/shared-buttons-harmony.jpeg',join(out,'shared-buttons-harmony.jpeg')]);
async function reveal(id) {
  for (let attempt = 0; attempt < 18; attempt++) {
    const nodes = snapshot('main-reveal');
    const bounds = key => nodes.get(key)?.bounds.match(/-?\d+/g).map(Number);
    const target = bounds(id), viewport = bounds('component-scroll');
    assert.ok(viewport, 'Missing component scroll viewport');
    if (target && target[1] >= viewport[1] + 8 && target[3] <= viewport[3] - 8) return nodes;
    const x = Math.round((viewport[0] + viewport[2]) / 2), height = viewport[3] - viewport[1];
    const down = !target || target[3] > viewport[3] - 8;
    const start = viewport[1] + height * (down ? 0.78 : 0.3), end = viewport[1] + height * (down ? 0.3 : 0.78);
    shell('uitest', 'uiInput', 'swipe', String(x), String(Math.round(start)), String(x), String(Math.round(end)), '500');
  }
  assert.fail('Could not reveal ' + id);
}
let media = await reveal('video-play');
click(media, 'video-play');
await expect('main-video-playing', 'video-state', 'playing');
await expect('main-video-frame', 'video-progress', '首帧: yes');
media = await reveal('component-video');
const videoBounds = media.get('component-video').bounds.match(/-?\d+/g).map(Number);
shell('snapshot_display', '-f', '/data/local/tmp/harmony-video-rounded.jpeg');
const videoScreenshot = join(out, 'harmony-video-rounded.jpeg');
run(['-t',device,'file','recv','/data/local/tmp/harmony-video-rounded.jpeg',videoScreenshot]);
const converted = spawnSync('/usr/bin/sips', ['-s','format','png',videoScreenshot,'--out',join(out,'harmony-video-rounded.png')], {encoding:'utf8'});
assert.equal(converted.status, 0, converted.stderr);
const pixels = PNG.sync.read(readFileSync(join(out,'harmony-video-rounded.png')));
const rgb = (x,y) => [...pixels.data.subarray((Math.round(y)*pixels.width+Math.round(x))*4,(Math.round(y)*pixels.width+Math.round(x))*4+3)];
const distance = (a,b) => Math.max(...a.map((channel,index) => Math.abs(channel-b[index])));
// Sample all four corners against the white card, while playback has a real first frame.
// A square Surface plane fails this even if the outer View's background is rounded.
const [vx,vy,vr,vb] = videoBounds;
const cardColor = rgb(vx-8,vy+Math.round((vb-vy)/2));
for (const [x,y] of [[vx+1,vy+1],[vr-2,vy+1],[vx+1,vb-2],[vr-2,vb-2]]) {
  assert.ok(distance(rgb(x,y),cardColor)<35, 'Video corner must reveal the card: '+JSON.stringify({x,y,pixel:rgb(x,y),cardColor}));
}
assert.ok(distance(rgb((vx+vr)/2,vy+3),cardColor)>60, 'Video top edge must retain media/background inside its rounded clip');
let composition = await reveal('composition-rerender');
await expect('main-composition-ready','composition-ready','render prop: ready');
click(composition,'composition-increment');
await expect('main-composition-hook','composition-counter','Hook: 3 / double: 6');
composition=snapshot('main-composition-before-hoc'); click(composition,'composition-hoc');
await expect('main-composition-hoc','composition-hoc','');
composition=snapshot('main-composition-before-parent'); click(composition,'composition-rerender');
composition=await expect('main-composition-retained','composition-counter','Hook: 3 / double: 6');
assert.ok([...composition.values()].some(node=>node.text==='HOC: 1'),'HOC Hook state survives parent rerender');
assert.ok([...composition.values()].some(node=>node.text==='父组件更新: 1'),'Parent rerender executed');
assert.equal(composition.get('composition-child')?.text,'children slot');
shell('snapshot_display','-f','/data/local/tmp/harmony-composition.jpeg');
run(['-t',device,'file','recv','/data/local/tmp/harmony-composition.jpeg',join(out,'harmony-composition.jpeg')]);
await tab('appearance');
let appearance=await expect('main-appearance','appearance-showcase','');
appearance=await expect('main-appearance-mode','appearance-mode','主题:');
const mode=appearance.get('appearance-mode').text.includes('dark')?'dark':'light';
appearance=await expect('main-appearance-source','appearance-image-source','asset://theme-'+mode+'.png');
assert.ok(appearance.get('appearance-image-layout')?.text.includes('90×45'),'onLayout reports shared image size');
const imageBounds=appearance.get('appearance-image')?.bounds.match(/-?\d+/g).map(Number);
const modeBounds=appearance.get('appearance-mode')?.bounds.match(/-?\d+/g).map(Number);
const imageScale=(imageBounds[2]-imageBounds[0])/90;
assert.ok(Math.abs((modeBounds[3]-modeBounds[1])/imageScale-20)<1,'lineHeight determines native text frame');
shell('snapshot_display','-f','/data/local/tmp/appearance-capabilities.jpeg');
run(['-t',device,'file','recv','/data/local/tmp/appearance-capabilities.jpeg',join(out,'appearance-capabilities.jpeg')]);
const shadowConverted=spawnSync('/usr/bin/sips',['-s','format','png',join(out,'appearance-capabilities.jpeg'),'--out',join(out,'appearance-capabilities.png')],{encoding:'utf8'});
assert.equal(shadowConverted.status,0,shadowConverted.stderr);
const shadowPixels=PNG.sync.read(readFileSync(join(out,'appearance-capabilities.png')));
const shadowPixel=(x,y)=>[...shadowPixels.data.subarray((Math.round(y)*shadowPixels.width+Math.round(x))*4,(Math.round(y)*shadowPixels.width+Math.round(x))*4+3)];
for (const [cardId, label] of [['blue-shadow-card', '蓝色外阴影'], ['purple-shadow-card', '紫色外阴影']]) {
  const card=appearance.get(cardId)?.bounds.match(/-?\d+/g).map(Number);
  const text=[...appearance.values()].find(node=>node.text===label)?.bounds.match(/-?\d+/g).map(Number);
  assert.ok(card && text, 'Missing shadow card or label: '+cardId);
  assert.ok(text[2]-text[0] < card[2]-card[0]-20, 'Short label must preserve intrinsic width: '+label);
  // Core rounds logical frames before ArkUI converts them to physical pixels;
  // allow a four-pixel center delta on the high-density emulator.
  assert.ok(Math.abs((text[0]+text[2])-(card[0]+card[2])) / 2 <= 4, 'Label must be horizontally centered: '+label);
  const centerX=(card[0]+card[2])/2;
  const near=shadowPixel(centerX,card[3]+4*imageScale),far=shadowPixel(centerX,card[3]+14*imageScale);
  assert.ok(distance(near,far)>12,'Shadow must extend in logical units beyond a thin physical-pixel outline: '+JSON.stringify({cardId,near,far,imageScale}));
}
await tab('extensions');
let nodes=await expect('main-extensions','extension-value','off');
click(nodes,'extension-switch');nodes=await expect('main-native-event','extension-value','on');
for(const [id,n] of nodes)if(n.text==='读取平台信息'){click(nodes,id);break;}
nodes=await expect('main-native-module','extension-platform','harmony');
await tab('virtual-list');
nodes=snapshot('main-list');
assert.ok(nodes.has('variable-list'),'VirtualList mounted');
click(nodes,'list-jump');
const until=Date.now()+20000;
do {nodes=snapshot('main-list-deep');if(nodes.has('list-row-4000'))break;await new Promise(resolve=>setTimeout(resolve,250));} while(Date.now()<until);
assert.ok(nodes.has('list-row-4000'),'scrollToIndex mounted row 4000');
const rows=[...nodes.keys()].filter(id=>id.startsWith('list-row-'));
assert.ok(rows.length<100,'VirtualList bounds mounted row count');
click(nodes,'list-prepend');
nodes=snapshot('main-list-prepend');assert.ok([...nodes.keys()].some(id=>/^list-row-39[89][0-9]$|^list-row-40[01][0-9]$/.test(id)),'prepend retained deep window');
const result={appearance:mode,checks:['text measurement expand paints text and collapse restores two lines','shared primitive Button geometry, click and disabled guard','playing video first frame and four rounded corners in screenshot','custom Hook, HOC, component/element/render/children props and retained state','appearance subscription, dmSrc native load, lineHeight and onLayout frame','shadow density, visible outer halo and horizontally centered labels','main extensions native change and custom module','5000-row VirtualList jump to row 4000','bounded mounted rows and prepend retains deep window'],mountedRows:rows.length,at:new Date().toISOString()};
writeFileSync(join(out,'main-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
