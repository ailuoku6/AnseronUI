import { Button, Text, View, useEffect, useState, useTextMeasurer } from '@anseronui/ui';
import type { LayoutEvent, TextMeasureStyle, UIElement } from '@anseronui/ui';

export const measurementSample = 'AnseronUI 使用各平台的文本排版引擎测量文字。中文、English 和 emoji 🪿 都使用实际字体计算宽高。测量完整内容与两行内容的高度后，可以判断是否需要显示展开按钮。';
export const measurementStyle: TextMeasureStyle = { fontSize: 16, lineHeight: 24 };

export function TextMeasurementShowcase(): UIElement {
  const measureText = useTextMeasurer();
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [needExpand, setNeedExpand] = useState(false);
  const [result, setResult] = useState('等待测量');
  useEffect(() => {
    if (width <= 0) return;
    let active = true;
    async function measure(): Promise<void> {
      try {
        const full = await measureText({ text: measurementSample, style: measurementStyle, maxWidth: width });
        const collapsed = await measureText({ text: measurementSample, style: measurementStyle, maxWidth: width, numberOfLines: 2 });
        if (active) {
          setNeedExpand(full.height > collapsed.height);
          setResult('完整: ' + full.width + ' × ' + full.height + ' / 两行: ' + collapsed.height);
        }
      } catch {
        if (active) setResult('测量失败');
      }
    }
    void measure();
    return () => { active = false; };
  }, [width, measureText]);
  return <View style={{ flexDirection: 'column', padding: 14, gap: 10, borderRadius: 12, backgroundColor: '#ffffff', flexShrink: 0 }}>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>文本尺寸测量</Text>
    <View testID="text-measure-content" onLayout={(frame: LayoutEvent) => setWidth(frame.width)} style={{ flexDirection: 'column', flexShrink: 0 }}>
      <Text testID="text-measure-preview" style={measurementStyle} numberOfLines={expanded ? 0 : 2}>{measurementSample}</Text>
    </View>
    <Text testID="text-measure-result" style={{ fontSize: 12, color: '#5c667a' }}>{result}</Text>
    {needExpand ? <Button testID="text-measure-toggle" title={expanded ? '收起文本' : '展开文本'} onClick={() => setExpanded(value => !value)} /> : null}
  </View>;
}
