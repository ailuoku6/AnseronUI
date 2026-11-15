import { View, Text, Button, TextInput, ScrollView, definePage, useState, useServices, useEffect, useRouter, usePageEffect, useRef } from '@anseronui/ui';
import type { UIElement, NodeHandle } from '@anseronui/ui';

export function HarmonyParity(): UIElement {
  const services = useServices(), router = useRouter();
  const [status, setStatus] = useState('ready');
  const [notification, setNotification] = useState('ready');
  const [links, setLinks] = useState(0);
  const [lastURL, setLastURL] = useState('none');
  const [visibleCount, setVisibleCount] = useState(0);
  const [allowScroll, setAllowScroll] = useState(false);
  const [downs, setDowns] = useState(0), [moves, setMoves] = useState(0), [ups, setUps] = useState(0), [cancels, setCancels] = useState(0);
  const [offset, setOffset] = useState(0);
  const [input, setInput] = useState(''), [focused, setFocused] = useState(false);
  const field = useRef<NodeHandle | null>(null), scroller = useRef<NodeHandle | null>(null);
  usePageEffect(() => { setVisibleCount(value => value + 1); }, []);
  useEffect(() => {
    const failure = (error: Error): void => setStatus('subscription-fail: ' + String(error));
    const linking = services.linking.subscribe(url => { setLinks(value => value + 1); setLastURL(url); }, failure);
    const network = services.network.subscribe(() => {}, failure);
    const appearance = services.appearance.subscribe(() => {}, failure);
    const window = services.window.subscribe(() => {}, failure);
    const keyboard = services.keyboard.subscribe(() => {}, failure);
    const transfers = services.transfers.subscribe(() => {}, failure);
    return () => { linking(); network(); appearance(); window(); keyboard(); transfers(); };
  }, []);
  const run = async (): Promise<void> => {
    try {
      setStatus('running');
      for (const name of ['appState', 'appearance', 'window', 'keyboard', 'network', 'linking', 'location', 'transfers']) {
        if (!await services.capabilities.has(name, 'subscribe')) throw new Error(name + '.subscribe missing');
      }
      if (await services.capabilities.has('notifications', 'register')) throw new Error('unexpected push provider');
      const app = await services.app.getInfo();
      const identifier = app.applicationId + '.refresh';
      await services.background.schedule({ identifier, delaySeconds: 0 });
      const pending = await services.background.pending();
      if (!pending.includes(identifier)) throw new Error('background pending missing');
      await services.background.cancel(identifier);
      if ((await services.background.pending()).includes(identifier)) throw new Error('background cancellation failed');
      await services.background.getEvents();
      await services.background.acknowledge([]);
      await services.notifications.getEvents();
      await services.notifications.acknowledge([]);
      await services.notifications.cancel('parity-unused');
      const metrics = await services.window.getMetrics();
      if (!(metrics.width > 0 && metrics.height > 0 && metrics.scale > 0)) throw new Error('invalid window metrics');
      await services.sleep(150);
      setStatus('parity-pass');
    } catch (error) { setStatus('parity-fail: ' + String(error)); }
  };
  const notifications = async (): Promise<void> => {
    try {
      setNotification('requesting');
      const permission = await services.permissions.request('notifications');
      if (permission !== 'granted') throw new Error('notification permission ' + permission);
      await services.notifications.schedule({ id: 'parity-reminder', title: 'AnseronUI parity', body: 'API 21 reminder', delaySeconds: 120 });
      await services.notifications.cancel('parity-reminder');
      setNotification('notification-pass');
    } catch (error) { setNotification(String(error)); }
  };
  return <View style={{ flexDirection: 'column', padding: 12, gap: 8, flexGrow: 1, backgroundColor: '#ffffff' }}>
    <Text testID="parity-title" style={{ fontSize: 22 }}>Harmony parity</Text>
    <Text testID="parity-status">{status}</Text>
    <Text testID="parity-link">Links: {links} {lastURL}</Text>
    <Text testID="parity-lifecycle">Visible: {visibleCount}</Text>
    <Button testID="parity-services" title="Test parity services" onClick={() => { void run(); }} style={{ height: 38 }} />
    <Button testID="parity-notifications" title="Test notifications" onClick={() => { void notifications(); }} style={{ height: 38 }} />
    <Text testID="parity-notification-status">{notification}</Text>
    <Button testID="parity-toggle-scroll" title={allowScroll ? 'Scroll allowed' : 'Touch owns gesture'} onClick={() => {
      setAllowScroll(value => !value); setDowns(0); setMoves(0); setUps(0); setCancels(0); void scroller.current?.scrollTo(0, 0);
    }} style={{ height: 38 }} />
    <Text testID="parity-touch-status">D:{downs} M:{moves} U:{ups} C:{cancels} S:{Math.round(offset)}</Text>
    <ScrollView ref={scroller} testID="parity-scroll" style={{ height: 150, borderWidth: 1, borderColor: '#3559dc' }} onScroll={setOffset}>
      <View testID="parity-touch" touchAction={allowScroll ? 'auto' : 'none'} style={{ height: 800, backgroundColor: '#dfe8ff' }}
        onTouchDown={() => setDowns(value => value + 1)} onTouchMove={() => setMoves(value => value + 1)}
        onTouchUp={() => setUps(value => value + 1)} onTouchCancel={() => setCancels(value => value + 1)}>
        <Text>Swipe here to verify scroll ownership</Text>
      </View>
    </ScrollView>
    <Button testID="parity-focus" title="Focus input" onClick={() => { void field.current?.focus(); }} style={{ height: 36 }} />
    <TextInput ref={field} testID="parity-input" value={input} onChangeText={setInput} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ height: 38, borderWidth: 1, borderColor: '#3559dc' }} />
    <Text testID="parity-focus-status">Focused: {focused ? 'yes' : 'no'}</Text>
    <Button testID="parity-details" title="Cover page" onClick={() => { void router.push('harmony-details', { message: 'parity' }); }} style={{ height: 38 }} />
  </View>;
}
export const harmonyParityPage = definePage('harmony-parity', HarmonyParity);
