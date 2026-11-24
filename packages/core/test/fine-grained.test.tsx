import { describe, expect, it } from 'vitest';
import { definePage, View, TextInput, Text, useState, useEffect, useRef, useImperativeHandle } from '@anseronui/ui';
import { TestHost } from './host-harness.js';
import { ReferenceRuntime } from '../src/runtime.js';
import { LayoutKernel } from '../src/kernel.js';
import { CORE_ABI_VERSION } from '../src/contracts.js';
import type { BeginRenderRequest, NodeMutation, Prepared } from '../src/contracts.js';

it.each([100, 1000, 10000])('patches one mounted branch independently of %i unrelated branches', async count => {
  let update = (_: number) => {}; let parentCalls = 0, calls = 0, effects = 0;
  function Leaf({ index }: { index: number }) {
    const [opacity, set] = useState(1); if (index === 0) update = set;
    calls++; return <View style={{ width: 1, height: 1, opacity }} />;
  }
  const host = new TestHost(definePage('fine', () => {
    parentCalls++; useEffect(() => { effects++; });
    return <View>{Array.from({ length: count }, (_, index) => <Leaf key={index} index={index} />)}</View>;
  }));
  // The test harness accepts the assembled transaction, including large mounts.
  await host.mount('fine'); const before = host.runtime.getStats();
  update(0.5); const outputs = await host.settle(), after = host.runtime.getStats();
  const commits = outputs.filter(p => p.type === 'Commit');
  expect(commits).toHaveLength(1);
  expect(commits[0].commands).toEqual([{ type: 'PatchProps', nodeId: 2, set: { opacity: 0.5 }, unset: [] }]);
  expect(parentCalls).toBe(1); expect(effects).toBe(1); expect(calls).toBe(count + 1);
  expect(after.scopeVisits - before.scopeVisits).toBe(2);
  expect(after.coreSyncNodes - before.coreSyncNodes).toBe(1);
  expect(after.layoutVisited - before.layoutVisited).toBe(0);
  expect(after.commitLogEntries - before.commitLogEntries).toBe(4);
  expect(after.coreRequestUnits - before.coreRequestUnits).toBeLessThan(800);
  host.runtime.dispose();
});

it('corrects a same-value controlled input and rejection without a state setter', async () => {
  const host = new TestHost(definePage('input', () => {
    const [value, set] = useState('7');
    return <View><TextInput value={value} onChangeText={next => set(next.replace(/\D/g, ''))} /><TextInput value="fixed" onChangeText={() => {}} /></View>;
  }));
  await host.mount('input'); const inputs = [...host.nodes].filter(([, node]) => node.kind === 'TextInput');
  for (const [id, node] of inputs) {
    host.send({ type: 'InputChange', nodeId: id, revision: host.revision, inputRevision: 1, value: '7x' });
    const outputs = await host.settle();
    expect(outputs).toContainEqual(expect.objectContaining({ type: 'Commit', commands: [{ type: 'PatchProps', nodeId: id, set: { value: node.props.value, inputRevision: 1 }, unset: [] }] }));
  }
  host.runtime.dispose();
});

it('settles parent and child updates together, retaining same-position state across branches', async () => {
  let parent = (_: boolean) => {}, child = (_: number) => {}; let mounts = 0, cleanups = 0;
  function Child({ label }: { label: string }) {
    const [value, set] = useState(0); child = set;
    useEffect(() => { mounts++; return () => { cleanups++; }; }, []);
    return <Text>{label}:{value}</Text>;
  }
  const host = new TestHost(definePage('identity', () => {
    const [flag, set] = useState(false); parent = set;
    return <View>{flag ? <Child label="a" /> : <Child label="b" />}</View>;
  }));
  await host.mount('identity'); child(7); parent(true); await host.settle();
  expect([...host.nodes.values()].find(n => n.kind === 'Text')?.props.text).toBe('a:7');
  expect(mounts).toBe(1); expect(cleanups).toBe(0); host.runtime.dispose();
});

describe('Core transaction journal', () => {
  const create = (id: number): NodeMutation => ({ type: 'Create', nodeId: id, kind: 'View', props: { opacity: 1 }, style: { width: 10, height: 10 }, events: [] });
  function begin(id: number, base: number, mutations: NodeMutation[]): BeginRenderRequest {
    return { type: 'BeginRender', abi: CORE_ABI_VERSION, surfaceId: 1, generation: 1, transactionId: id, baseRevision: base, targetRevision: id, width: 100, height: 100, environmentVersion: 0, nextRequestId: 1, mutations };
  }
  function finish(core: LayoutKernel, id: number, type: 'FinalizeRender' | 'AbortRender' = 'FinalizeRender') {
    return core.execute({ type, abi: CORE_ABI_VERSION, surfaceId: 1, generation: 1, transactionId: id });
  }
  it('is idempotent, rejects conflicts and restores layout after abort', () => {
    const core = new LayoutKernel(), first = begin(1, 0, [create(1), { type: 'Children', parentId: 0, children: [1] }]);
    expect(core.execute(first)).toEqual(core.execute(first)); finish(core, 1);
    const second = begin(2, 1, [{ type: 'Patch', nodeId: 1, propsSet: {}, propsUnset: [], styleSet: { width: 30 }, styleUnset: [] }]);
    expect((core.execute(second) as Prepared).frames[0].frame.width).toBe(30);
    expect(finish(core, 2, 'AbortRender')).toEqual(finish(core, 2, 'AbortRender'));
    expect(() => finish(core, 2)).toThrow('CORE_TRANSACTION_TERMINATED');
    const third = core.execute(begin(3, 1, [{ type: 'Patch', nodeId: 1, propsSet: { opacity: 0.5 }, propsUnset: [], styleSet: {}, styleUnset: [] }])) as Prepared;
    expect(third.frames).toEqual([]); expect(third.commands).toEqual([{ type: 'PatchProps', nodeId: 1, set: { opacity: 0.5 }, unset: [] }]);
    finish(core, 3); core.dispose();
  });
  it('detaches a retained descendant before removing its old parent', () => {
    const core = new LayoutKernel();
    core.execute(begin(1, 0, [create(1), create(2), { type: 'Children', parentId: 1, children: [2] }, { type: 'Children', parentId: 0, children: [1] }])); finish(core, 1);
    const result = core.execute(begin(2, 1, [{ type: 'Delete', nodeId: 1 }, { type: 'Children', parentId: 0, children: [2] }])) as Prepared;
    expect(result.commands.slice(0, 3)).toEqual([{ type: 'DetachChild', nodeId: 2 }, { type: 'RemoveNode', nodeId: 1 }, { type: 'MoveChild', parentId: 0, nodeId: 2, index: 0 }]);
    finish(core, 2); core.dispose();
  });
});

it('preserves logical state while rebuilding refs and effect resources after host loss', async () => {
  let set = (_: number) => {}; const log: string[] = [];
  const ref = (await import('@anseronui/ui')).createRef<import('@anseronui/ui').NodeHandle>();
  const host = new TestHost(definePage('recover', () => {
    const [n, update] = useState(0); set = update;
    useEffect(() => { log.push('setup:' + ref.current!.nodeId); return () => { log.push('cleanup'); }; }, []);
    return <View ref={ref}><Text>{n}</Text></View>;
  }));
  await host.mount('recover'); const old = ref.current!;
  set(7); host.runtime.step();
  // A host reports that the emitted transaction could not be applied.
  host.send({ type: 'CommitFailed', revision: host.revision + 1, reason: 'injected failure' });
  await host.settle();
  expect(ref.current!.nodeId).not.toBe(old.nodeId);
  expect(log).toEqual(['setup:' + old.nodeId, 'cleanup', 'setup:' + ref.current!.nodeId]);
  expect([...host.nodes.values()].find(node => node.kind === 'Text')?.props.text).toBe('7');
  await expect(old.focus()).rejects.toThrow('NODE_UNMOUNTED');
  host.runtime.dispose();
});

it('recreates imperative handles that capture a physical node after reset', async () => {
  const api = { current: null as null | { focus(): Promise<void> } };
  let captured: import('@anseronui/ui').NodeHandle | null = null;
  const host = new TestHost(definePage('imperative-reset', () => {
    const node = useRef<import('@anseronui/ui').NodeHandle | null>(null);
    useImperativeHandle(api, () => { const physical = node.current!; captured = physical; return { focus: () => physical.focus() }; }, []);
    return <TextInput ref={node} value="kept" onChangeText={() => {}} />;
  }));
  await host.mount('imperative-reset'); const old = api.current!, oldNode = captured!;
  host.send({ type:'InputChange', nodeId:oldNode.nodeId, revision:host.revision, inputRevision:1, value:'rejected' });
  host.runtime.step();
  host.send({ type:'CommitFailed', revision:host.revision + 1, reason:'injected attachment loss' });
  await host.settle();
  expect(api.current).not.toBe(old); expect(captured!.nodeId).not.toBe(oldNode.nodeId);
  await expect(old.focus()).rejects.toThrow('NODE_UNMOUNTED');
  const focused = api.current!.focus();
  await host.settle();
  await expect(focused).resolves.toBeNull();
  host.runtime.dispose(); expect(api.current).toBeNull();
});

it('targets actual Context consumers through skipped output and isolates nested providers', async () => {
  const { createContext, useContext } = await import('@anseronui/ui');
  const Value = createContext(0);
  let set = (_: number) => {}; let bridgeCalls = 0; const seen: number[] = [];
  function Consumer() { const n = useContext(Value); seen.push(n); return <Text>{n}</Text>; }
  function Bridge() { bridgeCalls++; return <View>{Array.from({length:1000}, (_, i) => <View key={i} />)}<Consumer /><Value.Provider value={99}><Consumer /></Value.Provider></View>; }
  const host = new TestHost(definePage('context-index', () => { const [n, update] = useState(0); set = update; return <Value.Provider value={n}><Bridge /></Value.Provider>; }));
  await host.mount('context-index'); const before = host.runtime.getStats();
  set(1); await host.settle(); const after = host.runtime.getStats();
  expect(seen).toEqual([0, 99, 1]); expect(bridgeCalls).toBe(1);
  expect(after.scopeVisits - before.scopeVisits).toBeLessThan(10);
  host.runtime.dispose();
});

it('replays an unacknowledged transaction without publishing effects twice', () => {
  const { runtime, send, drain, effects } = (() => {
    let sequence = 0, ack = 0; const effects: number[] = [];
    const runtime = new ReferenceRuntime({ bundleBuildId:'timeout', pages:[definePage('timeout', () => { useEffect(() => { effects.push(1); }, []); return <View />; })] });
    const send = (payload: import('@anseronui/protocol').InputPayload) => runtime.post({ protocolMajor:2, protocolMinor:0, bundleBuildId:'timeout', runtimeEpoch:1, surfaceId:1, surfaceGeneration:1, sequence:++sequence, ackSequence:ack, payload });
    const drain = () => runtime.step().map(message => { ack = message.sequence; return message.payload; });
    return { runtime, send, drain, effects };
  })();
  send({type:'CreateSurface', page:'timeout', width:100, height:100});
  const first = drain(), commit = first.find(p => p.type === 'Commit')!;
  const timer = first.find(p => p.type === 'InvokeModule' && p.purpose === 'renderWatchdog')!;
  if (timer.type !== 'InvokeModule' || commit.type !== 'Commit') throw new Error('Missing transaction');
  send({type:'ModuleResult', requestId:timer.requestId, ok:true, value:''});
  const replay = drain().find(p => p.type === 'Commit'); expect(replay).toEqual(commit);
  expect(runtime.getStats().commits ?? 0).toBe(0);
  send({type:'CommitAck', revision:commit.revision}); drain();
  send({type:'CommitAck', revision:commit.revision}); expect(drain()).toEqual([]);
  expect(runtime.getStats().pendingRenders).toBe(0); expect(effects).toEqual([1]); runtime.dispose();
});
