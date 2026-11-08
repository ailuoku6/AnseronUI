import { View, Text, Button, useState } from "@anseronui/ui";
import type { LayoutEvent, Style, UIElement } from "@anseronui/ui";

function Card(props: { title: string; note: string; children?: UIElement | UIElement[] }): UIElement {
  return <View style={{ flexDirection: "column", padding: 14, gap: 10, borderRadius: 12, backgroundColor: "#ffffff", flexShrink: 0 }}>
    <Text style={{ fontSize: 17, fontWeight: "bold", color: "#14223c" }}>{props.title}</Text>
    <Text style={{ fontSize: 12, color: "#5c667a" }}>{props.note}</Text>
    {props.children}
  </View>;
}
function Tile(props: { id?: string; text: string; color?: string; style?: Style }): UIElement {
  return <View testID={props.id} style={{ alignItems: "center", justifyContent: "center", backgroundColor: props.color ?? "#275de5", borderRadius: 4, ...props.style }}>
    <Text style={{ fontSize: 11, color: "#ffffff" }}>{props.text}</Text>
  </View>;
}

export function LayoutShowcase(props: { viewportWidth: number }): UIElement {
  const [narrow, setNarrow] = useState(false);
  const [measured, setMeasured] = useState("");
  const width = Math.max(120, Math.min(narrow ? 220 : 280, props.viewportWidth - 60));
  return <View testID="layout-showcase" style={{ flexDirection: "column", gap: 16, flexShrink: 0 }}>
    <Card title="布局与样式检查" note="彩色块是布局边界；切换画布宽度后，对照每组说明观察重排。悬浮球可随时拖动。">
      <Button testID="layout-width-toggle" title={narrow ? "切换宽画布" : "切换窄画布"} onClick={() => setNarrow(previous => !previous)} />
      <Text testID="layout-measurement" style={{ fontSize: 12, color: "#275de5" }}>{"画布: " + width + " · 实测: " + measured}</Text>
    </Card>
    <Card title="01 · 主轴排列" note="row / space-between：三个 40 宽的方块左右贴内边距，中间居中；padding=10。">
      <View testID="layout-between" onLayout={(frame: LayoutEvent) => setMeasured(Math.round(frame.width) + " × " + Math.round(frame.height))}
        style={{ width, height: 64, padding: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#e9efff" }}>
        <Tile id="layout-between-a" text="A" style={{ width: 40, height: 40 }} />
        <Tile id="layout-between-b" text="B" color="#17926b" style={{ width: 40, height: 40 }} />
        <Tile id="layout-between-c" text="C" color="#d77926" style={{ width: 40, height: 40 }} />
      </View>
      <Text style={{ fontSize: 12 }}>space-evenly：块与边缘、块与块等距</Text>
      <View testID="layout-evenly" style={{ width, height: 44, flexDirection: "row", justifyContent: "space-evenly", alignItems: "center", backgroundColor: "#edf8f3" }}>
        <Tile text="A" style={{ width: 32, height: 28 }} /><Tile text="B" style={{ width: 32, height: 28 }} /><Tile text="C" style={{ width: 32, height: 28 }} />
      </View>
      <Text style={{ fontSize: 12 }}>column：两个 28 高的块，纵向 gap=8，水平居中</Text>
      <View testID="layout-column" style={{ width, height: 84, padding: 10, gap: 8, flexDirection: "column", alignItems: "center", backgroundColor: "#fff4e6" }}>
        <Tile id="layout-column-a" text="上" style={{ width: 70, height: 28 }} /><Tile id="layout-column-b" text="下" style={{ width: 100, height: 28 }} />
      </View>
    </Card>
    <Card title="02 · 伸展 / 收缩 / 尺寸约束" note="第一排 flexBasis=0、grow=1:2；第二排 basis=160、shrink=1:1；第三排第一个块 maxWidth=80。">
      <View testID="layout-grow" style={{ width, height: 56, padding: 10, gap: 8, flexDirection: "row", backgroundColor: "#e9efff" }}>
        <Tile id="layout-grow-a" text="grow 1" style={{ flexBasis: 0, flexGrow: 1 }} />
        <Tile id="layout-grow-b" text="grow 2" color="#17926b" style={{ flexBasis: 0, flexGrow: 2 }} />
      </View>
      <View testID="layout-shrink" style={{ width, height: 56, padding: 10, gap: 8, flexDirection: "row", backgroundColor: "#edf8f3" }}>
        <Tile id="layout-shrink-a" text="shrink 1" style={{ flexBasis: 160, flexShrink: 1 }} />
        <Tile id="layout-shrink-b" text="shrink 1" color="#17926b" style={{ flexBasis: 160, flexShrink: 1 }} />
      </View>
      <View testID="layout-limits" style={{ width, height: 56, padding: 10, gap: 8, flexDirection: "row", backgroundColor: "#fff4e6" }}>
        <Tile id="layout-limits-a" text="max 80" style={{ flexBasis: 0, flexGrow: 1, maxWidth: 80 }} />
        <Tile id="layout-limits-b" text="min 60 / grow" color="#d77926" style={{ flexBasis: 0, flexGrow: 1, minWidth: 60 }} />
      </View>
    </Card>
    <Card title="03 · 换行与独立行列间距" note="每块 70×28；columnGap=8、rowGap=12、padding=10。280 宽时 3 列，220 宽时 2 列，高度随行数变化。">
      <View testID="layout-wrap" style={{ width, padding: 10, flexDirection: "row", flexWrap: "wrap", columnGap: 8, rowGap: 12, backgroundColor: "#e9efff" }}>
        {[1, 2, 3, 4, 5, 6].map(index => <Tile key={index} id={"layout-wrap-" + index} text={String(index)} color={index % 2 ? "#275de5" : "#17926b"} style={{ width: 70, height: 28, flexShrink: 0 }} />)}
      </View>
    </Card>
    <Card title="04 · 交叉轴对齐" note="四块依次 start / center / end / stretch；前三块高 24，最后一块拉满内高。">
      <View testID="layout-align" style={{ width, height: 96, padding: 10, gap: 10, flexDirection: "row", alignItems: "start", backgroundColor: "#e9efff" }}>
        <Tile id="layout-align-start" text="start" style={{ width: 40, height: 24 }} />
        <Tile id="layout-align-center" text="中" color="#17926b" style={{ width: 40, height: 24, alignSelf: "center" }} />
        <Tile id="layout-align-end" text="end" color="#d77926" style={{ width: 40, height: 24, alignSelf: "end" }} />
        <Tile id="layout-align-stretch" text="拉伸" color="#8b50c7" style={{ width: 40, alignSelf: "stretch" }} />
      </View>
    </Card>
    <Card title="05 · 内外边距" note="父 paddingLeft=12、paddingTop=10；子 marginLeft=8、marginTop=6。蓝块应位于父节点 (20,16)，大小 80×28。">
      <View testID="layout-spacing" style={{ width, height: 76, paddingLeft: 12, paddingRight: 20, paddingTop: 10, paddingBottom: 14, backgroundColor: "#fff4e6" }}>
        <Tile id="layout-spacing-child" text="80 × 28" style={{ width: 80, height: 28, marginLeft: 8, marginTop: 6, marginRight: 4, marginBottom: 2 }} />
      </View>
    </Card>
    <Card title="06 · 绝对定位与叠放" note="橙块固定在右上 (right=8, top=8)，不挤占蓝块位置；底部绿条由 left/right 同时约束宽度。">
      <View testID="layout-absolute" style={{ width, height: 100, padding: 10, backgroundColor: "#e9efff" }}>
        <Tile id="layout-flow" text="正常流" style={{ width: 84, height: 32 }} />
        <Tile id="layout-pin" text="右上" color="#d77926" style={{ position: "absolute", right: 8, top: 8, width: 56, height: 28 }} />
        <Tile id="layout-stretch-pin" text="left 10 / right 10 / bottom 10" color="#17926b" style={{ position: "absolute", left: 10, right: 10, bottom: 10, height: 26 }} />
      </View>
    </Card>
    <Card title="07 · 背景 / 边框 / 圆角 / 透明度" note="依次为圆角边框、半透明、圆形；边框是视觉样式，布局尺寸以色块外框为准。">
      <View style={{ width, flexDirection: "row", gap: 12, height: 64, alignItems: "center" }}>
        <Tile text="边框" style={{ width: 64, height: 52, borderWidth: 3, borderColor: "#122966", borderRadius: 12 }} />
        <Tile text="50%" color="#17926b" style={{ width: 64, height: 52, opacity: 0.5, borderRadius: 12 }} />
        <Tile text="圆形" color="#d77926" style={{ width: 52, height: 52, borderRadius: 26 }} />
      </View>
    </Card>
    <Card title="08 · 溢出裁剪与隐藏占位" note="橙块超出父框右侧，应被裁掉；第二排隐藏的中间块仍占 48 宽，前后两个块不靠拢。">
      <View testID="layout-clip" style={{ width: 160, height: 52, backgroundColor: "#e9efff", overflow: "hidden", borderRadius: 8 }}>
        <Tile id="layout-clipped-child" text="部分可见" color="#d77926" style={{ position: "absolute", left: 120, top: 8, width: 80, height: 36 }} />
      </View>
      <View testID="layout-hidden-row" style={{ width, height: 36, flexDirection: "row", gap: 10 }}>
        <Tile text="A" style={{ width: 48, height: 36 }} />
        <Tile id="layout-hidden" text="隐藏" style={{ width: 48, height: 36, visibility: "hidden" }} />
        <Tile id="layout-after-hidden" text="C" color="#17926b" style={{ width: 48, height: 36 }} />
      </View>
    </Card>
  </View>;
}
