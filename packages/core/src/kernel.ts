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
const EVENT_NAMES: EventKind[] = ["nativeComponent", "tap", "changeText", "longPress", "backPress", "focus", "blur", "submit", "scroll", "scrollEnd", "layout", "touchDown", "touchMove", "touchUp", "touchCancel", "spanClick", "loadSuccess", "loadFailure", "playStateDidChanged", "playTimeDidChanged", "firstFrameDidDisplay"];
function sameFrame(a: Frame, b: Frame): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function measureKey(nodeId: number, kind: NodeKind, text: string, fontSize: number, maxWidth: number, props: RenderProps): string {
  return JSON.stringify([nodeId, kind, text, fontSize, maxWidth, props.fontWeight, props.fontStyle, props.numberOfLines, props.ellipsizeMode, props.spans]);
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
      this.engine.calculateLayout(this.root, request.width, request.height);
      const frames = hosts.map(host => {
        const node = this.nodes.get(host.id)!.node;
        host.frame = { x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() };
        if (!Number.isFinite(host.frame.x) || !Number.isFinite(host.frame.y) || !finiteDimension(host.frame.width) || !finiteDimension(host.frame.height)) throw new Error("INVALID_LAYOUT_FRAME");
        return { nodeId: host.id, frame: host.frame };
      });
      return { type: "RenderResult", abi: CORE_ABI_VERSION, surfaceId: request.surfaceId, generation: request.generation,
        revision: request.revision, round: request.round, frames, measures: [...this.queries.values()], nextRequestId: this.nextRequestId,
        commands: this.queries.size === 0 ? diff(request.previous, request.tree) : [] };
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

function isMeasured(kind: NodeKind): boolean {
  return kind === "Text" || kind === "RichText" || kind === "Button" || kind === "TextInput";
}
function textContent(host: RenderNode): string {
  return host.kind === "TextInput" ? String(host.props.value || host.props.placeholder || "")
    : host.kind === "RichText" ? (JSON.parse(String(host.props.spans ?? "[]")) as { text?: string }[]).map(span => span.text ?? "").join("")
    : String(host.props.text ?? host.props.title ?? "");
}
function measurementValue(value: MeasureValue | undefined): string {
  return value ? JSON.stringify([value.width, value.height, value.baseline]) : "missing";
}

function layoutKey(host: RenderNode): string {
  const s = host.style;
  return JSON.stringify([host.kind, s.width, s.height, s.minWidth, s.minHeight, s.maxWidth, s.maxHeight,
    s.flexDirection, s.flexGrow, s.flexShrink, s.flexBasis, s.flexWrap, s.gap, s.rowGap, s.columnGap,
    s.alignItems, s.alignSelf, s.justifyContent, s.position, s.top, s.right, s.bottom, s.left, s.overflow,
    s.padding, s.paddingHorizontal, s.paddingVertical, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft,
    s.margin, s.marginHorizontal, s.marginVertical, s.marginTop, s.marginRight, s.marginBottom, s.marginLeft]);
}

/** Set effective values, including defaults for removed styles. Flexily setters
 * compare values before dirtying, so unchanged nodes keep their layout caches. */
function updateStyle(node: Node, host: RenderNode): void {
  const style = host.style;
  node.setOverflow(host.kind === "ScrollView" ? OVERFLOW_SCROLL : style.overflow === "hidden" ? OVERFLOW_HIDDEN : OVERFLOW_VISIBLE);
  node.setWidth(style.width ?? NaN);
  node.setHeight(style.height ?? NaN);
  node.setMinWidth(style.minWidth ?? { value: 0, unit: UNIT_AUTO });
  node.setMinHeight(style.minHeight ?? { value: 0, unit: UNIT_AUTO });
  node.setMaxWidth(style.maxWidth ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setMaxHeight(style.maxHeight ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setFlexBasis(style.flexBasis ?? { value: 0, unit: UNIT_AUTO });
  node.setFlexWrap(style.flexWrap === "wrap" ? WRAP_WRAP : WRAP_NO_WRAP);
  node.setPositionType(style.position === "absolute" ? POSITION_TYPE_ABSOLUTE : POSITION_TYPE_RELATIVE);
  node.setAlignSelf(({ auto: ALIGN_AUTO, start: ALIGN_FLEX_START, center: ALIGN_CENTER, end: ALIGN_FLEX_END, stretch: ALIGN_STRETCH })[style.alignSelf ?? "auto"]);
  node.setPosition(EDGE_TOP, style.top ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPosition(EDGE_RIGHT, style.right ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPosition(EDGE_BOTTOM, style.bottom ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPosition(EDGE_LEFT, style.left ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setFlexDirection(style.flexDirection === "column" ? FLEX_DIRECTION_COLUMN : FLEX_DIRECTION_ROW);
  node.setFlexGrow(style.flexGrow ?? 0);
  node.setFlexShrink(style.flexShrink ?? 1);
  node.setGap(GUTTER_ROW, style.rowGap ?? style.gap ?? 0);
  node.setGap(GUTTER_COLUMN, style.columnGap ?? style.gap ?? 0);
  node.setPadding(EDGE_TOP, style.paddingTop ?? style.paddingVertical ?? style.padding ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPadding(EDGE_RIGHT, style.paddingRight ?? style.paddingHorizontal ?? style.padding ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPadding(EDGE_BOTTOM, style.paddingBottom ?? style.paddingVertical ?? style.padding ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setPadding(EDGE_LEFT, style.paddingLeft ?? style.paddingHorizontal ?? style.padding ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setMargin(EDGE_TOP, style.marginTop ?? style.marginVertical ?? style.margin ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setMargin(EDGE_RIGHT, style.marginRight ?? style.marginHorizontal ?? style.margin ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setMargin(EDGE_BOTTOM, style.marginBottom ?? style.marginVertical ?? style.margin ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setMargin(EDGE_LEFT, style.marginLeft ?? style.marginHorizontal ?? style.margin ?? { value: 0, unit: UNIT_UNDEFINED });
  node.setAlignItems(({ start: ALIGN_FLEX_START, center: ALIGN_CENTER, end: ALIGN_FLEX_END, stretch: ALIGN_STRETCH })[style.alignItems ?? "stretch"]);
  node.setJustifyContent(({ start: JUSTIFY_FLEX_START, center: JUSTIFY_CENTER, end: JUSTIFY_FLEX_END, "space-between": JUSTIFY_SPACE_BETWEEN, "space-around": JUSTIFY_SPACE_AROUND, "space-evenly": JUSTIFY_SPACE_EVENLY })[style.justifyContent ?? "start"]);
}

export class LayoutKernel {
  private surfaces = new Map<number, SurfaceLayout>();

  execute(request: CoreRequest): CoreResult {
    if (request.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
    if (request.type === "ReleaseSurface") {
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

  dispose(): void { for (const surface of this.surfaces.values()) surface.dispose(); this.surfaces.clear(); }
}

// Stateless compatibility helper for isolated layout probes. Runtime compositions
// own a LayoutKernel; the compiled framework entry owns one per native/Wasm instance.
export function render(request: RenderRequest): RenderResult {
  const kernel = new LayoutKernel();
  try { return kernel.render(request); } finally { kernel.dispose(); }
}
const kernel = new LayoutKernel();
export function execute(input: string): string { return JSON.stringify(kernel.execute(JSON.parse(input) as CoreRequest)); }
export function dispose(): void { kernel.dispose(); }
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
          if (!previous || previous.events.includes(event) !== enabled) commands.push({ type: "BindEvent", nodeId: node.id, event, enabled });
        }
        append(node.children, node.id);
      });
    };
    append(nextTree, 0);
    return commands;
  }

