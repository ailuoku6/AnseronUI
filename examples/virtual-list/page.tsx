import { Button, Text, View, VirtualList, definePage, useState, useRouter, usePageEffect, useTimers, useRef } from '@anseronui/ui';
import type { UIElement, VirtualListHandle } from '@anseronui/ui';
interface Item { id: number; text: string; expanded: boolean }
function initialItems(): Item[] {
  const items: Item[] = [];
  for (let id = 0; id < 5000; id++) items.push({ id, text: '内容会根据宽度自动换行。'.repeat(id % 5 + 1), expanded: false });
  return items;
}
export function VirtualListPage(): UIElement {
  const [items, setItems] = useState(initialItems);
  const [ticks, setTicks] = useState(0);
  const timers = useTimers();
  const router = useRouter();
  const list = useRef<VirtualListHandle | null>(null);
  usePageEffect(() => {
    let id = 0;
    const tick = () => { setTicks(value => value + 1); id = timers.setTimeout(tick, 1000); };
    id = timers.setTimeout(tick, 1000);
    return () => timers.clearTimeout(id);
  }, []);
  return <View style={{ flexGrow: 1, flexDirection: 'column', backgroundColor: '#f5f7fb', dmBackgroundColor: '#111827' }}>
    <Text testID="list-active-ticks" style={{ color: '#172033', dmColor: '#f3f4f6' }}>可见秒数：{ticks}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
      <Button title="头部插入" testID="list-prepend" onClick={() => setItems(values => [{ id: -values.length, text: '新插入的可变高度内容', expanded: false }, ...values])} />
      <Button title="跳到第 4000 项" testID="list-jump" onClick={() => { void list.current?.scrollToIndex(4000); }} />
      <Button title="返回" onClick={() => { void router.back(); }} />
    </View>
    <VirtualList<Item> data={items} ref={list} testID="variable-list" estimatedItemHeight={100} overscan={300}
      keyExtractor={(item: Item) => item.id}
      renderItem={(item: Item) => <View testID={'list-row-' + item.id} style={{ flexDirection: 'column', padding: 12, gap: 6, backgroundColor: item.id % 2 === 0 ? '#ffffff' : '#eef2ff', dmBackgroundColor: item.id % 2 === 0 ? '#1f2937' : '#16243b' }}>
        <Text style={{ color: '#172033', dmColor: '#f3f4f6' }}>第 {item.id} 项</Text>
        <Text style={{ color: '#172033', dmColor: '#f3f4f6' }}>{item.text}</Text>
        {item.expanded ? <Text style={{ color: '#172033', dmColor: '#f3f4f6' }}>{'展开后追加内容，行高会自动重新测量。'.repeat(8)}</Text> : null}
        <Button title={item.expanded ? '收起' : '展开'} onClick={() => setItems(values => values.map(value => value.id === item.id ? { ...value, expanded: !value.expanded } : value))} />
      </View>} />
  </View>;
}
export const virtualListPage = definePage('virtual-list', VirtualListPage);
