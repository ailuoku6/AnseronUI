import { Button, Text, View, definePage, useRouter, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function Home(): UIElement {
  const router = useRouter();
  const [count, setCount] = useState(0);
  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1, backgroundColor: "#f5f7fb" }}>
    <Text style={{ fontSize: 24, fontWeight: "bold" }}>__APP_NAME__</Text>
    <Text>欢迎使用你的全新跨平台 App。共享 TSX 页面运行于 iOS、Android 和 Web。</Text>
    <Text>计数: {count}（返回后保留）</Text>
    <Button title="+1" onClick={() => setCount(value => value + 1)} />
    <Button title="打开详情页" onClick={() => { void router.push("details", { source: "home", count }); }} />
  </View>;
}

export const homePage = definePage("home", Home);
