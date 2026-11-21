import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';

const { HarmonyEvents } = loadETS('HarmonyEvents');
test('subscription teardown rejects every poll even when a system unsubscribe fails', async () => {
  const events = new HarmonyEvents(), stopped = [];
  events.onChange = (module, active) => { if (!active) { stopped.push(module); throw new Error('unsubscribe'); } };
  const first = assert.rejects(events.next('1', 'location'), /CANCELLED/);
  const second = assert.rejects(events.next('2', 'network'), /CANCELLED/);
  events.dispose(); await Promise.all([first, second]);
  assert.deepEqual(stopped, ['location', 'network']); events.dispose(); assert.equal(stopped.length, 2);
});
test('page stack destroys every host after hide or destroy fails', () => {
  const { HarmonyPageStack } = loadETS('HarmonyPageStack'), released = [];
  let disposing = false;
  const stack = new HarmonyPageStack(['home','details'], route => ({
    setVisible() { if (disposing) throw new Error('hide'); },
    destroy() { released.push(route.page); if (route.page === 'home') throw new Error('destroy'); },
  }));
  stack.load('home'); stack.navigate(stack.current(), 'push', 'details'); disposing = true;
  stack.destroy(); assert.deepEqual(released, ['home','details']); assert.equal(stack.entries.length, 0);
  stack.destroy(); assert.equal(released.length, 2);
});
test('subscriptions attach once, cancel on last close, coalesce state and reject after disposal', async () => {
  const events = new HarmonyEvents(), changes = [];
  events.onChange = (module, enabled) => changes.push([module, enabled]);
  const first = events.next('a', 'location'), second = events.next('b', 'location');
  events.emit('location', { latitude: 1 });
  assert.deepEqual(await first, { latitude: 1 }); await second;
  events.emit('location', { latitude: 2 }); events.emit('location', { latitude: 3 });
  assert.deepEqual(await events.next('a', 'location'), { latitude: 3 });
  events.close('a'); events.close('b');
  assert.deepEqual(changes, [['location', true], ['location', false]]);
  const pending = events.next('c', 'network'); events.dispose();
  await assert.rejects(pending, /CANCELLED/);
  assert.throws(() => events.next('d', 'network'), /CANCELLED/);
});
test('loss-sensitive subscription overflow is explicit and overlapping reads are rejected', async () => {
  const events = new HarmonyEvents();
  const first = events.next('a', 'bluetooth');
  assert.throws(() => events.next('a', 'bluetooth'), /overlapping/);
  events.emit('bluetooth', { value: [1] }); await first;
  for (let i = 0; i < 65; i++) events.emit('bluetooth', { value: [i] });
  await assert.rejects(events.next('a', 'bluetooth'), /overflow/);
  assert.throws(() => events.next('a', 'location'), /overlapping/);
  events.dispose();
});
test('failed system listener registration rolls back the subscription', () => {
  const events = new HarmonyEvents(); events.onChange = () => { throw new Error('PERMISSION_DENIED'); };
  assert.throws(() => events.next('a', 'location'), /PERMISSION_DENIED/);
  assert.equal(events.hasModule('location'), false);
});

const { HarmonyPageStack } = loadETS('HarmonyPageStack');
function stackFixture() {
  const hosts = [], evicted = [];
  const stack = new HarmonyPageStack(['home', 'detail'], route => {
    const host = { route, visible: true, destroyed: false, setVisible(value) { this.visible = value; }, destroy() { this.destroyed = true; } };
    hosts.push(host); return host;
  });
  stack.onEvict = page => evicted.push(page);
  stack.load('home', { message: '鸿蒙', count: 1 });
  return { stack, hosts, evicted };
}
test('retained capacity evicts hosts without blocking navigation or losing parameters', () => {
  const { stack, hosts, evicted } = stackFixture();
  const root = stack.current(); stack.setMaxRetainedPages(1);
  stack.navigate(root, 'push', 'detail', { n: 2 });
  assert.equal(hosts[0].destroyed, true); assert.equal(stack.entries.length, 2);
  assert.deepEqual(evicted, ['home']);
  stack.navigate(stack.current(), 'pop');
  assert.equal(stack.current(), root); assert.equal(hosts.length, 3);
  assert.deepEqual(stack.navigate(root, 'getParams'), { message: '鸿蒙', count: 1 });
  assert.equal(root.host.visible, true); assert.equal(hosts[1].destroyed, true);
});
test('memory pressure only destroys hidden hosts; visibility applies to rebuilt pages', () => {
  const { stack, hosts } = stackFixture();
  stack.navigate(stack.current(), 'push', 'detail'); stack.setVisible(false); stack.trimMemory();
  assert.equal(hosts[0].destroyed, true); assert.equal(hosts[1].destroyed, false);
  stack.navigate(stack.current(), 'pop'); assert.equal(stack.current().host.visible, false);
  stack.setVisible(true); assert.equal(stack.current().host.visible, true);
  stack.destroy(); assert.ok(hosts.every(host => host.destroyed));
});
test('route validation rejects hidden navigation and oversized UTF-8 parameters atomically', () => {
  const { stack } = stackFixture(), root = stack.current();
  assert.throws(() => stack.navigate(root, 'push', 'detail', { text: '鸿'.repeat(20000) }), /INVALID_ROUTE_PARAMS/);
  assert.equal(stack.entries.length, 1);
  stack.navigate(root, 'push', 'detail');
  assert.throws(() => stack.navigate(root, 'pop'), /PAGE_NOT_ACTIVE/);
  for (const limit of [0, -1, 1.5, NaN]) assert.throws(() => stack.setMaxRetainedPages(limit), /INVALID_ARGUMENT/);
  assert.throws(() => stack.navigate(stack.current(), 'replace', 'missing'), /UNKNOWN_PAGE/);
  assert.equal(stack.current().page, 'detail');
});
test('hidden animations freeze the timeline, including animations started while hidden', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  let frame, running = false, value = 0;
  const clock = { on(type, cb) { frame = cb; }, off() {}, start() { running = true; }, stop() { running = false; } };
  const { HarmonyAnimation } = loadETS('HarmonyAnimation', {
    '@kit.ArkGraphics2D': { displaySync: { create: () => clock } },
    'libanseronui.so': { invokeView(surface, node, method, data) { if (method === 'getVisual') return { opacity: 0 }; value = JSON.parse(data).opacity; } },
  });
  const animations = new HarmonyAnimation(1);
  const result = animations.animate(1, { style: { opacity: 1 }, options: { duration: 1000, easing: 'linear' } });
  t.mock.timers.setTime(1500); frame(); assert.equal(value, .5);
  animations.setVisible(false); assert.equal(running, false);
  t.mock.timers.setTime(5500); frame(); assert.equal(value, .5);
  animations.setVisible(true); frame(); assert.equal(value, .5);
  t.mock.timers.setTime(6000); frame(); assert.deepEqual(await result, { finished: true });
  animations.setVisible(false);
  const hidden = animations.animate(2, { style: { opacity: 1 }, options: { duration: 1000, easing: 'linear' } });
  t.mock.timers.setTime(10000); animations.setVisible(true); frame(); assert.equal(value, 0);
  animations.cancel(2); assert.deepEqual(await hidden, { finished: false }); animations.dispose();
});
test('initial links are preserved while repeated warm links are delivered', () => {
  const { HarmonyLinking } = loadETS('HarmonyLinking');
  const urls = [];
  HarmonyLinking.receive(undefined, true);
  assert.equal(HarmonyLinking.getInitialURL(), null);
  HarmonyLinking.receive({ uri: 'demo://cold' }, true);
  const stop = HarmonyLinking.listen(url => urls.push(url));
  HarmonyLinking.receive({ uri: 'demo://warm' }); HarmonyLinking.receive({ uri: 'demo://warm' });
  assert.equal(HarmonyLinking.getInitialURL(), 'demo://cold'); assert.deepEqual(urls, ['demo://warm', 'demo://warm']);
  stop(); HarmonyLinking.receive({ uri: 'demo://ignored' }); assert.equal(urls.length, 2);
});
