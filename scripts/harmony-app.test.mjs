import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonyIndexSource, selectHarmony, harmonyPermissionResources } from './harmony-app.mjs';

const manifest = { buildId: 'test-build', pages: [{ name: 'home' }, { name: 'details' }] };
test('Harmony incremental builds retain reason resources referenced by preserved permissions', () => {
  const old = {name:'anseronui_permission_location',value:'Location access'};
  const removed = {name:'anseronui_permission_removed',value:'No longer declared'};
  const generated = {name:'anseronui_permission_network',value:'Current network reason'};
  const permissions = [{reason:'$string:'+old.name},{reason:'$string:'+generated.name}];
  const result = harmonyPermissionResources(permissions,[generated],[old,removed,{...generated,value:'Old reason'}]);
  assert.deepEqual(result,[old,generated]);
  assert.deepEqual(harmonyPermissionResources(permissions,[generated],result),result);
});
test('Harmony generated entry carries retention and tab configuration', () => {
  const source = harmonyIndexSource({ harmony: { initialPage: 'details', maxRetainedPages: 2, showPageTabs: false } }, manifest);
  assert.match(source, /initialPage:"details"/);
  assert.match(source, /maxRetainedPages:2/);
  assert.match(source, /showPageTabs:false/);
  assert.match(source, /this.controller.back\(\)/);
  const defaults = harmonyIndexSource({}, manifest);
  assert.match(defaults, /initialPage:"home"/);
  assert.match(defaults, /maxRetainedPages:Infinity/);
  assert.match(defaults, /showPageTabs:true/);
  for (const maxRetainedPages of [0, -1, 1.5, '2']) assert.throws(() => harmonyIndexSource({ harmony: { maxRetainedPages } }, manifest));
  assert.throws(() => harmonyIndexSource({ harmony: { initialPage: 'missing' } }, manifest), /Unknown/);
  assert.throws(() => harmonyIndexSource({ harmony: { showPageTabs: 'false' } }, manifest), /boolean/);
});
test('Harmony device selection rejects missing and ambiguous targets', () => {
  assert.equal(selectHarmony('device-a\n'), 'device-a');
  assert.equal(selectHarmony('device-a\ndevice-b\n', 'device-b'), 'device-b');
  assert.throws(() => selectHarmony('[Empty]'), /Connect one/);
  assert.throws(() => selectHarmony('device-a\ndevice-b'), /Connect one/);
  assert.throws(() => selectHarmony('device-a', 'missing'), /not connected/);
});
