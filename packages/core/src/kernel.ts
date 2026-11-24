import {
  ALIGN_AUTO, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_FLEX_START, ALIGN_STRETCH,
  EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_LEFT,
  GUTTER_ROW, GUTTER_COLUMN, POSITION_TYPE_ABSOLUTE, POSITION_TYPE_RELATIVE, WRAP_WRAP, WRAP_NO_WRAP,
  JUSTIFY_SPACE_AROUND, JUSTIFY_SPACE_EVENLY,
  FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW,
  JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_FLEX_START, JUSTIFY_SPACE_BETWEEN,
  LayoutEngine, MEASURE_MODE_UNDEFINED, OVERFLOW_HIDDEN, OVERFLOW_SCROLL, OVERFLOW_VISIBLE,
  UNIT_AUTO, UNIT_UNDEFINED,
} from "@anseronui/layout";
import type { Node } from "@anseronui/layout";
import { isU32 } from "@anseronui/protocol";
import type { Frame, NodeKind, EventKind, RenderProps, RenderCommand } from "@anseronui/protocol";
import { CORE_ABI_VERSION } from "./contracts.js";
import type { RenderNode, RenderRequest, RenderResult, MeasureQuery, CoreRequest, CoreResult } from "./contracts.js";
import { isMeasured, textContent, measurementValue, layoutKey, updateStyle } from "./layout-style.js";
import { FrameworkWire } from "./wire.js";
import { TransactionKernel } from "./transaction-kernel.js";
const EVENT_NAMES: EventKind[] = ["nativeComponent", "tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay"];
function sameFrame(a: Frame, b: Frame): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function measureKey(nodeId: number, kind: NodeKind, text: string, fontSize: number, maxWidth: number, props: RenderProps): string {
  return JSON.stringify([nodeId, kind, text, fontSize, maxWidth, props.fontWeight, props.fontStyle, props.lineHeight, props.numberOfLines, props.ellipsizeMode, props.spans]);
}
function finiteDimension(value: number): boolean { return Number.isFinite(value) && value >= 0; }

function flatten(tree: RenderNode[]): RenderNode[] {
  const result: RenderNode[] = [];
  const append = (node: RenderNode): void => { result.push(node); node.children.forEach(append); };
  tree.forEach(append); return result;
}
type Measurement = { key: string; value: string };
type LayoutRecord = { node: Node; host: RenderNode; layoutSignature: string; measureSignature: string; measurements: Measurement[] };
type MeasureValue = RenderRequest["measureCache"][number];

/** Owned by one Core instance, called only on that instance's owner thread. */
class SurfaceLayout {
  readonly engine = new LayoutEngine("css");
  readonly root = this.engine.createNode();
  readonly nodes = new Map<number, LayoutRecord>();
  private cache = new Map<string, MeasureValue>();
  private queries = new Map<string, MeasureQuery>();
  private nextRequestId = 1;
  private width = -1;

  constructor(readonly generation: number) {
    this.root.setFlexDirection(FLEX_DIRECTION_COLUMN);
  }

  render(request: RenderRequest): RenderResult {
    const started = request.profile ? Date.now() : 0;
    this.cache = new Map(request.measureCache.map(item => [item.key, item]));
    this.queries.clear();
    this.nextRequestId = request.nextRequestId;
    const widthChanged = this.width !== request.width;
    this.width = request.width;
    this.root.setWidth(request.width);
    this.root.setHeight(request.height);
    const hosts = flatten(request.tree);
    const wanted = new Set<number>();
    const retired: LayoutRecord[] = [];
    for (const host of hosts) {
      if (!isU32(host.id) || wanted.has(host.id)) throw new Error("INVALID_LAYOUT_NODE_ID");
      wanted.add(host.id);
      let record = this.nodes.get(host.id);
      if (record && (record.host.kind !== host.kind || record.host.nativeName !== host.nativeName)) {
        retired.push(record);
        this.nodes.delete(host.id);
        record = undefined;
      }
      if (!record) {
        record = { node: this.engine.createNode(), host, layoutSignature: "", measureSignature: "", measurements: [] };
        this.nodes.set(host.id, record);
        if (isMeasured(host.kind)) {
          const measured = record;
          record.node.setMeasureFunc((width, mode) => this.measure(measured, width, mode));
        }
      }
      record.host = host;
      const layoutSignature = layoutKey(host);
      if (layoutSignature !== record.layoutSignature) {
        updateStyle(record.node, host);
        record.layoutSignature = layoutSignature;
      }
      if (isMeasured(host.kind)) {
        const signature = measureKey(host.id, host.kind, textContent(host), host.style.fontSize ?? 16, 0, host.props);
        // Missing measurements used placeholder sizes; never keep those numeric
        // caches across rounds. Also invalidate when a host cache entry changes.
        if (widthChanged || signature !== record.measureSignature || record.measurements.some(item =>
          item.value === "missing" || item.value !== measurementValue(this.cache.get(item.key)))) {
          record.node.markDirty();
          record.measurements = [];
        }
        record.measureSignature = signature;
      }
    }
    for (const [id, record] of [...this.nodes]) if (!wanted.has(id)) {
      retired.push(record);
      this.nodes.delete(id);
    }
    // Unlink retired parents before moving survivors, so reparenting can never
    // accidentally free a retained descendant (including ancestor reversals).
    for (const record of retired) record.node.getParent()?.removeChild(record.node);
    const syncChildren = (children: RenderNode[], parent: Node): void => {
      children.forEach((host, index) => {
        const node = this.nodes.get(host.id)!.node;
        if (parent.getChild(index) !== node) parent.insertChild(node, index);
        syncChildren(host.children, node);
      });
    };
    // Detach moved survivors first: a new parent may have been their descendant.
    const detachMoved = (children: RenderNode[], parent: Node): void => {
      for (const host of children) {
        const node = this.nodes.get(host.id)!.node;
        if (node.getParent() !== parent) node.getParent()?.removeChild(node);
        detachMoved(host.children, node);
      }
    };
    detachMoved(request.tree, this.root);
    syncChildren(request.tree, this.root);
    for (const record of retired) {
      if (record.node.getChildCount() !== 0) throw new Error("RETIRED_LAYOUT_HAS_CHILDREN:" + record.host.id);
      this.engine.releaseSubtree(record.node);
    }
    try {
      const layoutStarted = request.profile ? Date.now() : 0;
      this.engine.calculateLayout(this.root, request.width, request.height);
      const frames = hosts.map(host => {
        const node = this.nodes.get(host.id)!.node;
        host.frame = { x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() };
        if (!Number.isFinite(host.frame.x) || !Number.isFinite(host.frame.y) || !finiteDimension(host.frame.width) || !finiteDimension(host.frame.height)) {
          if (this.queries.size === 0) throw new Error("INVALID_LAYOUT_FRAME:" + host.id + ":" + JSON.stringify(host.frame));
          // Intrinsic containers can have unresolved alignment while text is
          // awaiting native measurement. These provisional frames never commit.
          host.frame = { x: 0, y: 0, width: 0, height: 0 };
        }
        return { nodeId: host.id, frame: host.frame };
      });
      const diffStarted = request.profile ? Date.now() : 0;
      const commands = this.queries.size === 0 ? diff(request.previous, request.tree) : [];
      const timings = request.profile ? { syncMs: layoutStarted - started, layoutMs: diffStarted - layoutStarted, diffMs: Date.now() - diffStarted } : undefined;
      return { type: "RenderResult", abi: CORE_ABI_VERSION, surfaceId: request.surfaceId, generation: request.generation,
        revision: request.revision, round: request.round, frames, measures: [...this.queries.values()], nextRequestId: this.nextRequestId,
        commands, timings };
    } finally {
      // Measure callbacks read current-round data only; don't retain message caches.
      this.cache.clear();
      this.queries.clear();
    }
  }

  private measure(record: LayoutRecord, width: number, mode: number): { width: number; height: number } {
    const host = record.host;
    const maxWidth = mode === MEASURE_MODE_UNDEFINED || !Number.isFinite(width) ? this.width : Math.max(0, width);
    const text = textContent(host);
    const fontSize = host.style.fontSize ?? 16;
    const key = measureKey(host.id, host.kind, text, fontSize, maxWidth, host.props);
    const cached = this.cache.get(key);
    const value = measurementValue(cached);
    const held = record.measurements.find(item => item.key === key);
    if (held) held.value = value;
    else record.measurements.push({ key, value });
    if (cached) return { width: cached.width, height: cached.height };
    if (!this.queries.has(key)) {
      const requestId = this.nextRequestId++;
      if (!isU32(requestId)) throw new Error("REQUEST_ID_OVERFLOW");
      this.queries.set(key, { requestId, nodeId: host.id, kind: host.kind as MeasureQuery["kind"], text, fontSize, maxWidth, props: host.props, key });
    }
    return { width: 0, height: 0 };
  }

  dispose(): void { this.engine.dispose(); this.nodes.clear(); this.cache.clear(); this.queries.clear(); }
}

export class LayoutKernel {
  private surfaces = new Map<number, SurfaceLayout>();
  private transactions = new TransactionKernel();

  execute(request: CoreRequest): CoreResult {
    if (request.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
    if (request.type !== "Render" && request.type !== "ReleaseSurface") return this.transactions.execute(request);
    if (request.type === "ReleaseSurface") {
      this.transactions.release(request.surfaceId, request.generation);
      const surface = this.surfaces.get(request.surfaceId);
      if (surface?.generation === request.generation) {
        surface.dispose();
        this.surfaces.delete(request.surfaceId);
      }
      return { type: "SurfaceReleased", abi: CORE_ABI_VERSION, surfaceId: request.surfaceId, generation: request.generation };
    }
    return this.render(request);
  }

  render(request: RenderRequest): RenderResult {
    if (request.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
    if (!finiteDimension(request.width) || !finiteDimension(request.height)) throw new Error("INVALID_SURFACE_SIZE");
    let surface = this.surfaces.get(request.surfaceId);
    if (surface && surface.generation > request.generation) throw new Error("STALE_SURFACE_GENERATION");
    if (surface && surface.generation !== request.generation) {
      surface.dispose();
      this.surfaces.delete(request.surfaceId);
      surface = undefined;
    }
    if (!surface) { surface = new SurfaceLayout(request.generation); this.surfaces.set(request.surfaceId, surface); }
    try { return surface.render(request); }
    catch (error) { surface.dispose(); this.surfaces.delete(request.surfaceId); throw error; }
  }

  dispose(): void { for (const surface of this.surfaces.values()) surface.dispose(); this.surfaces.clear(); this.transactions.dispose(); }
}

// Stateless compatibility helper for isolated layout probes. Runtime compositions
// own a LayoutKernel; the compiled framework entry owns one per native/Wasm instance.
export function render(request: RenderRequest): RenderResult {
  const kernel = new LayoutKernel();
  try { return kernel.render(request); } finally { kernel.dispose(); }
}
const kernel = new LayoutKernel();
const wire = new FrameworkWire();
export function execute(input: string): string {
  return wire.execute(input, value => {
    // Keep failures inside the ABI boundary: an AOT exception must not unwind
    // through the native borrowed-string bridge or strand a Business draft.
    const header = JSON.parse(value) as { surfaceId: number; generation: number; transactionId?: number };
    try { return JSON.stringify(kernel.execute(JSON.parse(value) as CoreRequest)); }
    catch (error) { return JSON.stringify({ type: "CoreFailure", abi: CORE_ABI_VERSION, surfaceId: header.surfaceId,
      generation: header.generation, transactionId: header.transactionId ?? 0, code: String(error).slice(0, 4096) }); }
  });
}
export function dispose(): void { wire.clear(); kernel.dispose(); }
export function version(): number { return CORE_ABI_VERSION; }

function diff(oldTree: RenderNode[], nextTree: RenderNode[]): RenderCommand[] {
    const oldNodes = new Map(flatten(oldTree).map(node => [node.id, node]));
    const nextNodes = new Map(flatten(nextTree).map(node => [node.id, node]));
    const commands: RenderCommand[] = [];
    const remove = (nodes: RenderNode[]): void => {
      for (const node of nodes) {
        if (!nextNodes.has(node.id)) commands.push({ type: "RemoveNode", nodeId: node.id });
        else remove(node.children);
      }
    };
    remove(oldTree);
    const append = (nodes: RenderNode[], parentId: number): void => {
      nodes.forEach((node, index) => {
        const previous = oldNodes.get(node.id);
        if (!previous) commands.push({ type: "CreateNode", nodeId: node.id, kind: node.kind, ...(node.nativeName ? { nativeName: node.nativeName } : {}) });
        commands.push({ type: previous ? "MoveChild" : "InsertChild", parentId, nodeId: node.id, index });
        if (!previous || JSON.stringify(previous.props) !== JSON.stringify(node.props)) commands.push({ type: "SetProps", nodeId: node.id, props: node.props });
        if (!previous || !sameFrame(previous.frame, node.frame)) commands.push({ type: "SetFrame", nodeId: node.id, frame: node.frame });
        for (const event of EVENT_NAMES) {
          const enabled = node.events.includes(event);
          // New nodes start with no bindings. Avoid emitting twenty disabled
          // bindings per primitive, especially for composed controls in lists.
          if ((previous?.events.includes(event) ?? false) !== enabled) commands.push({ type: "BindEvent", nodeId: node.id, event, enabled });
        }
        append(node.children, node.id);
      });
    };
    append(nextTree, 0);
    return commands;
  }

