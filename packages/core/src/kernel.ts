import {
  ALIGN_AUTO, ALIGN_CENTER, ALIGN_FLEX_END, ALIGN_FLEX_START, ALIGN_STRETCH,
  EDGE_TOP, EDGE_RIGHT, EDGE_BOTTOM, EDGE_LEFT, EDGE_HORIZONTAL, EDGE_VERTICAL,
  GUTTER_ROW, GUTTER_COLUMN, POSITION_TYPE_ABSOLUTE, POSITION_TYPE_RELATIVE, WRAP_WRAP, WRAP_NO_WRAP,
  JUSTIFY_SPACE_AROUND, JUSTIFY_SPACE_EVENLY,
  EDGE_ALL, FLEX_DIRECTION_COLUMN, FLEX_DIRECTION_ROW, GUTTER_ALL,
  JUSTIFY_CENTER, JUSTIFY_FLEX_END, JUSTIFY_FLEX_START, JUSTIFY_SPACE_BETWEEN,
  LayoutEngine, MEASURE_MODE_UNDEFINED, OVERFLOW_HIDDEN, OVERFLOW_SCROLL,
} from "@anseronui/layout";
import type { Node } from "@anseronui/layout";
import { isU32 } from "@anseronui/protocol";
import type { Frame, NodeKind, EventKind, RenderProps, RenderCommand } from "@anseronui/protocol";
import { CORE_ABI_VERSION } from "./contracts.js";
import type { RenderNode, RenderRequest, RenderResult, MeasureQuery } from "./contracts.js";
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
export function render(request: RenderRequest): RenderResult {
  if (request.abi !== CORE_ABI_VERSION) throw new Error("CORE_ABI_MISMATCH");
  if (!finiteDimension(request.width) || !finiteDimension(request.height)) throw new Error("INVALID_SURFACE_SIZE");
  const cache = new Map(request.measureCache.map(item => [item.key, item]));
  let nextRequestId = request.nextRequestId;
    const engine = new LayoutEngine("css");
    const root = engine.createNode();
    root.setWidth(request.width); root.setHeight(request.height); root.setFlexDirection(FLEX_DIRECTION_COLUMN);
    const nodeMap = new Map<number, Node>();
    const queries = new Map<string, MeasureQuery>();
    const attach = (host: RenderNode, parent: Node, index: number): void => {
      const node = engine.createNode();
      nodeMap.set(host.id, node);
      const style = host.style;
      // A scroll viewport must shrink to the available space while its content
      // keeps its natural size. CSS auto minimums otherwise expand the entire
      // page to the height of the scroll content, leaving nothing to scroll.
      if (host.kind === "ScrollView") node.setOverflow(OVERFLOW_SCROLL);
      else if (style.overflow === "hidden") node.setOverflow(OVERFLOW_HIDDEN);
      if (style.width !== undefined) node.setWidth(style.width);
      if (style.height !== undefined) node.setHeight(style.height);
      if (style.maxWidth !== undefined) node.setMaxWidth(style.maxWidth);
      if (style.maxHeight !== undefined) node.setMaxHeight(style.maxHeight);
      if (style.flexBasis !== undefined) node.setFlexBasis(style.flexBasis);
      if (style.flexWrap !== undefined) node.setFlexWrap(style.flexWrap === "wrap" ? WRAP_WRAP : WRAP_NO_WRAP);
      if (style.position !== undefined) node.setPositionType(style.position === "absolute" ? POSITION_TYPE_ABSOLUTE : POSITION_TYPE_RELATIVE);
      if (style.alignSelf !== undefined) node.setAlignSelf(({ auto: ALIGN_AUTO, start: ALIGN_FLEX_START, center: ALIGN_CENTER, end: ALIGN_FLEX_END, stretch: ALIGN_STRETCH })[style.alignSelf]);
      for (const [name, edge] of [["top", EDGE_TOP], ["right", EDGE_RIGHT], ["bottom", EDGE_BOTTOM], ["left", EDGE_LEFT]] as const) {
        if (style[name] !== undefined) node.setPosition(edge, style[name]!);
      }
      if (style.minWidth !== undefined) node.setMinWidth(style.minWidth);
      if (style.minHeight !== undefined) node.setMinHeight(style.minHeight);
      if (style.flexDirection !== undefined) node.setFlexDirection(style.flexDirection === "row" ? FLEX_DIRECTION_ROW : FLEX_DIRECTION_COLUMN);
      if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow);
      if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);
      if (style.gap !== undefined) node.setGap(GUTTER_ALL, style.gap);
      if (style.padding !== undefined) node.setPadding(EDGE_ALL, style.padding);
      if (style.margin !== undefined) node.setMargin(EDGE_ALL, style.margin);
      if (style.rowGap !== undefined) node.setGap(GUTTER_ROW, style.rowGap);
      if (style.columnGap !== undefined) node.setGap(GUTTER_COLUMN, style.columnGap);
      for (const [name, edge] of [["paddingHorizontal", EDGE_HORIZONTAL], ["paddingVertical", EDGE_VERTICAL], ["paddingTop", EDGE_TOP], ["paddingRight", EDGE_RIGHT], ["paddingBottom", EDGE_BOTTOM], ["paddingLeft", EDGE_LEFT]] as const) {
        if (style[name] !== undefined) node.setPadding(edge, style[name]!);
      }
      for (const [name, edge] of [["marginHorizontal", EDGE_HORIZONTAL], ["marginVertical", EDGE_VERTICAL], ["marginTop", EDGE_TOP], ["marginRight", EDGE_RIGHT], ["marginBottom", EDGE_BOTTOM], ["marginLeft", EDGE_LEFT]] as const) {
        if (style[name] !== undefined) node.setMargin(edge, style[name]!);
      }
      if (style.alignItems !== undefined) node.setAlignItems(({ start: ALIGN_FLEX_START, center: ALIGN_CENTER, end: ALIGN_FLEX_END, stretch: ALIGN_STRETCH })[style.alignItems]);
      if (style.justifyContent !== undefined) node.setJustifyContent(({ start: JUSTIFY_FLEX_START, center: JUSTIFY_CENTER, end: JUSTIFY_FLEX_END, "space-between": JUSTIFY_SPACE_BETWEEN, "space-around": JUSTIFY_SPACE_AROUND, "space-evenly": JUSTIFY_SPACE_EVENLY })[style.justifyContent]);
      if (host.kind === "Text" || host.kind === "RichText" || host.kind === "Button" || host.kind === "TextInput") {
        const content = host.kind === "TextInput"
          ? String(host.props.value || host.props.placeholder || "")
          : host.kind === "RichText" ? ((JSON.parse(String(host.props.spans ?? "[]")) as { text?: string }[]).map(span => span.text ?? "").join(""))
          : String(host.props.text ?? host.props.title ?? "");
        const fontSize = style.fontSize ?? 16;
        node.setMeasureFunc((width, mode) => {
          const maxWidth = mode === MEASURE_MODE_UNDEFINED || !Number.isFinite(width) ? request.width : Math.max(0, width);
          const key = measureKey(host.id, host.kind, content, fontSize, maxWidth, host.props);
          const cached = cache.get(key);
          if (cached) return { width: cached.width, height: cached.height };
          if (!queries.has(key)) {
            const requestId = nextRequestId++;
            if (!isU32(requestId)) throw new Error("REQUEST_ID_OVERFLOW");
            queries.set(key, { requestId, nodeId: host.id, kind: host.kind as MeasureQuery["kind"], text: content, fontSize, maxWidth, props: host.props, key });
          }
          return { width: 0, height: 0 };
        });
      }
      parent.insertChild(node, index);
      host.children.forEach((child, childIndex) => attach(child, node, childIndex));
    };
    try {
      request.tree.forEach((host, index) => attach(host, root, index));
      engine.calculateLayout(root, request.width, request.height);
      for (const host of flatten(request.tree)) {
        const node = nodeMap.get(host.id)!;
        host.frame = { x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() };
      }
    } finally { engine.dispose(); }

  const frames = flatten(request.tree).map(node => ({ nodeId: node.id, frame: node.frame }));
  for (const item of frames) {
    if (!Number.isFinite(item.frame.x) || !Number.isFinite(item.frame.y) || !finiteDimension(item.frame.width) || !finiteDimension(item.frame.height)) throw new Error("INVALID_LAYOUT_FRAME");
  }
  return { abi: CORE_ABI_VERSION, surfaceId: request.surfaceId, generation: request.generation,
    revision: request.revision, round: request.round, frames, measures: [...queries.values()], nextRequestId,
    commands: queries.size === 0 ? diff(request.previous, request.tree) : [] };
}
export function execute(input: string): string { return JSON.stringify(render(JSON.parse(input) as RenderRequest)); }
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

