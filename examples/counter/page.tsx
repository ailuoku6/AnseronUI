import { Button, Text, View, definePage, useRouter, useEffect, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function Counter(): UIElement {
  const [count, setCount] = useState(0);
  const router = useRouter();
  const [routeInfo, setRouteInfo] = useState('{}');
  useEffect(() => { let active = true; void router.getParams().then(params => { if (active) setRouteInfo(JSON.stringify(params)); }).catch(error => { if (active) setRouteInfo(String(error)); }); return () => { active = false; }; }, []);
  return (
    <View style={{ padding: 16, gap: 12, width: 240, backgroundColor: "#f5f7fb" }}>
      <Text style={{ fontSize: 20 }}>Count: {count}</Text>
      <Button title="+1" onClick={() => setCount(value => value + 1)} />
      <Button title="打开 Async Form" onClick={() => { void router.push("async-form", { source: 'counter', count, message: '来自 Counter 的参数', options: { editable: true }, tags: ['路由', '示例'] }); }} />
      <Button title="返回上一页" onClick={() => { void router.back().catch(() => {}); }} />
      <Text>先点击 +1，再打开 Async Form 并返回，计数会保留。</Text>
      <Text testID="counter-route-params">路由参数: {routeInfo}</Text>
    </View>
  );
}

export const counterPage = definePage("counter", Counter);
