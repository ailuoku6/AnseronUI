/** Protocol benchmark: real JS/native/Wasm Core, deterministic synthetic renderer/text fixture. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { arch, platform, release, cpus } from 'node:os';
import { ReferenceRuntime } from '../packages/core/src/runtime.js';
import { virtualListPage } from '../examples/virtual-list/page.js';
import { validateEnvelope } from '../packages/protocol/src/index.js';
import type { Envelope, InputPayload, OutputPayload, Frame, RenderProps } from '../packages/protocol/src/index.js';

const mode = process.argv[2] ?? 'reference';
if (!['reference', 'native', 'wasm'].includes(mode)) throw new Error('Expected reference, native or wasm');
const budget = JSON.parse(await readFile(new URL('./performance-budgets.json', import.meta.url), 'utf8'));
const runtime = mode === 'reference' ? new ReferenceRuntime({ bundleBuildId: 'anseronui-demo', pages: [virtualListPage] }) : null;
const child = mode === 'reference' ? null : spawn(mode === 'native' ? '.verification/core-native/probe' : process.execPath,
  mode === 'wasm' ? ['--import', 'tsx', 'packages/core/native/test/wasm-stdio.mjs'] : [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = child ? createInterface({ input: child.stdout! })[Symbol.asyncIterator]() : null;
let sequence = 0, ack = 0, generation = 1, revision = 0, inputBytes = 0, outputBytes = 0, maxMessageBytes = 0;
let applyMs = 0, measureMs = 0, maxNodes = 0, phases: Record<string, number> = {};
const nodes = new Map<number, { kind: string; parent: number; props: RenderProps; frame: Frame }>();
const timers = new Set<number>();
const exchange = async (payload?: InputPayload): Promise<OutputPayload[]> => {
  const envelope: Envelope<InputPayload> | undefined = payload ? { protocolMajor: 2, protocolMinor: 0, bundleBuildId: 'anseronui-demo', runtimeEpoch: 1, surfaceId: 1, surfaceGeneration: generation, sequence: ++sequence, ackSequence: ack, payload } : undefined;
  const encoded = envelope ? JSON.stringify(envelope) : '';
  inputBytes += Buffer.byteLength(encoded);
  let outputs: Envelope<OutputPayload>[];
  if (runtime) { if (envelope) runtime.post(envelope); await new Promise(resolve => setImmediate(resolve)); outputs = runtime.step(); }
  else {
    child!.stdin!.write(encoded + '\n');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const next = await Promise.race([lines!.next(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Core benchmark timed out')), 15000); timeout.unref(); })]).finally(() => clearTimeout(timeout));
    assert(!next.done, 'Core exited before benchmark completed'); outputs = JSON.parse(next.value);
  }
  for (const message of outputs) {
    validateEnvelope<OutputPayload>(message); assert.equal(message.sequence, ++ack);
    const size = Buffer.byteLength(JSON.stringify(message)); outputBytes += size; maxMessageBytes = Math.max(maxMessageBytes, size);
  }
  return outputs.map(message => message.payload);
};
async function settle(payload?: InputPayload): Promise<void> {
  const queue = await exchange(payload); let idle = 0;
  for (let turn = 0; turn < 1000; turn++) {
    const p = queue.shift();
    if (!p) { const outputs = await exchange(); if (!outputs.length) { if (++idle >= 4) return; } else idle = 0; queue.push(...outputs); continue; }
    if (p.type === 'Diagnostic') throw new Error(JSON.stringify(p));
    if (p.type === 'RuntimeStats') phases = p.values;
    if (p.type === 'CancelRequest') timers.delete(p.requestId);
    if (p.type === 'InvokeModule') {
      if (p.module === 'timer') timers.add(p.requestId);
      else { queue.push(...await exchange({ type: 'ModuleResult', requestId: p.requestId, ok: true, value: p.module === '__view' ? 'null' : '{}' })); }
    }
    if (p.type === 'MeasureRequest') {
      const started = performance.now();
      const width = Math.min(p.maxWidth, Math.ceil(p.text.length * p.fontSize * 0.6 + (p.kind === 'Button' ? 16 : 0)));
      const height = Math.max(1, Math.ceil(p.text.length * p.fontSize * 0.6 / Math.max(1, p.maxWidth))) * (p.fontSize + 4) + (p.kind === 'Button' ? 12 : 0);
      measureMs += performance.now() - started;
      queue.push(...await exchange({ type: 'MeasureResult', requestId: p.requestId, nodeId: p.nodeId, width, height, baseline: p.fontSize }));
    }
    if (p.type === 'Commit') {
      const started = performance.now(); revision = p.revision;
      const remove = (id: number) => { for (const [child, node] of nodes) if (node.parent === id) remove(child); nodes.delete(id); };
      for (const c of p.commands) {
        if (c.type === 'CreateNode') nodes.set(c.nodeId, { kind: c.kind, parent: 0, props: {}, frame: { x: 0, y: 0, width: 0, height: 0 } });
        if (c.type === 'RemoveNode') remove(c.nodeId);
        if (c.type === 'SetProps') nodes.get(c.nodeId)!.props = c.props;
        if (c.type === 'PatchProps') { const props = nodes.get(c.nodeId)!.props; Object.assign(props, c.set); for (const key of c.unset) delete props[key]; }
        if (c.type === 'SetFrame') nodes.get(c.nodeId)!.frame = c.frame;
        if (c.type === 'InsertChild' || c.type === 'MoveChild') nodes.get(c.nodeId)!.parent = c.parentId;
      }
      maxNodes = Math.max(maxNodes, nodes.size); applyMs += performance.now() - started;
      queue.push(...await exchange({ type: 'CommitAck', revision }));
    }
    if (p.type === 'SurfaceDisposed') nodes.clear();
  }
  throw new Error('Benchmark did not converge');
}
const samples: number[] = [], firstFrames: number[] = [];
const started = performance.now();
try {
  for (let run = 0; run < 5; run++) {
    sequence = 0; ack = 0; revision = 0;
    await settle({ type: 'CreateSurface', page: 'virtual-list', width: 390, height: 700, visible: false });
    await settle({ type: 'InspectRuntime', enabled: true, reset: run === 0 });
    const start = performance.now(); await settle({ type: 'SurfaceVisibility', visible: true }); firstFrames.push(performance.now() - start);
    const scroll = [...nodes].find(([, value]) => value.props.testID === 'variable-list'); assert(scroll, 'List scroll viewport is missing');
    // Warm the same operations before recording samples. Covers repeated mount/destroy and deep scrolling.
    for (let i = 0; i < 26; i++) {
      const start = performance.now();
      await settle({ type: 'NativeEvent', event: 'scroll', nodeId: scroll[0], revision, x: 0, y: i * 12000, contentWidth: 390, contentHeight: 500000 });
      if (i >= 2) samples.push(performance.now() - start);
    }
    await settle({ type: 'Resize', width: 240, height: 700 });
    await settle({ type: 'SurfaceVisibility', visible: false }); assert.equal(timers.size, 0, 'Hidden page left active host timers');
    await settle({ type: 'SurfaceVisibility', visible: true });
    await settle({ type: 'InspectRuntime' });
    assert(phases.nodes <= budget.maxMountedNodes, 'Live node budget exceeded');
    assert(phases.measureCacheEntries <= budget.maxMeasureCacheEntries, 'Text cache budget exceeded');
    await settle({ type: 'DestroySurface' }); assert.equal(timers.size, 0); assert.equal(nodes.size, 0);
    generation++;
  }
} finally { runtime?.dispose(); child?.stdin!.end(); }
if (child) {
  const code = await new Promise<number | null>(resolve => child.once('exit', resolve)); assert.equal(code, 0, 'Native runtime did not shut down cleanly');
}
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
assert(maxNodes <= budget.maxMountedNodes, `Mounted ${maxNodes} nodes`); assert(maxMessageBytes <= budget.maxMessageBytes, 'Protocol message budget exceeded');
const report = { schemaVersion: 1, mode, host: { platform: platform(), arch: arch(), release: release(), cpu: cpus()[0]?.model, node: process.version },
  fixture: '5000 variable text rows; 5 lifecycles; 120 sampled scroll updates; synthetic renderer/text measurement',
  samples: samples.length, firstFrameMedianMs: percentile(firstFrames, 0.5), firstFrameP95Ms: percentile(firstFrames, 0.95),
  updateMedianMs: percentile(samples, 0.5), updateP95Ms: percentile(samples, 0.95), elapsedMs: performance.now() - started,
  maxMountedNodes: maxNodes, maxMessageBytes, inputBytes, outputBytes, syntheticApplyMs: applyMs, syntheticMeasureMs: measureMs, core: phases };
const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='));
if (baselineArg) {
  const baseline = JSON.parse(await readFile(baselineArg.slice(11), 'utf8'));
  assert.equal(baseline.schemaVersion, report.schemaVersion); assert.equal(baseline.fixture, report.fixture);
  assert.equal(baseline.mode, mode); assert.deepEqual(baseline.host, report.host, 'Baseline must use the same runtime and machine environment');
  for (const key of ['firstFrameMedianMs', 'updateP95Ms'] as const) assert(report[key] <= baseline[key] * budget.latencyRatio + budget.latencySlackMs, key + ' regressed');
}
await mkdir('.verification/performance', { recursive: true });
await writeFile('.verification/performance/' + mode + '.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
