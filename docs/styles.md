# 颜色、夜间模式与阴影

`Style` 在 iOS、Android、macOS 和 Web 上支持背景、文字、边框及外阴影。所有颜色属性都有以 `dm` 为前缀的夜间版本，跟随宿主当前的深色外观自动选择，无需在业务代码中监听主题并重新渲染。

## 夜间颜色

| 普通颜色 | 夜间覆盖 | 用途 |
| --- | --- | --- |
| `backgroundColor` | `dmBackgroundColor` | 组件背景 |
| `color` | `dmColor` | 文本、按钮标题、输入内容 |
| `borderColor` | `dmBorderColor` | 边框；同时设置 `borderWidth` |
| `shadowColor` | `dmShadowColor` | 外阴影；同时设置大于 0 的 `shadowOpacity` |
| `placeholderTextColor` | `dmPlaceholderTextColor` | TextInput 占位文字 |

命名规则为 `dm` 加上普通属性名的首字母大写形式。深色外观下，已提供的 `dm` 值覆盖对应普通颜色；缺少 `dm` 值时继续使用普通颜色。浅色外观始终使用普通颜色。只有 `dm` 值时，浅色使用该组件原有的默认值。框架不会自动把普通颜色反转或变暗。

跨平台颜色建议统一使用 `#RRGGBB`，例如 `#ffffff`。各宿主的额外颜色语法并不完全一致。设置 `"transparent"` 可以清除背景；阴影透明度使用 `shadowOpacity`。

```tsx
import { View, Text, TextInput, useState } from "anseronui";

export default function Page() {
  const [value, setValue] = useState("");
  return (
    <View style={{
      flexDirection: "column", padding: 24, gap: 16,
      backgroundColor: "#f5f5f5", dmBackgroundColor: "#101114",
    }}>
      <View style={{
        flexDirection: "column", padding: 20, borderRadius: 16,
        backgroundColor: "#ffffff", dmBackgroundColor: "#202228",
        borderWidth: 1, borderColor: "#e3e5e8", dmBorderColor: "#393d46",
        shadowColor: "#000000", dmShadowColor: "#000000",
        shadowOpacity: 0.2, shadowRadius: 8, shadowOffsetY: 4,
      }}>
        <Text style={{ color: "#202124", dmColor: "#f0f1f4" }}>账户设置</Text>
        <TextInput
          value={value} onChangeText={setValue} placeholder="输入昵称"
          style={{
            height: 44, color: "#202124", dmColor: "#f0f1f4",
            placeholderTextColor: "#777777", dmPlaceholderTextColor: "#aaaaaa",
          }}
        />
      </View>
    </View>
  );
}
```

`placeholderTextColor` / `dmPlaceholderTextColor` 也可直接写在 `TextInput` 的 props 中，与已有占位文字配置方式一致。同一个属性同时写在 props 和 `style` 中时，props 优先；两个属性分别处理覆盖和回退。

`RichText` 的各个 span 同样支持 `dmColor`。span 未设置当前外观的颜色时，继承 `RichText` 的文字颜色：

```tsx
<RichText
  style={{ color: "#333333", dmColor: "#eeeeee" }}
  spans={[
    { text: "普通文本 " },
    { text: "重点", color: "#205bd8", dmColor: "#8ab4ff", fontWeight: "bold" },
  ]}
/>
```

## 阴影

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `shadowColor` | `#000000` | 阴影颜色 |
| `dmShadowColor` | 回退到 `shadowColor` | 深色外观下的阴影颜色 |
| `shadowOpacity` | `0` | 透明度，范围 `0`–`1`；设为 `0` 关闭阴影 |
| `shadowRadius` | `0` | 模糊半径，非负数 |
| `shadowOffsetX` | `0` | 水平偏移，负数向左 |
| `shadowOffsetY` | `0` | 垂直偏移，负数向上 |

半径和偏移使用与布局相同的逻辑单位（iOS/macOS 为 point，Android 为 dp，Web 为 CSS px）。只设置阴影颜色不会产生可见阴影，必须设置 `shadowOpacity > 0`。阴影跟随组件的尺寸和圆角，不增加布局尺寸，也不会扩大点击区域。

当前支持一层外阴影。没有 inset、多重阴影、spread、独立文字阴影或 Android `elevation` 属性。夜间版本只用于颜色；不提供 `dmShadowRadius`、`dmShadowOpacity` 等几何或透明度属性。

### 圆角和裁剪

单独设置 `borderRadius` 不再隐式裁剪普通容器的子内容。需要将内容裁剪到圆角时，请显式使用 `overflow: "hidden"`。iOS/macOS 在同一层上裁剪时也会裁掉外阴影；跨平台推荐把阴影和内容裁剪分成两层：

```tsx
<View style={{
  borderRadius: 16,
  backgroundColor: "#ffffff", dmBackgroundColor: "#202228",
  shadowColor: "#000000", dmShadowColor: "#000000",
  shadowOpacity: 0.25, shadowRadius: 10, shadowOffsetY: 5,
}}>
  <View style={{ borderRadius: 16, overflow: "hidden" }}>
    {/* 图片、背景和需要裁剪的内容 */}
  </View>
</View>
```

祖先容器的 `overflow: "hidden"`、滚动视口和页面边界都可能裁剪阴影，请为阴影预留间距。原生图片、视频等控件也可能有自己的内容裁剪行为。

### 平台差异

- iOS/macOS 使用 CALayer 的圆角矩形阴影路径，尺寸和圆角动画时更新路径。
- Android 在框架容器中绘制并缓存外阴影位图，支持颜色、模糊和任意方向偏移。单个缓存超过 8192 像素宽/高或 16,777,216 像素面积时跳过阴影；应避免给巨大的整页或滚动内容配置阴影。自定义原生容器内部的子节点阴影绘制需要扩展自行接入，通常应在其外层使用框架 `View`。
- Web 使用 CSS `box-shadow`，CSS blur 约取 `shadowRadius` 的两倍来接近原生模糊。各平台栅格化算法不同，边缘像素不保证完全一致。

## 主题变化与宿主接入

主题来源分别为 iOS 的 trait、Android 的 `uiMode`、macOS 的 effective appearance 和 Web 的 `prefers-color-scheme`。原生宿主强制浅色/深色时，样式跟随该宿主实际外观。

内置 `AnseronUIRenderView` 和 Web renderer 自动刷新已挂载的颜色，保留页面状态和输入内容。刷新不触发 Core 布局，不重放媒体控制指令或自定义原生组件的 `nativeProps`。系统默认输入颜色也会随原生主题变化。Android 默认 Activity 可能因系统配置变化重建，页面是否保留仍遵循 Activity 生命周期；宿主自行处理 `uiMode` 时，容器会在配置回调中刷新颜色。

直接使用底层 `IOSRenderer`、`MacOSRenderer` 或 `AndroidRenderer` 的集成方，需要在宿主外观改变后调用 `appearanceChanged()`。涉及主题相关业务状态时，仍可使用[标准系统能力](native-services.md)中的 appearance 订阅。

`dm` 字段是声明式颜色配置，不能传给 `ref.animate()`；动画支持范围见[动画文档](animations.md)。配置了声明式背景动画时，主题背景变化沿用该动画配置，边框、文字和阴影颜色直接更新。

更新 SDK 后请重新执行应用的 `npm run setup` 并重建宿主和 Core，使类型、协议与各端 renderer 保持一致。

## 示例页面

仓库示例包含 `appearance`（外观）页，展示浅色/深色背景、文字、边框、蓝色与紫色外阴影、富文本和占位文字。iOS 示例运行后选择顶部“外观”，或启动时传入 `--page appearance`。在 iOS 模拟器的 Appearance 面板切换 Light / Dark 可直接比较，无需重启应用。Android 示例默认打开“外观”页，也可通过 `adb shell am start -n org.anseronui.demo/.MainActivity --es page appearance` 指定；使用 `adb shell cmd uimode night yes` / `no` 切换深色/浅色。Android 默认 Activity 会按系统配置变化重建。

## 开发验证

仓库提供 `npm run test:framework`、`npm run typecheck:framework` 和 `npm run test:browser:styles`。浏览器套件检查浅色→深色→浅色、颜色回退和移除、阴影、富文本、占位文字、输入法编辑状态以及主题监听释放。iOS `RenderViewTests`、Android `RenderViewTest` 和 macOS `RendererRegression` 中也包含对应的原生回归测试。
