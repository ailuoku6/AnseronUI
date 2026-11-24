# 文本尺寸测量

通过 `useTextMeasurer()` 获取测量函数。在 effect 或事件回调中调用，返回 `Promise<TextSize>`。也可以使用 `useServices().measureText(options)`。

```tsx
import { Button, Text, View, useState, useTextMeasurer } from 'anseronui/ui';

export function TextSizeDemo() {
  const measureText = useTextMeasurer();
  const [result, setResult] = useState('等待测量');
  const text = 'Hello AnseronUI 你好 🪿';
  const style = { fontSize: 16, lineHeight: 24 };

  async function measure() {
    const size = await measureText({ text, style, maxWidth: 240 });
    setResult(size.width + ' × ' + size.height);
  }

  return <View style={{ flexDirection: 'column', gap: 8 }}>
    <Text style={{ ...style, maxWidth: 240 }}>{text}</Text>
    <Button title="测量文本" onClick={measure} />
    <Text>{result}</Text>
  </View>;
}
```

## 参数与结果

`MeasureTextOptions` 支持：

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `text` | 纯文本，保留显式换行；最多 65536 个 UTF-16 代码单元 | 必填 |
| `style.fontSize` | 正数字号 | `16` |
| `style.fontWeight` | `normal` 或 `bold` | `normal` |
| `style.fontStyle` | `normal` 或 `italic` | `normal` |
| `style.lineHeight` | 正数行高，单位与布局相同 | 平台字体度量 |
| `maxWidth` | 非负最大内容宽度，决定换行 | `100000` |
| `maxHeight` | 非负高度上限，仅裁剪返回高度 | 不限制 |
| `numberOfLines` | 非负整数；`0` 表示不限制行数 | `0` |
| `ellipsizeMode` | `tail` 或 `clip`，与 Text 相同 | `tail` |

返回 `{ width, height }`，单位与布局相同。宽高不超过传入的上限。空字符串、零宽度或零高度约束返回 `{ width: 0, height: 0 }`。

只计算文本内容，不包含 padding、border、margin 或 transform。尺寸遵循平台 Text 的测量和取整规则，部分宿主会保留少量宽度余量。系统字体、字体缩放和排版规则可能导致不同平台的结果不同。

当前支持 Text 的纯文本与上述字体属性。RichText spans、字体族、字间距和行间距不在此 API 中。

## 展开与收起

使用相同的内容宽度和字体样式，分别测量完整文本与限制行数的文本：

```ts
const full = await measureText({ text, style, maxWidth: contentWidth });
const collapsed = await measureText({ text, style, maxWidth: contentWidth, numberOfLines: 2 });
const needExpand = full.height > collapsed.height;
```

`contentWidth` 应扣除容器左右 padding 和 border。可以通过 [onLayout](../../reference/components.md) 获取内容容器的实际宽度。完整示例见 [`TextMeasurementShowcase`](../../../examples/components/text-measurement-showcase.tsx)，入口为仓库示例的「组件」页。

## 调用与生命周期

- 在组件 render 中取得函数，在 effect 或事件中发起测量。render 中调用会拒绝并返回 `SERVICE_DURING_RENDER`。
- 函数保留所属页面与组件的绑定，支持 `await` 后调用。组件卸载或页面销毁后，请求会以 `SURFACE_DISPOSED` 拒绝。处理 Promise 的失败分支；effect 清理后不要继续写入状态。
- 测量使用现有的原生或浏览器排版通道，无需创建 Text、传入 ref 或手动释放资源。
- 参数无效时以 `INVALID_TEXT_MEASUREMENT` 拒绝。数值必须有限，字号和行高必须大于零。
- 复用同一内容、样式、宽度的结果。内容、宽度或系统字体环境变化后重新测量。避免在滚动回调中逐帧测量。

对齐、自适应背景和普通换行使用[布局样式](styles.md)。已挂载节点的最终布局尺寸使用 `onLayout` 或 `ref.measure()`，见[组件与界面 API](../../reference/components.md)。
