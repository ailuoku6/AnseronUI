import { Image, Text, View, createNativeComponent } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export const WindowPreview = createNativeComponent<{ windowId: number; revision: number }>("LjumpWindowThumbnail");
export const ApplicationIcon = createNativeComponent<{ bundleId: string }>("LjumpAppIcon");
export const windowCardStride = 276;

export function WindowCard(props: {
  id: number; pid: number; windowId: number; bundleId: string; app: string;
  title: string; context: string; document: string; reminder: string;
  selected: boolean; dragged: boolean; captureAllowed: boolean; revision: number;
  onOpen: () => void; onReminder: () => void; onRemove: () => void;
}): UIElement {
  return <View accessibilitySelected={props.selected} animation={{ duration: 140, easing: "easeOut" }}
    style={{ height: 266, flexShrink: 0, position: "relative", overflow: "hidden", borderRadius: 16, opacity: props.dragged ? 0.46 : 1, backgroundBlurRadius: 8, backgroundColor: "#f5f5f7ed", dmBackgroundColor: "#28282bed", borderWidth: 0.75, borderColor: props.selected ? "#007aff80" : "#0000001a", dmBorderColor: props.selected ? "#0a84ffb3" : "#ffffff26" }}>
    <ApplicationIcon nativeProps={{ bundleId: props.bundleId }} style={{ position: "absolute", left: 12, top: 11, width: 22, height: 22 }} />
    <Text numberOfLines={1} style={{ position: "absolute", left: 42, right: 48, top: 14, fontSize: 12, fontWeight: "bold", color: "#1d1d1f", dmColor: "#f5f5f7" }}>{props.app}</Text>
    <View style={{ position: "absolute", left: 12, right: 12, top: 44, height: 130, borderRadius: 9, overflow: "hidden", backgroundColor: "#00000009", dmBackgroundColor: "#00000029", borderWidth: 0.5, borderColor: "#00000012", dmBorderColor: "#ffffff14", alignItems: "center", justifyContent: "center" }}>
      {props.captureAllowed ? <WindowPreview nativeProps={{ windowId: props.windowId, revision: props.revision }} style={{ position: "absolute", left: 5, right: 5, top: 5, bottom: 5 }} /> : <ApplicationIcon nativeProps={{ bundleId: props.bundleId }} style={{ width: 48, height: 48 }} />}
    </View>
    <Text testID={`ljump-window-title:${props.pid}:${props.id}`} numberOfLines={2} style={{ position: "absolute", left: 13, right: 13, top: 185, height: 33, fontSize: 13, fontWeight: "bold", color: "#1d1d1f", dmColor: "#f5f5f7" }}>{props.title}</Text>
    <Text numberOfLines={1} accessibilityHint={props.document} style={{ position: "absolute", left: 13, right: 51, top: 220, fontSize: 11, color: "#6e6e73", dmColor: "#a1a1a6" }}>{props.context || props.document}</Text>
    {props.reminder ? <Text numberOfLines={1} style={{ position: "absolute", left: 13, right: 51, bottom: 11, fontSize: 10, color: "#6e6e73", dmColor: "#a1a1a6" }}>{props.reminder}</Text> : null}
    <View testID={`ljump-window:${props.pid}:${props.id}`} touchAction="none" accessibilityRole="button" accessibilityLabel={`打开 ${props.title}`} accessibilityHint={`${props.context}${props.document ? "，" + props.document : ""}。拖到另一个工作组可移动窗口`} onClick={props.onOpen} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
    <View accessibilityRole="button" accessibilityLabel={`设置提醒 ${props.title}`} onClick={props.onReminder} style={{ position: "absolute", right: 10, bottom: 10, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: props.reminder ? "#007aff10" : "#00000006", dmBackgroundColor: props.reminder ? "#0a84ff24" : "#ffffff0a" }}>
      <Image accessible={false} src={`asset://${props.reminder ? "bell-active" : "bell"}-light.png`} dmSrc={`asset://${props.reminder ? "bell-active" : "bell"}-dark.png`} style={{ width: 18, height: 18 }} />
    </View>
    <View testID={`ljump-remove:${props.pid}:${props.id}`} accessibilityRole="button" accessibilityLabel={`从工作组移除 ${props.title}`} accessibilityHint="保留应用窗口并取消提醒" onClick={props.onRemove} style={{ position: "absolute", right: 10, top: 9, width: 26, height: 26, borderRadius: 13, backgroundColor: "#00000007", dmBackgroundColor: "#ffffff10", alignItems: "center", justifyContent: "center" }}>
      <Image accessible={false} src="asset://close-light.png" dmSrc="asset://close-dark.png" style={{ width: 16, height: 16 }} />
    </View>
  </View>;
}
