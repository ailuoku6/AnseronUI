import { Button, Text, View, useCallback, useEffect, useMemo, useState } from '@anseronui/ui';
import type { Component, UIElement } from '@anseronui/ui';

export function useCounter(initial: number) {
  const [count, setCount] = useState(initial);
  const increment = useCallback(() => setCount(value => value + 1), []);
  const doubled = useMemo(() => count * 2, [count]);
  return { count, doubled, increment };
}

interface CounterProps { initial: number; }
function CounterBody(props: CounterProps): UIElement {
  const counter = useCounter(props.initial);
  return <View style={{ flexDirection: 'column', gap: 8 }}>
    <Text testID="composition-counter">{'Hook: ' + counter.count + ' / double: ' + counter.doubled}</Text>
    <Button testID="composition-increment" title="自定义 Hook +1" onClick={counter.increment} />
  </View>;
}

export function withCard(Body: Component<CounterProps>): Component<CounterProps> {
  return function Card(props: CounterProps): UIElement {
    const [taps, setTaps] = useState(0);
    return <View style={{ flexDirection: 'column', gap: 8 }}>
      <Body initial={props.initial} />
      <Button testID="composition-hoc" title={'HOC: ' + taps} onClick={() => setTaps(value => value + 1)} />
    </View>;
  };
}
// Keep factory-created component identity stable across page renders.
const CardCounter = withCard(CounterBody);

interface SlotProps {
  Content: Component<CounterProps>;
  initial: number;
  header: UIElement;
  renderFooter: (ready: boolean) => UIElement;
  children?: UIElement;
}
function Slots(props: SlotProps): UIElement {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <View style={{ flexDirection: 'column', gap: 10 }}>
    {props.header}
    <props.Content initial={props.initial} />
    {props.renderFooter(ready)}
    {props.children}
  </View>;
}

export function CompositionShowcase(): UIElement {
  const [renders, setRenders] = useState(0);
  return <View style={{ flexDirection: 'column', padding: 14, gap: 10, borderRadius: 12, backgroundColor: '#ffffff', flexShrink: 0 }}>
    <Slots Content={CardCounter} initial={2}
      header={<Text style={{ fontSize: 18, fontWeight: 'bold' }}>07 · Hooks / HOC / Slots</Text>}
      renderFooter={(ready: boolean) => <Text testID="composition-ready">{ready ? 'render prop: ready' : 'render prop: loading'}</Text>}>
      <Text testID="composition-child">children slot</Text>
    </Slots>
    <Button testID="composition-rerender" title={'父组件更新: ' + renders} onClick={() => setRenders(value => value + 1)} />
  </View>;
}
