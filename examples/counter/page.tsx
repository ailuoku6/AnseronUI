import { Button, Text, View, definePage, useRouter, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function Counter(): UIElement {
  const [count, setCount] = useState(0);
  const router = useRouter();
  return (
    <View style={{ padding: 16, gap: 12, width: 240, backgroundColor: "#f5f7fb" }}>
      <Text style={{ fontSize: 20 }}>Count: {count}</Text>
      <Button title="+1" onClick={() => setCount(value => value + 1)} />
      <Button title="打开 Async Form" onClick={() => { void router.push("async-form"); }} />
    </View>
  );
}

export const counterPage = definePage("counter", Counter);
