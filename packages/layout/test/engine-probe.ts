import { LayoutEngine, FLEX_DIRECTION_ROW, EDGE_ALL, GUTTER_ALL, DIRECTION_LTR, DIRECTION_RTL, MEASURE_MODE_UNDEFINED } from "@anseronui/layout";
import type { Node } from "@anseronui/layout";

/** Shared entry for Node, native executable, native library and Wasm checks. */
export function layoutProbe(width: number, height: number, direction: number): string {
  const engine = new LayoutEngine("css");
  const root = engine.createNode();
  root.setFlexDirection(FLEX_DIRECTION_ROW);
  root.setWidth(width);
  root.setHeight(height);
  root.setPadding(EDGE_ALL, 2);
  root.setGap(GUTTER_ALL, 3);
  const text = engine.createNode();
  text.setFlexGrow(1);
  text.setFlexShrink(1);
  text.setMinWidth(0);
  let contentWidth: number = 47;
  text.setMeasureFunc((w, wm, _h, _hm) => {
    const measuredWidth = wm === MEASURE_MODE_UNDEFINED ? contentWidth : Math.min(w, contentWidth);
    return { width: measuredWidth, height: Math.ceil(contentWidth / Math.max(1, measuredWidth)) * 7 };
  });
  const box = engine.createNode();
  box.setWidth(13);
  box.setHeight(9);
  root.insertChild(text, 0);
  root.insertChild(box, 1);
  engine.calculateLayout(root, width, height, direction);
  const lines: string[] = [];
  lines.push(text.getComputedLeft() + "," + text.getComputedTop() + "," + text.getComputedWidth() + "," + text.getComputedHeight());
  lines.push(box.getComputedLeft() + "," + box.getComputedTop() + "," + box.getComputedWidth() + "," + box.getComputedHeight());
  contentWidth = 111;
  text.markDirty();
  engine.calculateLayout(root, width, height, direction);
  lines.push(text.getComputedWidth() + "," + text.getComputedHeight());
  root.removeChild(box);
  engine.releaseSubtree(box);
  engine.calculateLayout(root, width, height, direction === DIRECTION_LTR ? DIRECTION_RTL : DIRECTION_LTR);
  lines.push(text.getComputedLeft() + "," + text.getComputedWidth() + "," + engine.getNodeCount());
  const removed = engine.createNode();
  const removedChild = engine.createNode();
  removedChild.setMeasureFunc((_w, _wm, _h, _hm) => ({ width: 1, height: 1 }));
  removedChild.setBaselineFunc((_w, _h) => 1);
  removedChild.setContainerQueryResolver(() => { removedChild.setWidth(1); });
  removed.insertChild(removedChild, 0);
  root.insertChild(removed, 1);
  root.removeChild(removed);
  engine.releaseSubtree(removed);
  if (removed.getChildCount() !== 0 || removedChild.getParent() !== null || removedChild.measureFunc !== null || removedChild.baselineFunc !== null || removedChild.cqResolve !== null || engine.getNodeCount() !== 2) {
    throw new Error("Subtree release left nodes or callbacks");
  }
  // Persistent surfaces can retire hundreds of nodes in one update. Keep this
  // in the shared native/Wasm probe: ownership must survive repeated deletion.
  const retired: Node[] = [];
  for (let i = 0; i < 256; i++) retired.push(engine.createNode());
  for (let i = 0; i < retired.length; i++) {
    engine.releaseSubtree(retired[i]!);
    if (engine.getNodeCount() !== 2 + retired.length - i - 1) throw new Error("Bulk release lost node ownership");
  }
  engine.calculateLayout(root, width, height, direction);
  const other = new LayoutEngine();
  const foreignRoot = other.createNode();
  let foreignRejected: boolean = false;
  try { engine.calculateLayout(foreignRoot, width, height); } catch { foreignRejected = true; }
  if (!foreignRejected) throw new Error("Foreign root was accepted");
  foreignRejected = false;
  try { engine.releaseSubtree(foreignRoot); } catch { foreignRejected = true; }
  if (!foreignRejected || other.getNodeCount() !== 1) throw new Error("Foreign subtree ownership was lost");
  other.dispose();
  const detached = engine.createNode();
  detached.setContainerQueryResolver(() => { detached.setWidth(1); });
  engine.dispose();
  engine.dispose();
  if (root.getChildCount() !== 0 || text.getParent() !== null || text.measureFunc !== null || detached.cqResolve !== null) {
    throw new Error("Layout engine teardown left references or callbacks");
  }
  if (engine.getNodeCount() !== 0) throw new Error("Layout engine retained nodes after teardown");
  let rejected: boolean = false;
  try { engine.createNode(); } catch { rejected = true; }
  if (!rejected) throw new Error("Disposed engine accepted a new node");
  return lines.join(";");
}
