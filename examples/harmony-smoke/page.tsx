import { View, Text, Button, TextInput, ScrollView, definePage, useState, useServices, useEffect, useRouter } from '@anseronui/ui';
import type { UIElement } from '@anseronui/ui';
export function HarmonySmoke(): UIElement {
  const services = useServices();
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('ready');
  const runServices = async (): Promise<void> => {
    try {
      setStatus('waiting');
      await services.sleep(50);
      await services.storage.set('api21-smoke', '鸿蒙持久化');
      const stored = await services.storage.get('api21-smoke');
      await services.secureStorage.set('api21-secret', '安全存储验证');
      const secret = await services.secureStorage.get('api21-secret');
      await services.secureStorage.remove('api21-secret');
      const device = await services.device.getInfo();
      setStatus(stored === '鸿蒙持久化' && secret === '安全存储验证' && device.platform === 'harmony' ? 'services-pass' : 'services-fail');
    } catch (error) { setStatus(String(error)); }
  };
  return <View style={{ flexDirection: 'column', padding: 20, gap: 12, flexGrow: 1, backgroundColor: '#ffffff' }}>
    <Text testID="smoke-title" style={{ fontSize: 24, fontWeight: 'bold' }}>HarmonyOS API 21</Text>
    <Text testID="smoke-count">Count: {count}</Text>
    <Button testID="smoke-increment" title="Increment" onClick={() => setCount(n => n + 1)} style={{height: 44}} />
    <TextInput testID="smoke-input" value={value} onChangeText={setValue} placeholder="Type text" style={{height: 44, borderWidth: 1, borderColor:'#3559dc'}} />
    <Text testID="smoke-echo">Input: {value}</Text>
    <Button testID="smoke-services" title="Test services" onClick={() => { void runServices(); }} style={{height: 44}} />
    <Text testID="smoke-status">Status: {status}</Text>
    <Button testID="smoke-push" title="Open details" onClick={() => { void router.push('harmony-details', { count, message: '路由参数' }); }} style={{height: 44}} />
    <Button testID="smoke-parity" title="Parity checks" onClick={() => { void router.push('harmony-parity'); }} style={{height: 40}} />
    <Button testID="smoke-media" title="Media and extensions" onClick={() => { void router.push('harmony-media'); }} style={{height: 40}} />
  </View>;
}
export const harmonySmokePage = definePage('harmony-smoke', HarmonySmoke);
export function HarmonyDetails(): UIElement {
  const router = useRouter();
  const [params, setParams] = useState('{}');
  useEffect(() => { void router.getParams().then(p => setParams(JSON.stringify(p))); }, []);
  return <View style={{ flexDirection: 'column', padding: 20, gap: 16 }}>
    <Text testID="smoke-detail">Details: {params}</Text>
    <Button testID="smoke-back" title="Go back" onClick={() => { void router.back(); }} style={{height: 44}} />
  </View>;
}
export const harmonyDetailsPage = definePage('harmony-details', HarmonyDetails);
