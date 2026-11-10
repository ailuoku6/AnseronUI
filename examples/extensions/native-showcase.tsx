import { Button, Text, TextInput, View, useEffect, useRef, useServices, useState } from '@anseronui/ui';
import type { FileReference, PermissionName, UIElement, Unsubscribe } from '@anseronui/ui';

/** Every operation is user initiated; changing pages releases listeners and file handles. */
export function NativeShowcase(): UIElement {
  const services = useServices();
  const [status, setStatus] = useState('点击操作查看结果');
  const [events, setEvents] = useState('未开启监听');
  const [value, setValue] = useState('AnseronUI 原生能力示例');
  const [url, setURL] = useState('https://httpbin.org/anything');
  const [permission, setPermission] = useState<PermissionName>('location');
  const [selected, setSelected] = useState<FileReference | null>(null);
  const [listening, setListening] = useState(false);
  const stops = useRef<Unsubscribe[]>([]);
  const mounted = useRef(true);
  const file = useRef<FileReference | null>(null);
  const report = (label: string, result: unknown) => { if (mounted.current) setStatus(label + ': ' + JSON.stringify(result ?? '完成')); };
  const run = async (label: string, module: string, method: string, action: () => Promise<unknown>) => {
    try { if (!await services.capabilities.has(module, method)) { report(label, '当前平台不支持'); return; } report(label, await action()); }
    catch (error) { if (mounted.current) setStatus(label + ': ' + String(error)); }
  };
  const receive = (label: string, result: unknown) => { if (mounted.current) setEvents(label + ': ' + JSON.stringify(result)); };
  const stop = () => { for (const unsubscribe of stops.current) unsubscribe(); stops.current = []; setListening(false); };
  const choose = async (photo: boolean) => {
    const next = photo ? await services.media.pickPhoto() : await services.files.pickDocument();
    if (next) { if (file.current) await services.files.release(file.current); file.current = next; setSelected(next); }
    return next ?? '已取消，保留原选择';
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const unsubscribe of stops.current) unsubscribe(); stops.current = []; };
  }, []);
  return <View style={{ flexDirection: 'column', gap: 12, paddingTop: 24 }}>
    <Text style={{ fontSize: 22, fontWeight: 'bold' }}>系统能力用例</Text>
    <Text testID="native-status" style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <TextInput testID="native-value" value={value} onChangeText={setValue} placeholder="存储、复制、分享的文本" style={{ height: 44 }} />
    <Text style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>应用、设备与环境</Text>
    <Button testID="native-info" title="读取应用 / 设备 / 语言" onClick={() => run('基础信息', 'app', 'getInfo', async () => ({ app: await services.app.getInfo(), device: await services.device.getInfo(), locale: await services.locale.getInfo() }))} />
    <Button title="读取网络 / 窗口 / 主题 / 前后台" onClick={() => run('当前环境', 'network', 'getStatus', async () => ({ network: await services.network.getStatus(), window: await services.window.getMetrics(), appearance: await services.appearance.get(), appState: await services.appState.get() }))} />
    <Button title={listening ? '停止环境监听' : '监听网络 / 窗口 / 主题 / 键盘 / 前后台 / 链接 / 传输'} onClick={async () => {
      if (listening) { stop(); setEvents('已停止监听'); return; }
      setListening(true);
      const modules = ['network', 'window', 'appearance', 'keyboard', 'appState', 'linking', 'transfers'];
      for (const module of modules) {
        try { if (await services.capabilities.has(module, 'subscribe')) stops.current.push(services.subscribe(module, result => receive(module, result), error => receive(module, String(error)))); }
        catch (error) { receive(module, String(error)); }
      }
    }} />
    <Text testID="native-events" style={{ fontSize: 14 }}>{events}</Text>
    <Text style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>普通存储与安全存储</Text>
    <Button testID="native-storage" title="普通存储：写入并读回" onClick={() => run('普通存储', 'storage', 'set', async () => { await services.storage.set('sample', value, 'showcase'); return await services.storage.get('sample', 'showcase'); })} />
    <Button title="普通存储：列出 / 删除 / 清空示例空间" onClick={() => run('清理普通存储', 'storage', 'keys', async () => { const keys = await services.storage.keys('showcase'); await services.storage.remove('sample', 'showcase'); await services.storage.clear('showcase'); return { before: keys, after: await services.storage.keys('showcase') }; })} />
    <Button title="安全存储：写入 / 读取 / 列出 / 删除 / 清空" onClick={() => run('安全存储', 'secureStorage', 'set', async () => { await services.secureStorage.set('sample', value, 'showcase'); const saved = await services.secureStorage.get('sample', 'showcase'); const keys = await services.secureStorage.keys('showcase'); await services.secureStorage.remove('sample', 'showcase'); await services.secureStorage.clear('showcase'); return { saved, keys }; })} />
    <Text style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>剪贴板、弹窗与分享</Text>
    <Button title="复制文本" onClick={() => run('复制', 'clipboard', 'writeText', () => services.clipboard.writeText(value))} />
    <Button title="读取剪贴板" onClick={() => run('读取剪贴板', 'clipboard', 'readText', () => services.clipboard.readText())} />
    <Button title="系统提示框" onClick={() => run('提示框', 'dialogs', 'alert', () => services.dialogs.alert('原生提示框', value))} />
    <Button testID="native-confirm" title="系统确认框" onClick={() => run('确认框', 'dialogs', 'confirm', () => services.dialogs.confirm('是否继续？', '取消也会正常返回结果'))} />
    <Button title="系统操作菜单" onClick={() => run('操作菜单', 'dialogs', 'actionSheet', () => services.dialogs.actionSheet('选择一项', ['选项一', '选项二', '选项三']))} />
    <Button title="分享文本" onClick={() => run('分享', 'share', 'text', () => services.share.text(value))} />
    <Button title="轻触 / 选择 / 成功反馈" onClick={() => run('触觉反馈', 'haptics', 'impact', async () => { await services.haptics.impact('light'); await services.haptics.selection(); await services.haptics.notification('success'); })} />
    <Button title="隐藏键盘" onClick={() => run('键盘', 'keyboard', 'dismiss', () => services.keyboard.dismiss())} />
    <Text style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>链接、HTTP 与文件传输</Text>
    <TextInput testID="native-url" value={url} onChangeText={setURL} placeholder="HTTP / 下载 / 上传 / 外部链接地址" style={{ height: 44 }} />
    <Button title="检查链接可打开" onClick={() => run('检查链接', 'linking', 'canOpenURL', () => services.linking.canOpenURL(url))} />
    <Button title="打开外部链接" onClick={() => run('打开链接', 'linking', 'openURL', () => services.linking.openURL(url))} />
    <Button title="读取启动链接" onClick={() => run('启动链接', 'linking', 'getInitialURL', () => services.linking.getInitialURL())} />
    <Button title="打开应用设置" onClick={() => run('应用设置', 'linking', 'openSettings', () => services.linking.openSettings())} />
    <Button title="HTTP GET：状态 / 响应头 / 正文" onClick={() => run('GET', 'http', 'request', () => services.http.request({ url, timeout: 15000 }))} />
    <Button title="HTTP POST JSON" onClick={() => run('POST', 'http', 'request', () => services.http.request({ url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: value }), timeout: 15000 }))} />
    <Button title="选择照片" onClick={() => run('照片', 'media', 'pickPhoto', () => choose(true))} />
    <Button title="选择文档" onClick={() => run('文档', 'files', 'pickDocument', () => choose(false))} />
    <Text testID="native-file">{selected ? selected.name + ' · ' + selected.size + ' bytes · ' + selected.mimeType : '未选择文件'}</Text>
    <Button title="分享已选文件" disabled={!selected} onClick={() => run('分享文件', 'share', 'file', async () => file.current ? services.share.file(file.current) : '请先选择文件')} />
    <Button title="下载到文件（任务 demo-download）" onClick={() => run('下载', 'transfers', 'download', async () => { const next = await services.transfers.download('demo-download', url); if (file.current) await services.files.release(file.current); file.current = next; setSelected(next); return next; })} />
    <Button title="上传已选文件（任务 demo-upload）" disabled={!selected} onClick={() => run('上传', 'transfers', 'upload', async () => file.current ? services.transfers.upload('demo-upload', url, file.current) : '请先选择文件')} />
    <Button title="取消上传和下载" onClick={() => run('取消传输', 'transfers', 'cancel', async () => { await services.transfers.cancel('demo-download'); await services.transfers.cancel('demo-upload'); })} />
    <Button title="释放已选文件" disabled={!selected} onClick={() => run('释放文件', 'files', 'release', async () => { if (file.current) await services.files.release(file.current); file.current = null; setSelected(null); })} />
    <Text style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
    <Text style={{ fontSize: 18, fontWeight: 'bold' }}>权限与定位</Text>
    <Text>当前权限：{permission}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button title="定位" onClick={() => setPermission('location')} /><Button title="相机" onClick={() => setPermission('camera')} /><Button title="照片" onClick={() => setPermission('photos')} /><Button title="麦克风" onClick={() => setPermission('microphone')} /><Button title="通知" onClick={() => setPermission('notifications')} />
    </View>
    <Button title="检查当前权限" onClick={() => run('检查权限', 'permissions', 'check', () => services.permissions.check(permission))} />
    <Button title="申请当前权限" onClick={() => run('申请权限', 'permissions', 'request', () => services.permissions.request(permission))} />
    <Button title="读取一次定位（先申请权限）" onClick={() => run('定位', 'location', 'getCurrentPosition', () => services.location.getCurrentPosition())} />
    <Button title="开启持续定位（停止环境监听可一起关闭）" onClick={async () => {
      try { if (!await services.capabilities.has('location', 'watchPosition')) { report('持续定位', '当前平台不支持'); return; } stops.current.push(services.location.watchPosition(position => receive('定位', position), error => receive('定位', String(error)))); setListening(true); }
      catch (error) { report('定位', String(error)); }
    }} />
    <Text testID="native-status-footer" style={{ color: '#275de5', fontSize: 14 }}>{status}</Text>
  </View>;
}
