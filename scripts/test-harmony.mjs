/** Device acceptance test: run after building and starting examples/harmony-smoke. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
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
const checks = [];
const blocked = [];
let nodes = await expect('initial', 'smoke-count', 'Count: 0');
click(nodes, 'smoke-increment');
nodes = await expect('increment', 'smoke-count', 'Count: 1'); checks.push('native click → Core state → commit');
click(nodes, 'smoke-services');
nodes = await expect('services', 'smoke-status', 'services-pass'); checks.push('async timer + UTF-8 preferences + encrypted Asset storage round trip + device service');
const bounds = nodes.get('smoke-input').bounds.match(/\d+/g).map(Number);
for (const character of 'Harmony21') shell('uitest', 'uiInput', 'inputText', String((bounds[0] + bounds[2]) >> 1), String((bounds[1] + bounds[3]) >> 1), character);
nodes = await expect('input', 'smoke-echo', 'Input: Harmony21'); checks.push('controlled TextInput revision / change event');
click(nodes, 'smoke-increment');
nodes = await expect('keyboard-dismissed', 'smoke-count', 'Count: 2');
click(nodes, 'smoke-push');
nodes = await expect('details', 'smoke-detail', '路由参数');
assert.ok(nodes.get('smoke-detail').text.includes('"count":2'));
checks.push('router push + JSON params');
click(nodes, 'smoke-back');
nodes = await expect('retained', 'smoke-count', 'Count: 2');
assert.equal(nodes.get('smoke-echo').text, 'Input: Harmony21'); checks.push('router pop retains Core, input and page state');
click(nodes, 'smoke-parity');
nodes = await expect('parity', 'parity-title', 'Harmony parity');
click(nodes, 'parity-services');
nodes = await expect('parity-services', 'parity-status', 'parity-pass');
checks.push('subscription capabilities + durable background scheduling/cancellation + notification inbox + window metrics');
click(nodes, 'parity-details');
nodes = await expect('parity-covered', 'smoke-detail', 'parity');
click(nodes, 'smoke-back');
nodes = await expect('parity-visible', 'parity-lifecycle', 'Visible: 2');
checks.push('usePageEffect resumes retained page once after cover/pop');
shell('aa', 'start', '-a', 'EntryAbility', '-b', build.bundleName, '-U', 'anseronui://parity/warm');
nodes = await expect('parity-link', 'parity-link', 'Links: 1 anseronui://parity/warm');
shell('aa', 'start', '-a', 'EntryAbility', '-b', build.bundleName, '-U', 'anseronui://parity/warm');
nodes = await expect('parity-link-repeat', 'parity-link', 'Links: 2 anseronui://parity/warm');
checks.push('warm deep link subscription preserves repeated URLs');
click(nodes, 'parity-focus');
nodes = await expect('parity-focused', 'parity-focus-status', 'Focused: yes');
shell('uitest', 'uiInput', 'keyEvent', 'Back');
nodes = snapshot('parity-focus-dismissed');
checks.push('TextInput ref.focus dispatches native focus event');
swipe(nodes, 'parity-scroll');
nodes = await expect('parity-touch-owned', 'parity-touch-status', 'U:1 C:0 S:0');
click(nodes, 'parity-toggle-scroll');
nodes = await expect('parity-scroll-allowed', 'parity-toggle-scroll', 'Scroll allowed');
swipe(nodes, 'parity-scroll');
nodes = await expect('parity-scroll-native', 'parity-touch-status', 'U:0 C:1');
assert.ok(Number(nodes.get('parity-touch-status').text.match(/S:(\d+)/)?.[1]) > 0, 'Native scroll must move');
checks.push('touchAction none owns drag; auto transfers to native scroll with one cancel');
click(nodes, 'parity-notifications');
// Accept only the notification permission sheet initiated by this test action.
for (let attempt = 0; attempt < 12; attempt++) {
  nodes = snapshot('parity-notifications');
  const status = nodes.get('parity-notification-status')?.text ?? '';
  if (status === 'notification-pass' || status.includes('1700002')) break;
  for (const [id, node] of nodes) if (/^(允许|Allow)$/.test(node.text ?? '')) { click(nodes, id); break; }
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (nodes.get('parity-notification-status')?.text?.includes('1700002')) {
  blocked.push('Native reminder scheduling: OS error 1700002 (agent-reminder entitlement/quota); not counted as passed');
  checks.push('system notification permission granted; platform quota rejection preserved');
} else {
  nodes = await expect('parity-notification-result', 'parity-notification-status', 'notification-pass');
  checks.push('system notification permission + reminder schedule/cancel');
}
// Return to the retained root, then exercise media and the demo native plugin.
shell('uitest', 'uiInput', 'keyEvent', 'Back');
nodes = await expect('media-root', 'smoke-count', 'Count: 2');
click(nodes, 'smoke-media');
nodes = await expect('media-first-frame', 'media-first', 'displayed');
assert.equal(nodes.get('media-image').text, 'asset://showcase.png');
assert.equal(nodes.get('media-state').text, 'playing');
nodes = await expect('media-progress', 'media-time', 'Duration:8000');
const position = Number(nodes.get('media-time').text.match(/Time:(\d+)/)?.[1]);
assert.ok(position > 0 && position <= 8000, 'Video progress must use milliseconds');
checks.push('asset image source + actual video first frame + millisecond playback progress');
click(nodes, 'media-pause');
nodes = await expect('media-paused', 'media-state', 'paused');
const pausedTime = nodes.get('media-time').text;
await new Promise(resolve => setTimeout(resolve, 650));
nodes = snapshot('media-still-paused'); assert.equal(nodes.get('media-time').text, pausedTime);
click(nodes, 'media-cover'); nodes = await expect('media-covered', 'smoke-detail', 'media');
click(nodes, 'smoke-back'); nodes = await expect('media-return-paused', 'media-state', 'paused');
click(nodes, 'media-pause'); nodes = await expect('media-resumed', 'media-state', 'playing');
click(nodes, 'media-cover'); nodes = await expect('media-playing-covered', 'smoke-detail', 'media');
click(nodes, 'smoke-back'); nodes = await expect('media-return-playing', 'media-state', 'playing');
checks.push('video pause stays paused across cover/pop; playing video resumes');
click(nodes, 'media-extension'); nodes = await expect('media-native-ref', 'media-extension-status', 'harmony-ref on');
click(nodes, 'media-switch'); nodes = await expect('media-native-event', 'media-extension-status', 'event off');
checks.push('native component props + ref method + native change event + custom module');
shell('snapshot_display', '-f', '/data/local/tmp/anseronui-acceptance.jpeg');
run(['-t', device, 'file', 'recv', '/data/local/tmp/anseronui-acceptance.jpeg', join(out, 'screen.jpeg')]);
const result = { device, api: Number(shell('param', 'get', 'const.ohos.apiversion').trim()), checks, blocked, passed: checks.length, at: new Date().toISOString() };
writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
