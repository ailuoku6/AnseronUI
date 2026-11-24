/** Build/install the MAIN demo with ANSERONUI_SCROLL_TRACE=1 before running. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { harmonyTools, selectHarmony } from './harmony-app.mjs';
import { verifyHarmonyScrollTrace } from './testing/harmony-scroll-trace.mjs';

const { hdc } = harmonyTools();
function run(args) {
  const result = spawnSync(hdc, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(!/^\[Fail\]/m.test(result.stdout), result.stdout);
  return result.stdout;
}
const device = selectHarmony(run(['list', 'targets']), process.argv[2]);
const shell = (...args) => run(['-t', device, 'shell', ...args]);
const out = resolve('.verification/harmony/virtual-list');
mkdirSync(out, { recursive: true });
const build = JSON.parse(readFileSync(resolve('.verification/harmony/build.json'), 'utf8'));
shell('aa', 'force-stop', build.bundleName);
shell('aa', 'start', '-a', build.ability, '-b', build.bundleName);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounds = node => node?.bounds.match(/-?\d+/g).map(Number);
function snapshot(name) {
  const remote = '/data/local/tmp/anseronui-virtual-list.json', file = join(out, name + '.json');
  shell('uitest', 'dumpLayout', '-p', remote);
  run(['-t', device, 'file', 'recv', remote, file]);
  const nodes = [];
  function visit(node) { if (node.attributes) nodes.push(node.attributes); for (const child of node.children ?? []) visit(child); }
  visit(JSON.parse(readFileSync(file, 'utf8')));
  return nodes;
}
const find = (nodes, id) => nodes.find(node => node.id === id);
function click(node) {
  const b = bounds(node); assert.ok(b?.length === 4, 'Missing click target');
  shell('uitest', 'uiInput', 'click', String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2)));
}
async function listPage() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const nodes = snapshot('tabs');
    if (find(nodes, 'variable-list')) return nodes;
    const tab = nodes.find(node => node.text === 'virtual-list' && bounds(node)[2] - bounds(node)[0] > 120);
    if (tab) { click(tab); await pause(300); continue; }
    const tabs = nodes.filter(node => ['appearance', 'counter', 'async-form', 'components', 'extensions', 'timers', 'virtual-list'].includes(node.text));
    assert.ok(tabs.length, 'Main demo tabs missing (install anseronui.config.json)');
    const left = Math.min(...tabs.map(node => bounds(node)[0])), right = Math.max(...tabs.map(node => bounds(node)[2]));
    const y = Math.round((bounds(tabs[0])[1] + bounds(tabs[0])[3]) / 2);
    shell('uitest', 'uiInput', 'swipe', String(Math.round(left + (right - left) * .82)), String(y), String(Math.round(left + (right - left) * .18)), String(y), '600');
  }
  assert.fail('Could not open VirtualList page');
}
await pause(1200);
let nodes = await listPage();
click(find(nodes, 'list-jump'));
for (let attempt = 0; attempt < 30; attempt++) {
  await pause(200); nodes = snapshot('deep');
  if (find(nodes, 'list-row-4000')) break;
}
assert.ok(find(nodes, 'list-row-4000'), 'Deep jump did not reach row 4000');
const pid = shell('pidof', build.bundleName).trim();
assert.match(pid, /^\d+$/, 'Need exactly one demo process');
let log;
try {
  const viewport = bounds(find(nodes, 'variable-list'));
  const x = Math.round((viewport[0] + viewport[2]) / 2), height = viewport[3] - viewport[1];
  // Downward finger swipes reveal unmeasured earlier rows. Mix drag/fling speeds
  // and reverse direction to exercise measurement during native inertia.
  for (const [index, [direction, speed]] of [[-1,1800],[-1,10000],[-1,10000],[1,10000],[-1,10000],[1,10000],[-1,1800],[-1,10000]].entries()) {
    const start = Math.round(viewport[1] + height * (direction < 0 ? .25 : .75));
    const end = Math.round(viewport[1] + height * (direction < 0 ? .75 : .25));
    shell('uitest', 'uiInput', 'swipe', String(x), String(start), String(x), String(end), String(speed));
    nodes = snapshot('swipe-' + index);
    const rows = nodes.filter(node => /^list-row-\d+$/.test(node.id));
    assert.ok(rows.length > 0 && rows.length < 100, 'VirtualList must remain visible and bounded');
  }
  await pause(500);
  nodes = snapshot('before-prepend');
  const firstFull = nodes.filter(node => /^list-row-\d+$/.test(node.id) && bounds(node)[1] > viewport[1] + 4 && bounds(node)[3] < viewport[3] - 4)
    .sort((a, b) => bounds(a)[1] - bounds(b)[1])[0];
  assert.ok(firstFull, 'Need a full visible row for idle anchoring checks');
  const rowID = firstFull.id, before = bounds(firstFull);
  click(find(nodes, 'list-prepend')); await pause(400);
  nodes = snapshot('after-prepend');
  assert.ok(Math.abs(bounds(find(nodes, rowID))[1] - before[1]) <= 4, 'Prepend moved the retained visible row');
  const rowBounds = bounds(find(nodes, rowID));
  const button = nodes.find(node => node.text === '展开' && bounds(node)[1] > rowBounds[1] && bounds(node)[3] <= rowBounds[3]);
  assert.ok(button, 'Missing visible expand button'); click(button); await pause(400);
  nodes = snapshot('after-expand');
  const expanded = bounds(find(nodes, rowID));
  assert.ok(Math.abs(expanded[1] - rowBounds[1]) <= 4, 'Expanding a visible row moved its top');
  assert.ok(expanded[3] - expanded[1] > rowBounds[3] - rowBounds[1] + 20, 'Expand did not change row height');
  const collapse = nodes.find(node => node.text === '收起' && bounds(node)[1] > expanded[1] && bounds(node)[3] <= expanded[3]);
  assert.ok(collapse, 'Missing visible collapse button'); click(collapse); await pause(400);
  nodes = snapshot('after-collapse');
  assert.ok(Math.abs(bounds(find(nodes, rowID))[1] - rowBounds[1]) <= 4, 'Collapsing a visible row moved its top');
} finally {
  log = shell('hilog', '-x', '-T', 'AnseronScroll', '-P', pid);
  writeFileSync(join(out, 'native-scroll.log'), log);
}
const result = { device, ...verifyHarmonyScrollTrace(log), checks: ['deep jump', 'reverse drag and fling', 'rapid direction changes', 'bounded rows and viewport coverage', 'prepend retains anchor', 'expand/collapse retains anchor'], at: new Date().toISOString() };
writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
