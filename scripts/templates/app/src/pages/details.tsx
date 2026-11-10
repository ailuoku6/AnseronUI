import { Button, Text, View, definePage, useRouter, useState, useEffect } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function Details(): UIElement {
  const router = useRouter();
  const [params, setParams] = useState('{}');
  useEffect(() => { let active = true; void router.getParams().then(value => { if (active) setParams(JSON.stringify(value)); }); return () => { active = false; }; }, []);
  return <View style={{ flexDirection: "column", padding: 24, gap: 16, flexGrow: 1, backgroundColor: "#ffffff" }}>
    <Text style={{ fontSize: 22, fontWeight: "bold" }}>详情页</Text>
    <Text>通过 AnseronUI Router 从 Home 页面进入。</Text>
    <Text>路由参数: {params}</Text>
    <Button title="返回" onClick={() => { void router.back(); }} />
  </View>;
}

export const detailsPage = definePage("details", Details);
