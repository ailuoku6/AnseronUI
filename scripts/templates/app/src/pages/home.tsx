import { Button, Text, View, definePage, useRouter } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function Home(): UIElement {
  const router = useRouter();
  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1, backgroundColor: "#f5f7fb" }}>
    <Text style={{ fontSize: 24, fontWeight: "bold" }}>__APP_NAME__</Text>
    <Text>欢迎使用你的全新跨平台 App。共享 TSX 页面运行于 iOS、Android 和 Web。</Text>
    <Button title="打开详情页" onClick={() => { void router.push("details"); }} />
  </View>;
}

export const homePage = definePage("home", Home);
