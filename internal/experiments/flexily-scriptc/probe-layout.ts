import { Node, parseLength } from './src/index-scriptc.js';
import * as C from './src/constants.js';

function dump(label: string, node: Node): void {
  console.log(label, node.getComputedLeft(), node.getComputedTop(), node.getComputedWidth(), node.getComputedHeight());
  for (let i = 0; i < node.getChildCount(); i++) dump(label + '.' + i, node.getChild(i)!);
}
function wrapped(width: number, direction: number): void {
  const root = Node.create({ defaults: 'css' });
  root.setWidth(width); root.setHeight(160); root.setFlexWrap(C.WRAP_WRAP);
  root.setPadding(C.EDGE_ALL, 3); root.setGap(C.GUTTER_ALL, 2);
  root.setAlignContent(C.ALIGN_SPACE_AROUND);
  for (let i = 0; i < 12; i++) {
    const child = Node.create(); child.setWidth(20 + i % 4 * 7); child.setHeight(10 + i % 3 * 4);
    child.setMargin(C.EDGE_START, 1); child.setFlexShrink(1);
    if (i % 3 === 0) child.setFlexGrow(1);
    root.insertChild(child, i);
  }
  root.calculateLayout(width, 160, direction); dump('wrap', root);
  root.getChild(2)!.setWidth(44); root.calculateLayout(width, 160, direction); dump('dirty', root);
  root.calculateLayout(width, 160, direction); dump('cache', root);
  root.removeChild(root.getChild(1)!); root.calculateLayout(width, 160, direction); dump('remove', root);
  root.freeRecursive();
}
for (let i = 0; i < 8; i++) wrapped(80 + i * 11, i % 2 === 0 ? C.DIRECTION_LTR : C.DIRECTION_RTL);
const root = Node.create(); root.setWidth(120); root.setHeight(80); root.setAlignItems(C.ALIGN_BASELINE);
const text = Node.create();
text.setMeasureFunc((width, widthMode, _height, _heightMode) => ({
  width: widthMode === C.MEASURE_MODE_UNDEFINED ? 60 : Math.min(width, 60), height: 17,
}));
text.setBaselineFunc((_width, height) => height - 3);
const box = Node.create(); box.setWidth(25); box.setHeight(25);
root.insertChild(text, 0); root.insertChild(box, 1); root.calculateLayout(120, 80); dump('baseline', root);
root.setWidth(50); root.calculateLayout(50, 80); dump('measure-shrink', root);
root.freeRecursive();
const nested = Node.create(); nested.setWidth(200); nested.setHeight(100);
const ratio = Node.create(); ratio.setWidthPercent(25); ratio.setAspectRatio(2); ratio.setMinWidth(30); ratio.setMaxHeight(40);
const absolute = Node.create(); absolute.setPositionType(C.POSITION_TYPE_ABSOLUTE);
absolute.setPosition(C.EDGE_RIGHT, 3); absolute.setPosition(C.EDGE_TOP, 4); absolute.setWidth(15); absolute.setHeight(20);
nested.insertChild(ratio, 0); nested.insertChild(absolute, 1); nested.calculateLayout(200, 100); dump('absolute-ratio', nested);
nested.freeRecursive();
const math = Node.create(); math.setWidth(200); math.setHeight(100);
const calc = Node.create(); calc.setWidth(parseLength('clamp(10ch, calc(50% - 2ch), 80ch)', { ch: 1, lh: 1 })); calc.setHeight(10);
math.insertChild(calc, 0); math.calculateLayout(200, 100); dump('math', math); math.freeRecursive();
const cq = Node.create(); cq.setWidth(100); cq.setHeight(80);
const queried = Node.create(); queried.setHeight(15);
queried.setContainerQueryResolver(() => { queried.setContainerQueryStyle({ width: { value: 37, unit: C.UNIT_POINT }, flexGrow: 0 }); });
cq.insertChild(queried, 0); cq.calculateLayout(100, 80); dump('cq', cq); queried.setContainerQueryResolver(null); cq.freeRecursive();
