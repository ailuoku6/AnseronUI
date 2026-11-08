import { View, Text, Button, useState, useRef } from '@anseronui/ui';
import type { NodeHandle, UIElement } from '@anseronui/ui';

export function AnimationShowcase(props: { viewportWidth: number }): UIElement {
  const canvasWidth = Math.max(180, props.viewportWidth - 60);
  const [expanded, setExpanded] = useState(false);
  const [loop, setLoop] = useState(false);
  const [status, setStatus] = useState('等待操作');
  const box = useRef<NodeHandle | null>(null);
  const run = useRef(0);
  const sequence = async (): Promise<void> => {
    const node = box.current;
    if (!node) return;
    const id = ++run.current;
    setStatus('第一段：移动与旋转');
    try {
      const first = await node.animate({ translateX: 150, rotate: 180, backgroundColor: '#e77736' }, { duration: 800, easing: 'easeInOut' });
      if (id !== run.current) return;
      if (!first.finished) { setStatus('已取消'); return; }
      setStatus('第二段：弹性返回');
      const second = await node.animate({ translateX: 0, rotate: 360, backgroundColor: '#275de5' }, { duration: 900, easing: 'spring' });
      if (id !== run.current) return;
      setStatus(second.finished ? '串行动画完成' : '已取消');
    } catch { /* Leaving the page retires the ref and its pending requests. */ }
  };
  return <View style={{ flexDirection: 'column', gap: 16, flexShrink: 0 }}>
    <View style={{ flexDirection: 'column', padding: 14, gap: 10, backgroundColor: '#ffffff', borderRadius: 12, flexShrink: 0 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>01 · 声明式状态动画</Text>
      <Text style={{ fontSize: 13, color: '#5c667a' }}>宽高、位置、圆角、颜色和透明度一起过渡，连续点击可打断。</Text>
      <View style={{ width: canvasWidth, height: 160, backgroundColor: '#e9efff', overflow: 'hidden', borderRadius: 8 }}>
        <View testID="animation-layout-box" animation={{ duration: 900, easing: 'easeInOut' }}
          style={{ position: 'absolute', left: expanded ? 115 : 10, top: expanded ? 35 : 10,
            width: expanded ? 140 : 70, height: expanded ? 105 : 70, borderRadius: expanded ? 28 : 6,
            opacity: expanded ? 0.65 : 1, backgroundColor: expanded ? '#e77736' : '#275de5' }} />
      </View>
      <Button testID="animation-layout-toggle" title={expanded ? '收起' : '展开'} style={{ width: 96, height: 42 }} onClick={() => setExpanded(previous => !previous)} />
    </View>
    <View style={{ flexDirection: 'column', padding: 14, gap: 10, backgroundColor: '#ffffff', borderRadius: 12, flexShrink: 0 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>02 · ref 串行动画与取消</Text>
      <View style={{ width: canvasWidth, height: 112, backgroundColor: '#e9efff', overflow: 'hidden', borderRadius: 8 }}>
        <View ref={box} testID="animation-ref-box" style={{ position: 'absolute', left: 25, top: 28, width: 56, height: 56, borderRadius: 12, backgroundColor: '#275de5' }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, height: 42 }}>
        <Button testID="animation-sequence" title="播放 / 重播" style={{ width: 112 }} onClick={() => { void sequence(); }} />
        <Button testID="animation-cancel" title="取消" style={{ width: 72 }} onClick={() => { void box.current?.cancelAnimation(); }} />
      </View>
      <Text testID="animation-status" style={{ width: canvasWidth, fontSize: 13, color: '#275de5' }}>{status}</Text>
    </View>
    <View style={{ flexDirection: 'column', padding: 14, gap: 10, backgroundColor: '#ffffff', borderRadius: 12, flexShrink: 0 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold' }}>03 · 延迟、重复与往返</Text>
      <View style={{ width: canvasWidth, height: 112, backgroundColor: '#e9efff', overflow: 'hidden', borderRadius: 8 }}>
        <View testID="animation-repeat-box" animation={loop ? { duration: 700, delay: 200, easing: 'easeInOut', iterations: -1, autoreverse: true } : { duration: 250 }}
          style={{ position: 'absolute', left: 25, top: 28, width: 56, height: 56, borderRadius: 28,
            translateX: loop ? 150 : 0, scaleX: loop ? 1.3 : 1, scaleY: loop ? 1.3 : 1, backgroundColor: '#17926b' }} />
      </View>
      <Button testID="animation-repeat-toggle" title={loop ? '停止并复位' : '开始往返'} style={{ width: 112, height: 42 }} onClick={() => setLoop(previous => !previous)} />
      <Text style={{ fontSize: 13, color: '#5c667a' }}>动画在平台帧时钟运行，期间无逐帧 Core 通信。</Text>
    </View>
  </View>;
}
