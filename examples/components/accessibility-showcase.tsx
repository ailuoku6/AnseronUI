import { Button, Text, TextInput, View, useRef, useState } from '@anseronui/ui';
import type { NodeHandle, UIElement } from '@anseronui/ui';

export function AccessibilityShowcase(): UIElement {
  const result = useRef<NodeHandle | null>(null);
  const [checked, setChecked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [name, setName] = useState('');
  const [feedback, setFeedback] = useState('等待操作');
  return <View testID="accessibility-showcase" style={{ padding: 14, gap: 10, borderRadius: 12, backgroundColor: '#ffffff', flexShrink: 0 }}>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>无障碍 · 读屏与操作</Text>
    <Text style={{ fontSize: 14 }}>开启系统读屏，检查名称、角色、勾选状态、长按动作和焦点。</Text>
    <View testID="accessibility-checkbox" accessible={true} accessibilityRole="checkbox"
      accessibilityLabel="接收通知" accessibilityChecked={checked} accessibilityHint="切换通知设置"
      accessibilityInfo={{ clickable: true, longClickable: true }}
      onClick={() => { setChecked(previous => !previous); setFeedback('已切换通知'); }}
      onLongPress={() => setFeedback('已触发长按')}
      style={{ padding: 12, backgroundColor: '#e9efff', borderRadius: 8 }}>
      <Text>{checked ? '☑ 接收通知' : '☐ 接收通知'}</Text>
    </View>
    <TextInput testID="accessibility-input" accessibilityLabel="姓名" accessibilityHint="填写接收通知的姓名"
      value={name} onChangeText={setName} placeholder="姓名" style={{ height: 44, borderWidth: 1, borderColor: '#b7c9ff', paddingHorizontal: 8 }} />
    <Button title={hidden ? '显示读屏内容' : '隐藏读屏内容'} onClick={() => setHidden(previous => !previous)} />
    <View testID="accessibility-hidden" accessibilityHidden={hidden} style={{ gap: 4 }}>
      <Text>这段内容可从读屏树隐藏。</Text>
      <Text accessibilityRole="none">这段装饰文字不参与读屏。</Text>
    </View>
    <Text ref={result} testID="accessibility-result" accessible={true} accessibilityRole="text" accessibilityLabel={feedback}>{feedback}</Text>
    <Button title="播报当前结果" onClick={async () => {
      try { await result.current?.accessibilityAnnounce(feedback); }
      catch { setFeedback('播报请求失败'); }
    }} />
    <Button title="读屏聚焦到结果" onClick={async () => {
      try { await result.current?.accessibilityFocus(); }
      catch { setFeedback('聚焦请求失败'); }
    }} />
    <Button title="禁用操作" disabled={true} />
  </View>;
}
