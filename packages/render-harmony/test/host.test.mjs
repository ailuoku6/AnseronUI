import test from 'node:test';
import assert from 'node:assert/strict';
import { loadETS } from './load-ets.mjs';
function fixture(measureText = () => ({ width: 40, height: 32 })) {
  const sent = [], scopes = []; let inScope = false;
  const native = { profile() {}, performance: () => ({ adapterStepMs: 2, uiQueueMs: 1 }), post(worker, message) { sent.push(JSON.parse(message)); }, supportsModule: () => false, invokeView() { assert.equal(inScope, true); return { focused: true }; } };
  const { HarmonyHost } = loadETS('HarmonyHost', {
    './HarmonyMedia': {}, './HarmonyAnimation': {}, './HarmonyServices': {}, './HarmonyRadioServices': {}, './HarmonyApplicationServices': {},
    '@kit.ArkUI': { NodeContent: class {}, FontStyle: { Italic: 1, Normal: 0 }, window: { AvoidAreaType: { TYPE_SYSTEM: 0, TYPE_CUTOUT: 1, TYPE_NAVIGATION_INDICATOR: 4 } } },
    '@kit.IMEKit': {}, '@kit.NetworkKit': {}, '@kit.AbilityKit': {}, '@ohos.promptAction': {}, '@kit.ArkData': {}, '@kit.NotificationKit': {}, '@kit.LocalizationKit': {},
    '@kit.BasicServicesKit': { systemDateTime: { getUptime: () => performance.now() * 1e6, TimeType: { STARTUP: 0 } } },
    '@kit.ArkTS': { util: { TextEncoder: class { encodeInto(value) { return new TextEncoder().encode(value); } } } }, 'libanseronui.so': native,
  }, { FontStyle: { Italic: 1, Normal: 0 } });
  const measures = [];
  const ui = { px2vp: n => n / 2, vp2px: n => n * 2, getMeasureUtils: () => ({ measureTextSize(value) { measures.push(value); return measureText(value); } }), runScopedTask(fn) { scopes.push(1); inScope = true; try { fn(); } finally { inScope = false; } } };
  const host = new HarmonyHost({}, ui, 'test', 'home'); host.worker = 1; host.renderer = 1;
  return { host, native, sent, scopes, measures };
}
test('worker-origin ref commands enter the ArkUI instance scope', async () => {
  const f = fixture();
  f.host.invoke({ requestId: 1, module: '__view', method: 'focus', argument: JSON.stringify({ nodeId: 7 }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.scopes.length, 1); assert.deepEqual(JSON.parse(f.sent[0].payload.value), { focused: true }); assert.equal(f.host.cancellations.size, 0);
});
test('window metrics combine system, cutout and navigation in logical units', () => {
  const { host } = fixture(); host.width = 400; host.height = 800;
  host.systemWindow = { getWindowAvoidArea(type) { return { topRect: { height: type === 1 ? 90 : 60 }, bottomRect: { height: type === 4 ? 40 : 0 }, leftRect: { width: 0 }, rightRect: { width: 0 } }; } };
  assert.deepEqual(JSON.parse(JSON.stringify(host.metrics())), { width: 400, height: 800, scale: 2, safeArea: { top: 45, right: 0, bottom: 20, left: 0 } });
});
test('runtime inspection forwards Core statistics and resettable host counters', () => {
  const { host, sent } = fixture(); const reports = []; host.onRuntimeStats = values => reports.push(values);
  host.inspectRuntime(true, true); assert.equal(sent[0].payload.type, 'InspectRuntime'); assert.ok(host.hostMetrics.bridgeInputBytes > 0);
  host.output({ type: 'RuntimeStats', values: { nodes: 3 } }); assert.equal(reports[0].nodes, 3); assert.equal(reports[0].adapterStepMs, 2); assert.equal(reports[0].uiQueueMs, 1); assert.ok(reports[0].bridgeInputBytes > 0);
  host.inspectRuntime(false, true); assert.deepEqual(host.hostMetrics, {});
});
test('measurement uses the shared 16vp text baseline and input insets', () => {
  const f = fixture();
  f.host.output({ type: 'MeasureRequest', requestId: 1, nodeId: 2, kind: 'Text', text: 'OK', maxWidth: 200 });
  assert.equal(f.measures[0].fontSize, 16);
  assert.equal(f.measures[0].constraintWidth, undefined);
  assert.equal(f.measures[0].maxLines, undefined);
  const label = f.sent.at(-1).payload;
  assert.equal(label.type, 'MeasureResult');
  assert.equal(label.width, 21);
  assert.equal(label.height, 16);
  f.host.output({ type: 'MeasureRequest', requestId: 2, nodeId: 3, kind: 'TextInput', text: '', maxWidth: 200 });
  assert.equal(f.measures[1].fontSize, 16);
  const input = f.sent.at(-1).payload;
  assert.equal(input.width, 120);
  assert.equal(input.height, 32);
});
test('short text preserves intrinsic width for centered and trailing Flexily children', () => {
  // Model ArkUI: a constraint reserves the entire paragraph width, even for
  // a short label. Returning that width makes alignItems:center ineffective.
  const f = fixture(options => ({ width: options.constraintWidth ? 274 : 160, height: 36 }));
  for (const text of ['蓝色外阴影', '紫色外阴影']) {
    f.host.output({ type: 'MeasureRequest', requestId: 1, nodeId: 2, kind: 'Text', text, fontSize: 16, maxWidth: 137, props: { fontWeight: 'bold' } });
    assert.equal(f.sent.at(-1).payload.width, 81);
    assert.equal(f.sent.at(-1).payload.height, 18);
  }
  assert.ok(f.measures.every(options => options.constraintWidth === undefined));
  assert.ok(f.measures.every(options => options.fontWeight === 'bold'));
});
test('input and rich text retain their constrained measurement path', () => {
  const f = fixture(options => ({ width: options.constraintWidth ? 400 : 160, height: 32 }));
  for (const kind of ['TextInput', 'RichText']) {
    f.host.output({ type: 'MeasureRequest', requestId: 1, nodeId: 2, kind, text: 'content', fontSize: 16, maxWidth: 200 });
    assert.equal(f.sent.at(-1).payload.width, 200);
  }
  assert.equal(f.measures.length, 2);
  assert.ok(f.measures.every(options => options.constraintWidth === '200vp'));
});
test('overflowing text still wraps at the available width and preserves line limits', () => {
  const f = fixture(options => options.constraintWidth ? { width: 240, height: 96 } : { width: 600, height: 32 });
  f.host.output({ type: 'MeasureRequest', requestId: 1, nodeId: 2, kind: 'Text', text: 'A paragraph that wraps', fontSize: 16, maxWidth: 120, props: { numberOfLines: 3 } });
  assert.equal(f.measures.length, 2);
  assert.equal(f.measures[1].constraintWidth, '120vp');
  assert.equal(f.measures[1].maxLines, 3);
  assert.equal(f.sent.at(-1).payload.width, 120);
  assert.equal(f.sent.at(-1).payload.height, 48);
});
test('location and transfer subscription polls remain open and cancel ownership', async () => {
  const { host, sent } = fixture();
  host.invoke({ requestId: 1, module: 'events', method: 'next', argument: JSON.stringify({ id: 'watch', module: 'location' }) });
  host.events.emit('location', { latitude: 1 }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(sent[0].payload.value), { latitude: 1 });
  host.invoke({ requestId: 2, module: 'events', method: 'next', argument: JSON.stringify({ id: 'progress', module: 'transfers' }) });
  host.cancel(2); await new Promise(resolve => setImmediate(resolve)); assert.equal(sent.length, 1); host.events.dispose();
});
test('SDK failures retain portable error classification', () => {
  const { serviceError } = loadETS('HarmonyErrors');
  assert.match(serviceError({ code: 201, message: 'not allowed' }), /^PERMISSION_DENIED/);
  assert.match(serviceError({ code: 401, message: 'bad input' }), /^INVALID_ARGUMENT/);
  assert.match(serviceError(new Error('CANCELLED')), /CANCELLED/);
});

test('oversized module results fail the request without poisoning the Core protocol', async () => {
  const { host, native, sent } = fixture(); native.supportsModule = () => true; native.invokeModule = async () => 'x'.repeat(65537);
  host.invoke({ requestId: 3, module: 'large', method: 'value', argument: '{}' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].payload.ok, false); assert.match(sent[0].payload.value, /module result exceeds/); assert.equal(host.cancellations.size, 0);
});
test('non-JSON custom module results reject without leaking an active request', async () => {
  const { host, native, sent } = fixture(); native.supportsModule = () => true;
  const circular = {}; circular.self = circular; native.invokeModule = async () => circular;
  host.invoke({ requestId: 4, module: 'custom', method: 'value', argument: '{}' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent[0].payload.ok, false); assert.match(sent[0].payload.value, /not JSON serializable/); assert.equal(host.cancellations.size, 0);
});

test('async native view methods resolve their value and cancellation ignores late completion', async () => {
  const { host, native, sent } = fixture(); let resolve;
  native.invokeView = () => new Promise(done => { resolve = done; });
  host.invoke({requestId:7,module:'__view',method:'custom',argument:'{"nodeId":7}'});
  resolve({value:true}); await new Promise(done=>setImmediate(done));
  assert.equal(JSON.parse(sent[0].payload.value).value,true);
  host.invoke({requestId:8,module:'__view',method:'custom',argument:'{"nodeId":7}'});
  host.cancel(8);resolve({value:false});await new Promise(done=>setImmediate(done));assert.equal(sent.length,1);
});

test('lineHeight reaches intrinsic and constrained native text measurement', () => {
  const f = fixture(options => ({ width: options.constraintWidth ? 160 : 600, height: 120 }));
  f.host.output({ type: 'MeasureRequest', requestId: 3, nodeId: 4, kind: 'Text', text: 'wrapped', fontSize: 16, maxWidth: 100, props: { lineHeight: 30 } });
  assert.equal(f.measures.length, 2);
  assert.ok(f.measures.every(options => options.lineHeight === 30));
  assert.equal(f.sent.at(-1).payload.height, 60);
});
