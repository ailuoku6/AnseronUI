import { View, Text, RichText, TextInput, Image, definePage, useState, useEffect, useServices } from "@anseronui/ui";
import type { UIElement, LayoutEvent } from "@anseronui/ui";

export function AppearanceShowcase(): UIElement {
  const [value, setValue] = useState("");
  return <View testID="appearance-showcase" style={{
    flexDirection: "column", padding: 18, gap: 16, borderRadius: 18, height: 340, flexShrink: 0,
    backgroundColor: "#ffffff", dmBackgroundColor: "#202634",
    borderWidth: 1, borderColor: "#e1e6ef", dmBorderColor: "#3a465c",
    shadowColor: "#33486a", dmShadowColor: "#080d18",
    shadowOpacity: 0.22, shadowRadius: 10, shadowOffsetY: 6,
  }}>
    <Text style={{ height: 26, fontSize: 20, fontWeight: "bold", color: "#19283f", dmColor: "#f2f5fc" }}>阴影与夜间模式</Text>
    <Text style={{ height: 36, fontSize: 13, color: "#61718a", dmColor: "#b0bfd8" }}>切换系统深色外观，背景、文字、边框和阴影会一起适配。</Text>
    <View style={{ flexDirection: "row", gap: 18, paddingVertical: 8 }}>
      <View testID="blue-shadow-card" style={{
        flexDirection: "column", flexGrow: 1, flexBasis: 0, height: 90,
        alignItems: "center", justifyContent: "center", borderRadius: 14,
        backgroundColor: "#eaf2ff", dmBackgroundColor: "#1b355a",
        borderWidth: 1, borderColor: "#b7d3ff", dmBorderColor: "#4b81c7",
        shadowColor: "#4285ed", dmShadowColor: "#5a9eff",
        shadowOpacity: 0.45, shadowRadius: 8, shadowOffsetY: 5,
      }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#235eaf", dmColor: "#b9d8ff" }}>蓝色外阴影</Text>
      </View>
      <View testID="purple-shadow-card" style={{
        flexDirection: "column", flexGrow: 1, flexBasis: 0, height: 90,
        alignItems: "center", justifyContent: "center", borderRadius: 14,
        backgroundColor: "#f3edff", dmBackgroundColor: "#3b2857",
        borderWidth: 1, borderColor: "#d6c3f7", dmBorderColor: "#9671c8",
        shadowColor: "#9a68d9", dmShadowColor: "#c38aff",
        shadowOpacity: 0.4, shadowRadius: 8, shadowOffsetX: -2, shadowOffsetY: 5,
      }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#7844b3", dmColor: "#e1c6ff" }}>紫色外阴影</Text>
      </View>
    </View>
    <RichText style={{ height: 24, fontSize: 15, color: "#46546b", dmColor: "#c9d4e8" }} spans={[
      { text: "富文本同样适配：" },
      { text: "蓝色", color: "#235eaf", dmColor: "#9bc7ff", fontWeight: "bold" },
      { text: " / " },
      { text: "紫色", color: "#7844b3", dmColor: "#d7aeff", fontWeight: "bold" },
    ]} />
    <TextInput testID="appearance-input" value={value} onChangeText={setValue}
      placeholder="输入内容，切换外观后仍会保留" returnKeyType="done"
      style={{
        height: 44, paddingHorizontal: 10, fontSize: 14, borderRadius: 9,
        backgroundColor: "#f1f4f9", dmBackgroundColor: "#151c29",
        color: "#19283f", dmColor: "#f2f5fc",
        placeholderTextColor: "#748198", dmPlaceholderTextColor: "#94a4be",
        borderWidth: 1, borderColor: "#dbe2ed", dmBorderColor: "#465570",
      }} />
  </View>;
}

export function AppearancePage(): UIElement {
  const services = useServices();
  const [theme, setTheme] = useState("loading");
  const [frame, setFrame] = useState("等待布局");
  const [source, setSource] = useState("loading");
  useEffect(() => {
    let active = true;
    let notified = false;
    const unsubscribe = services.appearance.subscribe(value => { notified = true; if (active) setTheme(value); });
    services.appearance.get().then(value => { if (active && !notified) setTheme(value); });
    return () => { active = false; unsubscribe(); };
  }, []);
  return <View testID="appearance-root" style={{
    flexDirection: "column", flexGrow: 1, padding: 24, gap: 18,
    backgroundColor: "#f3f5fa", dmBackgroundColor: "#111722",
  }}>
    <Text style={{ height: 32, fontSize: 25, fontWeight: "bold", color: "#19283f", dmColor: "#f2f5fc" }}>外观样式</Text>
    <View style={{ flexDirection: "row", height: 60, gap: 12 }}>
      <Image testID="appearance-image" src="asset://theme-light.png" dmSrc="asset://theme-dark.png"
        resizeMode="contain" style={{ width: 90, height: 45 }}
        onLoad={(value: string) => setSource(value)}
        onLayout={(value: LayoutEvent) => setFrame(value.x + "," + value.y + " " + value.width + "×" + value.height)} />
      <View style={{ flexDirection: "column", flexGrow: 1 }}>
        <Text testID="appearance-mode" style={{ fontSize: 14, lineHeight: 20, color: "#19283f", dmColor: "#f2f5fc" }}>{"主题: " + theme}</Text>
        <Text testID="appearance-image-source" style={{ fontSize: 11, lineHeight: 16, color: "#61718a", dmColor: "#b0bfd8" }}>{source}</Text>
        <Text testID="appearance-image-layout" style={{ fontSize: 11, lineHeight: 16, color: "#61718a", dmColor: "#b0bfd8" }}>{"onLayout: " + frame}</Text>
      </View>
    </View>
    <AppearanceShowcase />
  </View>;
}

export const appearancePage = definePage("appearance", AppearancePage);
