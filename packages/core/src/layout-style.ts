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

import type { RenderNode, RenderRequest, RenderResult, MeasureQuery, CoreRequest, CoreResult } from "./contracts.js";

export function measureKey(nodeId: number, kind: NodeKind, text: string, fontSize: number, maxWidth: number, props: RenderProps): string {
  return JSON.stringify([nodeId, kind, text, fontSize, maxWidth, props.fontWeight, props.fontStyle, props.lineHeight, props.numberOfLines, props.ellipsizeMode, props.spans]);
}
export function isMeasured(kind: NodeKind): boolean {
  return kind === "Text" || kind === "RichText" || kind === "TextInput";
}
export function textContent(host: RenderNode): string {
  return host.kind === "TextInput" ? String(host.props.value || host.props.placeholder || "")
    : host.kind === "RichText" ? (JSON.parse(String(host.props.spans ?? "[]")) as { text?: string }[]).map(span => span.text ?? "").join("")
    : String(host.props.text ?? "");
}
export function measurementValue(value: { width: number; height: number; baseline: number } | undefined): string {
  return value ? JSON.stringify([value.width, value.height, value.baseline]) : "missing";
}

export function layoutKey(host: RenderNode): string {
  const s = host.style;
  return JSON.stringify([host.kind, s.width, s.height, s.minWidth, s.minHeight, s.maxWidth, s.maxHeight,
    s.flexDirection, s.flexGrow, s.flexShrink, s.flexBasis, s.flexWrap, s.gap, s.rowGap, s.columnGap,
    s.alignItems, s.alignSelf, s.justifyContent, s.position, s.top, s.right, s.bottom, s.left, s.overflow,
    s.padding, s.paddingHorizontal, s.paddingVertical, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft,
    s.margin, s.marginHorizontal, s.marginVertical, s.marginTop, s.marginRight, s.marginBottom, s.marginLeft]);
}

/** Set effective values, including defaults for removed styles. Flexily setters
 * compare values before dirtying, so unchanged nodes keep their layout caches. */
export function updateStyle(node: Node, host: RenderNode): void {
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

