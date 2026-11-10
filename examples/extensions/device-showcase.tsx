import { Button, Text, TextInput, View, useEffect, useRef, useServices, useState } from '@anseronui/ui';
import type { UIElement, Unsubscribe } from '@anseronui/ui';

export function DeviceShowcase(): UIElement {
  const services = useServices();
  const [result, setResult] = useState('点击操作查看结果');
  const [device, setDevice] = useState('');
  const [service, setService] = useState('180f');
  const [characteristic, setCharacteristic] = useState('2a19');
  const [text, setText] = useState('AnseronUI NFC 示例');
  const [bytes, setBytes] = useState('1');
  const [task, setTask] = useState('org.anseronui.demo.refresh');
  const stop = useRef<Unsubscribe | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current?.(); }; }, []);
  const run = async (module: string, method: string, action: () => Promise<unknown>) => {
    try { const value = await services.capabilities.has(module, method) ? await action() : '当前平台或宿主配置不支持'; if (mounted.current) setResult(JSON.stringify(value ?? '完成')); }
    catch (error) { if (mounted.current) setResult(String(error)); }
  };
  return <View style={{ flexDirection: 'column', gap: 12, paddingTop: 24 }}>
    <Text style={{ fontSize: 22, fontWeight: 'bold' }}>通知、后台任务与设备连接</Text>
    <Text testID="device-status" style={{ color: '#275de5' }}>{result}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>推送与本地通知</Text>
    <Text>先申请通知权限。远程推送需要宿主配置 APNs / Android 推送服务 / Web Push。</Text>
    <Button title="申请通知权限" onClick={() => run('permissions', 'request', () => services.permissions.request('notifications'))} />
    <Button title="注册远程推送，读取 token" onClick={() => run('notifications', 'register', () => services.notifications.register())} />
    <Button title="发送本地通知（原生延迟 5 秒 / Web 即时）" onClick={() => run('notifications', 'schedule', async () => { const platform = await services.device.getInfo(); await services.notifications.schedule({ id: 'demo-notification', title: 'AnseronUI 示例', body: '通知用例，可点击回到应用', delaySeconds: platform.platform === 'Web' ? 0 : 5 }); })} />
    <Button title="取消示例通知" onClick={() => run('notifications', 'cancel', () => services.notifications.cancel('demo-notification'))} />
    <Button testID="device-notification-inbox" title="读取通知收件箱" onClick={() => run('notifications', 'getEvents', () => services.notifications.getEvents())} />
    <Button title="确认消费收件箱消息" onClick={() => run('notifications', 'acknowledge', async () => { const events = await services.notifications.getEvents(); await services.notifications.acknowledge(events.map(event => event.id)); return { acknowledged: events.length }; })} />
    <Text style={{ color: '#275de5' }}>{result}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>后台任务</Text>
    <Text>系统决定执行时间。处理器由宿主在应用启动时注册，可在没有页面时执行。</Text>
    <TextInput value={task} onChangeText={setTask} placeholder="已注册的后台任务标识" style={{ height: 44 }} />
    <Button title="提交后台任务（网络可用时执行）" onClick={() => run('background', 'schedule', () => services.background.schedule({ identifier: task, delaySeconds: 0, requiresNetwork: true }))} />
    <Button title="查询待执行任务" onClick={() => run('background', 'pending', () => services.background.pending())} />
    <Button title="取消后台任务" onClick={() => run('background', 'cancel', () => services.background.cancel(task))} />
    <Button title="读取后台执行结果" onClick={() => run('background', 'getEvents', () => services.background.getEvents())} />
    <Button title="确认消费后台执行结果" onClick={() => run('background', 'acknowledge', async () => { const events = await services.background.getEvents(); await services.background.acknowledge(events.map(event => event.id)); return { acknowledged: events.length }; })} />
    <Text style={{ color: '#275de5' }}>{result}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>蓝牙 BLE / GATT</Text>
    <Text>默认示例为电池服务 180f / 电量特征 2a19。扫描自动选择首个结果，也可填写设备标识；Web 使用系统设备选择器。写入前请确认目标特征和数据。</Text>
    <TextInput value={service} onChangeText={setService} placeholder="服务 UUID（扫描过滤条件）" style={{ height: 44 }} />
    <Button title="扫描蓝牙（5 秒）/ Web 选择设备" onClick={() => run('bluetooth', 'scan', async () => { const devices = await services.bluetooth.scan(service ? [service] : [], 5000); if (devices.length && mounted.current) setDevice(devices[0]!.id); return devices; })} />
    <TextInput value={device} onChangeText={setDevice} placeholder="设备标识（先扫描）" style={{ height: 44 }} />
    <Button title="连接设备" onClick={() => run('bluetooth', 'connect', () => services.bluetooth.connect(device))} />
    <Button title="发现服务与特征" onClick={() => run('bluetooth', 'getServices', () => services.bluetooth.getServices(device))} />
    <TextInput value={characteristic} onChangeText={setCharacteristic} placeholder="特征 UUID" style={{ height: 44 }} />
    <Button title="读取特征字节" onClick={() => run('bluetooth', 'read', () => services.bluetooth.read(device, service, characteristic))} />
    <TextInput value={bytes} onChangeText={setBytes} placeholder="写入字节：十进制，以逗号分隔" style={{ height: 44 }} />
    <Button title="写入特征（有响应）" onClick={() => run('bluetooth', 'write', () => services.bluetooth.write(device, service, characteristic, bytes.split(',').map(value => Number(value.trim()))))} />
    <Button title="监听特征通知" onClick={() => run('bluetooth', 'setNotify', async () => { stop.current?.(); stop.current = services.bluetooth.subscribe(value => { if (mounted.current) setResult(JSON.stringify(value)); }, error => { if (mounted.current) setResult(String(error)); }); await services.bluetooth.setNotify(device, service, characteristic, true); })} />
    <Button title="停止特征通知" onClick={() => run('bluetooth', 'setNotify', async () => { await services.bluetooth.setNotify(device, service, characteristic, false); stop.current?.(); stop.current = null; })} />
    <Button title="断开蓝牙" onClick={() => run('bluetooth', 'disconnect', async () => { stop.current?.(); stop.current = null; await services.bluetooth.disconnect(device); })} />
    <Text style={{ color: '#275de5' }}>{result}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>NFC / NDEF 标签</Text>
    <Text>需要 NFC 真机及可用的 NDEF 标签；读取文本或 URL，其他记录以 Base64 返回。写入会修改靠近的标签内容。</Text>
    <Button title="读取 NFC 标签" onClick={() => run('nfc', 'read', () => services.nfc.read())} />
    <TextInput value={text} onChangeText={setText} placeholder="写入标签的文本" style={{ height: 44 }} />
    <Button title="写入 NFC 文本标签" onClick={() => run('nfc', 'writeText', () => services.nfc.writeText(text))} />
    <Text testID="device-status-footer" style={{ color: '#275de5' }}>{result}</Text>
  </View>;
}
