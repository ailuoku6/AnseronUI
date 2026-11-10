import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayoutEngine, Node } from '@anseronui/layout';
import type { Style } from '@anseronui/ui';
import { CORE_ABI_VERSION } from '../src/contracts.js';
import type { RenderNode, RenderRequest, RenderResult } from '../src/contracts.js';
import { ReferenceRuntime } from '../src/runtime.js';
import { definePage, View } from '@anseronui/ui';
import { LayoutKernel, render } from '../src/kernel.js';

const kernels: LayoutKernel[] = [];
function kernel(): LayoutKernel { const value = new LayoutKernel(); kernels.push(value); return value; }
function node(id: number, style: Style = {}, children: RenderNode[] = []): RenderNode {
  return { id, kind: 'View', style, children, props: {}, events: [], frame: { x: 0, y: 0, width: 0, height: 0 } };
}
function request(tree: RenderNode[], overrides: Partial<RenderRequest> = {}): RenderRequest {
  return { type: 'Render', abi: CORE_ABI_VERSION, surfaceId: 1, generation: 1, revision: 1, round: 1,
    width: 320, height: 480, tree, previous: [], nextRequestId: 1, measureCache: [], ...overrides };
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function settle(core: LayoutKernel, input: RenderRequest): RenderResult {
  for (let i = 0; i < 12; i++) {
    const result = core.render(input);
    if (!result.measures.length) return result;
    input = { ...input, round: input.round + 1, nextRequestId: result.nextRequestId,
      measureCache: [...input.measureCache, ...result.measures.map(query => ({ key: query.key,
        width: Math.min(query.maxWidth, query.text.length * query.fontSize / 2), height: query.fontSize + 4, baseline: query.fontSize }))] };
  }
  throw new Error('Measurement did not converge');
}
afterEach(() => { for (const core of kernels.splice(0)) core.dispose(); vi.restoreAllMocks(); });

describe('persistent surface layout', () => {
  it('reuses nodes and clean caches for unchanged trees and visual-only updates', () => {
    const create = vi.spyOn(Node, 'create');
    const dirty = vi.spyOn(Node.prototype, 'markDirty');
    const core = kernel();
    const input = request([node(1, { flexDirection: 'column' }, [node(2, { width: 80, height: 20 }), node(3, { width: 40, height: 30 })])]);
    const initial = core.render(input);
    const root = create.mock.results[0].value as Node;
    const leaf = create.mock.results[2].value as Node;
    expect(root.isDirty()).toBe(false);
    expect(create).toHaveBeenCalledTimes(4);
    dirty.mockClear();
    const next = clone(input);
    next.previous = clone(input.tree); next.revision++;
    next.tree[0].children[0].props.backgroundColor = '#f00';
    expect(core.render(next).frames).toEqual(initial.frames);
    expect(create).toHaveBeenCalledTimes(4);
    expect(dirty).not.toHaveBeenCalled();
    expect(root.getChild(0)?.getChild(0)).toBe(leaf);
    next.tree[0].children[0].style.width = 120;
    core.render(next);
    expect(create).toHaveBeenCalledTimes(4);
    expect(dirty.mock.instances).toContain(leaf);
    expect(root.getChild(0)?.getChild(1)?.isDirty()).toBe(false);
  });

  it('restores every supported layout style to the same defaults as a fresh tree', () => {
    const core = kernel();
    const styles: Style[] = [
      { width: 200, height: 150, minWidth: 70, minHeight: 60, maxWidth: 250, maxHeight: 250,
        flexDirection: 'column', flexGrow: 1, flexShrink: 0, flexBasis: 120, flexWrap: 'wrap',
        gap: 5, rowGap: 7, columnGap: 9, alignItems: 'end', alignSelf: 'center', justifyContent: 'space-around',
        padding: 20, paddingHorizontal: 15, paddingVertical: 10, paddingTop: 4, paddingBottom: 8, paddingLeft: 6, paddingRight: 3,
        margin: 9, marginHorizontal: 4, marginVertical: 5, marginTop: 1, marginBottom: 2, marginLeft: 3, marginRight: 6,
        position: 'absolute', top: 17, right: 19, bottom: 21, left: 23, overflow: 'hidden' },
      { width: 180, height: 150, padding: 11, margin: 6, gap: 8 },
      { paddingTop: 2, marginLeft: 3, columnGap: 1, flexDirection: 'column' },
      {},
    ];
    for (const style of styles) {
      const input = request([node(1, style, [node(2, { width: 40, height: 15 }), node(3, { width: 30, height: 25 })])]);
      expect(core.render(clone(input)).frames).toEqual(render(clone(input)).frames);
    }
  });

  it('matches fresh layout through insert, reorder, removal, reparent and ancestor reversal', () => {
    const core = kernel();
    const create = vi.spyOn(Node, 'create');
    const child = (id: number) => node(id, { width: 20 + id, height: 20 });
    const trees = [
      [node(1, { flexDirection: 'column' }, [node(2, {}, [child(3)]), child(4)])],
      [node(1, { flexDirection: 'column' }, [child(4), node(2, {}, [child(3)]), child(5)])],
      [node(1, { flexDirection: 'column' }, [child(3), child(5)])],
      [node(3, {}, [node(1, { height: 50 }, [child(5)])])],
      [],
      [child(6)],
    ];
    for (const tree of trees) {
      const input = request(tree);
      const result = core.render(clone(input));
      const created = create.mock.calls.length;
      expect(result.frames).toEqual(render(clone(input)).frames);
      // A second identical request must not create any layout nodes.
      const before = create.mock.calls.length;
      core.render(clone(input));
      expect(create.mock.calls.length).toBe(before);
      expect(created).toBeGreaterThan(0);
    }
  });

  it('releases removed nodes while retaining descendants moved out of a removed parent', () => {
    const release = vi.spyOn(LayoutEngine.prototype, 'releaseSubtree');
    const core = kernel();
    core.render(request([node(1, {}, [node(2, {}, [node(3, { width: 40, height: 30 })])])]));
    core.render(request([node(1, {}, [node(3, { width: 40, height: 30 })])]));
    expect(release).toHaveBeenCalledTimes(1);
    expect((release.mock.instances[0] as LayoutEngine).getNodeCount()).toBe(3); // root + 1 + 3
    core.render(request([]));
    expect((release.mock.instances[0] as LayoutEngine).getNodeCount()).toBe(1);
  });

  it('invalidates placeholder measurements, changed text, fonts and changed host cache values', () => {
    const core = kernel();
    const create = vi.spyOn(Node, 'create');
    const input = request([node(1, { flexDirection: 'column' }, [{ ...node(2, { fontSize: 16 }), kind: 'Text', props: { text: 'hello' } }, node(3, { height: 10 })])]);
    const first = core.render(input);
    expect(first.measures.length).toBeGreaterThan(0);
    expect(first.commands).toEqual([]);
    const measured = { ...input, round: 2, nextRequestId: first.nextRequestId,
      measureCache: first.measures.map(query => ({ key: query.key, width: Math.min(query.maxWidth, 40), height: 20, baseline: 16 })) };
    let second = core.render(measured);
    for (let i = 0; second.measures.length && i < 10; i++) {
      measured.measureCache.push(...second.measures.map(query => ({ key: query.key, width: Math.min(query.maxWidth, 40), height: 20, baseline: 16 })));
      measured.round++; measured.nextRequestId = second.nextRequestId;
      second = core.render(measured);
    }
    expect(second.measures).toEqual([]);
    expect(second.frames.find(item => item.nodeId === 3)?.frame.y).toBe(20);
    expect(create).toHaveBeenCalledTimes(4);
    const updated = { ...measured, measureCache: measured.measureCache.map(item => ({ ...item, height: 35 })) };
    expect(core.render(updated).frames.find(item => item.nodeId === 3)?.frame.y).toBe(35);
    updated.tree[0].children[0].props.text = 'longer text';
    updated.tree[0].children[0].style.fontSize = 24;
    const fresh = kernel();
    expect(settle(core, clone(updated)).frames).toEqual(settle(fresh, clone(updated)).frames);
    expect(settle(core, { ...clone(updated), width: 100 }).frames).toEqual(settle(fresh, { ...clone(updated), width: 100 }).frames);
  });

  it('isolates surfaces, generations and kernels and ignores late release of an older generation', () => {
    const core = kernel(), other = kernel();
    const create = vi.spyOn(Node, 'create');
    const dispose = vi.spyOn(LayoutEngine.prototype, 'dispose');
    core.render(request([node(1, { width: 100 })]));
    core.render(request([node(1, { width: 200 })], { surfaceId: 2 }));
    other.render(request([node(1, { width: 50 })]));
    expect(create).toHaveBeenCalledTimes(6);
    core.render(request([node(1, { width: 80 })], { generation: 2 }));
    expect(dispose).toHaveBeenCalledTimes(1);
    core.execute({ type: 'ReleaseSurface', abi: CORE_ABI_VERSION, surfaceId: 1, generation: 1 });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => core.render(request([node(1)]))).toThrow('STALE_SURFACE_GENERATION');
    core.execute({ type: 'ReleaseSurface', abi: CORE_ABI_VERSION, surfaceId: 1, generation: 2 });
    expect(dispose).toHaveBeenCalledTimes(2);
    core.dispose(); core.dispose();
    expect(dispose).toHaveBeenCalledTimes(3);
    expect(other.render(request([node(1, { width: 50 })])).frames[0].frame.width).toBe(50);
  });

  it('frees persistent trees when ReferenceRuntime is disposed before a mount ACK', () => {
    const dispose = vi.spyOn(LayoutEngine.prototype, 'dispose');
    const runtime = new ReferenceRuntime({ bundleBuildId: 'persistent', pages: [definePage('home', () => View({ style: { width: 100, height: 20 } }))] });
    runtime.post({ protocolMajor: 1, protocolMinor: 0, bundleBuildId: 'persistent', runtimeEpoch: 1,
      surfaceId: 1, surfaceGeneration: 1, sequence: 1, ackSequence: 0,
      payload: { type: 'CreateSurface', page: 'home', width: 320, height: 480 } });
    expect(runtime.step()[0].payload.type).toBe('Commit');
    expect(dispose).not.toHaveBeenCalled();
    runtime.dispose(); runtime.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('drops a failed layout tree and can render again without retaining leaked nodes', () => {
    const core = kernel();
    const dispose = vi.spyOn(LayoutEngine.prototype, 'dispose');
    expect(() => core.render(request([node(1), node(1)]))).toThrow('INVALID_LAYOUT_NODE_ID');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(core.render(request([node(1, { width: 42, height: 20 })])).frames[0].frame.width).toBe(42);
  });
});
