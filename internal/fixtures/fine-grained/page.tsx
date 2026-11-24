import { View, definePage, useState } from '@anseronui/ui';
function Leaf({ index }: { index: number }) {
  const [opacity, set] = useState(1);
  return <View testID={index === 0 ? 'fine-target' : undefined} onClick={() => set(opacity === 1 ? 0.5 : 1)} style={{ width: 1, height: 1, opacity }} />;
}
function mounted(count: number) {
  return definePage('fine-' + count, () => <View>{Array.from({ length: count }, (_, index) => <Leaf key={index} index={index} />)}</View>);
}
export const fine100 = mounted(100);
export const fine1000 = mounted(1000);
export const fine10000 = mounted(10000);
