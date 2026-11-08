import { Node, parseLength, LengthError } from './src/index-scriptc.js';
import * as C from './src/constants.js';
function dump(label: string, node: Node): void {
  console.log(label, node.getComputedLeft(), node.getComputedTop(), node.getComputedWidth(), node.getComputedHeight());
  for (let i = 0; i < node.getChildCount(); i++) dump(label + '.' + i, node.getChild(i)!);
}
function errors(input: string): void {
  try { parseLength(input, { ch: 1, lh: 1 }); console.log('accepted', input); }
  catch (error) { if (error instanceof LengthError) console.log(error.name, error.message); else throw error; }
}
errors('bogus'); errors('2px'); errors('clamp(1ch, 2ch)'); errors('calc(3ch / 0)');
const reentrant = Node.create(); reentrant.setWidth(70); reentrant.setHeight(50); reentrant.setFlexWrap(C.WRAP_WRAP);
for (let i = 0; i < 5; i++) {
  const child = Node.create(); child.setWidth(30); child.setHeight(10); reentrant.insertChild(child, i);
}
const outer = Node.create(); outer.setWidth(100); outer.setHeight(80); outer.setFlexWrap(C.WRAP_WRAP);
for (let i = 0; i < 5; i++) {
  const child = Node.create();
  child.setMeasureFunc((_width, _widthMode, _height, _heightMode) => {
    reentrant.calculateLayout(70, 50);
    return { width: 35, height: 11 };
  });
  outer.insertChild(child, i);
}
outer.calculateLayout(100, 80); dump('reentrant', outer); dump('inner', reentrant);
outer.freeRecursive(); reentrant.freeRecursive();
for (let seed = 0; seed < 12; seed++) {
  const root = Node.create({ defaults: 'css' }); root.setWidth(110 + seed * 3); root.setHeight(150); root.setFlexDirection(C.FLEX_DIRECTION_COLUMN);
  for (let row = 0; row < 3; row++) {
    const parent = Node.create(); parent.setFlexGrow(1); parent.setPadding(C.EDGE_ALL, 2); parent.setGap(C.GUTTER_ALL, 2);
    root.insertChild(parent, row);
    for (let col = 0; col < 4; col++) {
      const child = Node.create(); child.setWidth(15 + (seed + col) % 7); child.setHeight(8 + row); child.setFlexGrow(1);
      parent.insertChild(child, col);
    }
  }
  root.calculateLayout(110 + seed * 3, 150); dump('nested', root);
  root.getChild(1)!.getChild(2)!.setWidth(40 + seed); root.calculateLayout(110 + seed * 3, 150); dump('nested-dirty', root);
  root.calculateLayout(90, 150, C.DIRECTION_RTL); dump('nested-resize', root);
  root.freeRecursive();
}
const fit = Node.create(); fit.setHeight(40); fit.setFitWidth([30, 60, 90]);
const fitChild = Node.create(); fitChild.setWidth(45); fitChild.setHeight(10); fit.insertChild(fitChild, 0);
fit.calculateLayout(undefined, 40); dump('fit-width', fit); fit.freeRecursive();
const cq = Node.create(); cq.setWidth(100); cq.setHeight(30); cq.setContainerType(C.CONTAINER_TYPE_INLINE_SIZE); cq.setContainSize(true);
const cqi = Node.create(); cqi.setWidth({ value: 50, unit: C.UNIT_CQI }); cqi.setHeight(10); cq.insertChild(cqi, 0);
cq.calculateLayout(100, 30); dump('cqi', cq); cq.freeRecursive();
