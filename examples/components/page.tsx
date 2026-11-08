import { View, Text, RichText, Button, TextInput, ScrollView, Image, Video, definePage, useState } from "@anseronui/ui";
import type { UIElement, ScrollEvent, TouchEvent, LayoutEvent } from "@anseronui/ui";
import { LayoutShowcase } from "./layout-showcase.js";
import { AnimationShowcase } from "./animation-showcase.js";
import { FloatingBall } from "./floating-ball.js";

export function Components(): UIElement {
  const [showAnimation, setShowAnimation] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [count, setCount] = useState(0);
  const [value, setValue] = useState("");
  const [event, setEvent] = useState("等待操作");
  const [image, setImage] = useState("loading");
  const [video, setVideo] = useState("paused");
  const [control, setControl] = useState<"play" | "pause" | "stop">("pause");
  const [frame, setFrame] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [moves, setMoves] = useState(0);
  const [outerMoves, setOuterMoves] = useState(0);
  const [captureMoves, setCaptureMoves] = useState(0);
  const [touchAction, setTouchAction] = useState<"none" | "pan-y">("pan-y");
  const [stopBubble, setStopBubble] = useState(true);
  const [offset, setOffset] = useState(0);
  return (
    <View testID="components-root" onLayout={(size: LayoutEvent) => setViewport({ width: size.width, height: size.height })}
      style={{ flexDirection: "column", flexGrow: 1, backgroundColor: "#f3f5fa", overflow: "hidden" }}>
      <View style={{ flexDirection: "column", paddingHorizontal: 16, paddingVertical: 10, gap: 4, height: 112, flexShrink: 0, backgroundColor: "#ffffff" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 44 }}>
          <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: "bold", flexShrink: 1, minWidth: 0 }}>{showAnimation ? "动画实验室" : showLayout ? "布局样式实验室" : "基础组件实验室"}</Text>
          <View style={{ flexDirection: "row", gap: 4, flexShrink: 0 }}>
          <Button testID="animation-mode-toggle" title={showAnimation ? "返回" : "动画"} onClick={() => setShowAnimation(previous => !previous)} style={{ width: 52, height: 44, fontSize: 14 }} />
          <Button testID="layout-mode-toggle" title={showLayout ? "基础组件" : "布局样式"} onClick={() => { setShowAnimation(false); setShowLayout(previous => !previous); }} style={{ width: 96, height: 44, fontSize: 14 }} />
          </View>
        </View>
        <Text style={{ fontSize: 12, color: "#5c667a" }}>{showAnimation ? "状态过渡 · ref 串行 · 往返循环" : showLayout ? "8 组布局与样式 · 蓝色悬浮球可拖动" : "8 种组件 · 本地媒体 · 蓝色悬浮球可拖动"}</Text>
        <Text testID="component-event" numberOfLines={1} style={{ fontSize: 13, color: "#275de5" }}>事件: {event}</Text>
      </View>
      <ScrollView key={showAnimation ? "animation" : showLayout ? "layout" : "components"} testID="component-scroll" style={{ flexGrow: 1, flexDirection: "column" }}
        onScrollEnd={(data: ScrollEvent) => setOffset(Math.round(data.y))}>
        <View style={{ flexDirection: "column", padding: 16, gap: 16, flexShrink: 0 }}>
          {showAnimation ? <AnimationShowcase viewportWidth={viewport.width} /> : showLayout ? <LayoutShowcase viewportWidth={viewport.width} /> : <View style={{ flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>01 · View / Text</Text>
            <View testID="style-box" style={{ flexDirection: "row", padding: 12, gap: 10, height: 66, alignItems: "center", backgroundColor: "#e9efff", borderWidth: 1, borderColor: "#b7c9ff", borderRadius: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#275de5" }} />
              <Text style={{ color: "#275de5", fontSize: 16 }}>背景、边框、圆角、布局</Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 14, color: "#5c667a" }}>这是一段限制为一行的长文本，用来验证超出宽度后是否能正确显示省略号。</Text>
          </View>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>02 · Button / TextInput</Text>
            <TextInput testID="component-input" value={value} placeholder="输入文字，最多 24 字" maxLength={24}
              returnKeyType="done" autoCorrect={false} onChangeText={setValue}
              onFocus={() => setEvent("input focus")} onBlur={() => setEvent("input blur")}
              onSubmitEditing={() => setEvent("input submit")}
              style={{ height: 44, backgroundColor: "#f3f5fa", fontSize: 16, borderWidth: 1, borderColor: "#dce2ed", borderRadius: 6 }} />
            <Text testID="input-echo" numberOfLines={1} style={{ fontSize: 14 }}>输入: {value || "（空）"}</Text>
            <View style={{ flexDirection: "row", gap: 12, height: 42 }}>
              <Button testID="component-increment" title="点我 +1" onClick={() => { setCount(previous => previous + 1); setEvent("button tap"); }} />
              <Button testID="component-disabled" title="禁用按钮" disabled onClick={() => setEvent("disabled ERROR")} />
              <Text testID="component-count" style={{ fontSize: 16, alignSelf: "center" }}>点击: {count}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>03 · RichText</Text>
            <RichText testID="component-rich" style={{ fontSize: 16 }} spans={[
              { text: "普通 " }, { text: "粗体 ", fontWeight: "bold", color: "#275de5" },
              { text: "斜体 ", fontStyle: "italic" },
              { text: "点这里", color: "#d44c30", textDecorationLine: "underline", onClick: () => setEvent("rich span 3") },
              { text: "\n大号文字", fontSize: 24, color: "#17926b" },
            ]} />
          </View>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>04 · 触摸与长按</Text>
            <View style={{ flexDirection: "column", gap: 10 }} onTouchMoveCapture={() => setCaptureMoves(previous => previous + 1)} onTouchMove={() => setOuterMoves(previous => previous + 1)}>
              <View testID="touch-pad" accessibilityLabel="触摸测试区" touchAction={touchAction} style={{ height: 100, backgroundColor: "#e9efff", borderRadius: 8, alignItems: "center", justifyContent: "center" }}
                onTouchDown={() => setEvent("touch down")}
                onTouchMove={(touch: TouchEvent) => { setMoves(previous => previous + 1); if (stopBubble) touch.stopPropagation(); }}
                onTouchUp={() => setEvent("touch up")}
                onTouchCancel={() => setEvent("touch cancel")}
                onLongPress={() => setEvent("long press")}>
                <Text style={{ fontSize: 15, color: "#275de5" }}>按住并横向拖动 / 长按</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 16, height: 40, alignItems: "center" }}>
              <Button title={stopBubble ? "允许事件冒泡" : "阻止事件冒泡"} onClick={() => setStopBubble(previous => !previous)} />
              <Text testID="touch-bubble" style={{ fontSize: 14 }}>外层收到移动: {outerMoves}</Text>
            </View>
            <Text testID="touch-capture" style={{ fontSize: 14 }}>捕获收到移动: {captureMoves}</Text>
            <Button testID="touch-action-toggle" title={touchAction === "pan-y" ? "切换为完全接管触摸" : "切换为允许纵向滚动"} onClick={() => setTouchAction(previous => previous === "pan-y" ? "none" : "pan-y")} />
            <Text style={{ fontSize: 13, color: "#5c667a" }}>touchAction: {touchAction} · 横拖测试冒泡，纵拖测试滚动交接</Text>
            <Text testID="touch-moves" style={{ fontSize: 14 }}>移动事件: {moves}</Text>
          </View>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>05 · Image</Text>
            <Image testID="component-image" accessibilityLabel="本地示例图片" src="asset://showcase.png" resizeMode="contain"
              style={{ height: 150, borderRadius: 8, backgroundColor: "#e9efff" }}
              onLoad={() => setImage("loaded")} onError={() => setImage("error")} />
            <Text testID="image-state" style={{ fontSize: 14 }}>Image: {image}</Text>
          </View>
          <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>06 · Video</Text>
            <Video testID="component-video" src="asset://showcase.mp4" resizeMode="contain" controls={false} muted
              playControl={control} style={{ height: 170, backgroundColor: "#14223c", borderRadius: 8 }}
              onPlaybackStateChange={setVideo} onFirstFrame={() => setFrame(true)}
              onTimeUpdate={(time: number) => setSeconds(Math.floor(time / 1000))} onError={() => setVideo("error")} />
            <View style={{ flexDirection: "row", gap: 16, height: 40 }}>
              <Button testID="video-play" title="播放" onClick={() => setControl("play")} />
              <Button testID="video-pause" title="暂停" onClick={() => setControl("pause")} />
              <Button testID="video-stop" title="重置" onClick={() => setControl("stop")} />
            </View>
            <Text testID="video-state" style={{ fontSize: 14 }}>Video: {video}</Text>
            <Text testID="video-progress" style={{ fontSize: 14 }}>进度: {seconds}s · 首帧: {frame ? "yes" : "no"}</Text>
          </View>
          </View>}
          <Text testID="scroll-footer" style={{ fontSize: 14, color: "#5c667a", marginBottom: 24 }}>ScrollView 已到底 · 上次滚动: {offset}</Text>
        </View>
      </ScrollView>
      {viewport.width > 0 && viewport.height > 0 ? <FloatingBall width={viewport.width} height={viewport.height} /> : null}
    </View>
  );
}

export const componentsPage = definePage("components", Components);
