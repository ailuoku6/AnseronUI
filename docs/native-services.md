# 标准系统能力

`useServices()` 直接提供以下系统能力，iOS、Android、macOS 与 Web 宿主默认接入，无需逐个注册 Module。示例 App 的「扩展」页面下半部分包含可点击用例：基础信息、存储、剪贴板、弹窗、分享、环境监听、HTTP、文件传输、权限和定位。

```tsx
const services = useServices();
await services.storage.set('draft', '你好', 'editor');
const draft = await services.storage.get('draft', 'editor');
const response = await services.http.request({
  url: 'https://example.com/api', method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ draft }), timeout: 15000,
});
// 非 2xx 响应同样返回 status、headers 和 body，由业务判断。
```

## 接口与平台支持

| 服务 | 接口 | 平台差异 |
| --- | --- | --- |
| `http` | `request({url,method?,headers?,body?,timeout?})`、原有 `getText(url)` | timeout 单位毫秒，默认 30000；request 返回 `{status,headers,body}`；Web 受 CORS 限制 |
| `storage` | `get/set/remove/keys/clear` | 值为字符串，namespace 默认 `default`，clear 仅清理指定命名空间 |
| `secureStorage` | 同 storage | Apple Keychain；Android Keystore AES-GCM；Web 不支持，不回退到普通存储 |
| `app` | `getInfo()` | 名称、版本、构建号、应用 ID；Web 使用 document.title、origin，版本为 `web`，构建号为空 |
| `device` | `getInfo()` | 平台、系统版本、设备型号；不读取永久设备标识 |
| `locale` | `getInfo()` | 语言标签、时区 |
| `clipboard` | `readText()`、`writeText(text)` | Web 需安全上下文；各端读取受系统隐私限制 |
| `dialogs` | `alert(title,message?)`、`confirm(...)`、`actionSheet(title,options)` | confirm 取消返回 false，菜单取消返回 null；Web 使用 dialog，macOS 使用 sheet |
| `linking` | `openURL/canOpenURL/openSettings/getInitialURL/subscribe` | Web 不支持打开应用设置，只允许 http/https/mailto/tel；Web 订阅 hashchange/popstate |
| `share` | `text(text)`、`file(file)` | 返回 completed/cancelled/unknown；Android、macOS 不能确认接收方是否完成，返回 unknown；Web 需 Web Share API |
| `haptics` | `impact(style?)`、`notification(type?)`、`selection()` | 设备触觉能力决定实际效果，Web 需 Vibration API，macOS 使用通用触觉反馈 |
| `appState` | `get()`、`subscribe()` | active/background；Web 基于页面可见性 |
| `network` | `getStatus()`、`subscribe()` | connected/type；联网状态不代表目标服务可达 |
| `window` | `getMetrics()`、`subscribe()` | width/height/scale/safeArea，逻辑单位 |
| `appearance` | `get()`、`subscribe()` | light/dark |
| `keyboard` | `dismiss()`、`subscribe()` | macOS 无软键盘事件；Web 根据 visualViewport 变化推测软键盘高度 |
| `permissions` | `check(name)`、`request(name)` | location/camera/photos/microphone/notifications；返回 granted/denied/prompt/restricted/limited/unsupported |
| `location` | `getCurrentPosition()`、`watchPosition()` | 先请求定位权限；单次定位最多等待约 15 秒；持续定位仅限当前宿主存活期间 |
| `media` | `pickPhoto()` | 系统照片或图片文件选择器；取消返回 null；系统选择器本身通常无需全库访问权限 |
| `files` | `pickDocument()`、`release(file)` | 取消返回 null；返回宿主拥有的文件引用 |
| `transfers` | `download(taskId,url,headers?)`、`upload(taskId,url,file,headers?)`、`cancel(taskId)`、`subscribe()` | 上传为原始文件 POST；不是 multipart；进度 transferred/total 单位字节，total 为 0 表示未知 |
| `capabilities` | `has(module,method?)` | 查询 API 是否可用；权限及硬件实际状态仍需单独检查 |

Web 的方法可能需要用户操作、安全上下文或浏览器权限；异步桥接无法保证浏览器保留所有短暂用户激活状态。浏览器拒绝分享、剪贴板、文件选择、弹窗或打开窗口时，应引导用户通过宿主页面操作。macOS 的应用沙箱、相机、麦克风、定位权限与签名配置由应用负责。

## 订阅与生命周期

```tsx
useEffect(() => {
  return services.network.subscribe(
    status => setConnected(status.connected),
    error => setError(String(error)),
  );
}, []);
```

`subscribe()` 同步返回取消函数，可立即取消，重复取消无副作用。所属组件卸载时自动取消。宿主在 Core 忙时只保留每个订阅的最新值，适用于状态及进度，不保证逐条交付每一个高频事件。订阅回调抛出异常时停止该订阅并通知 onError。系统权限弹窗不一定能被强制关闭，但取消后的结果不会再送达组件。

底层复用 `events.next({id,module})` 和 `events.close({id})`。next 有事件才完成；下一次 next 到来前原生监听持续存在。取消正在等待的请求会同时移除监听，关闭操作也覆盖两次读取之间的间隙。`events` 是框架保留模块。

自定义模块可以在宿主的 `subscriptions` 注册事件源，然后使用 `services.subscribe<T>('your.module', listener, onError)`。Web 的事件源接受 `emit({value})` 或 `emit({error})` 并返回清理函数；Apple 接受 `NativeCompletion` 并返回取消闭包；Android 接受 `NativeCompletion` 并返回取消 lambda。npm 插件生成注册表会合并 subscriptions，并拒绝同名订阅。

## 文件和网络载荷

文件引用为 `{id,name,size,mimeType}`，只在所属宿主内有效；不包含原生对象、可任意访问的路径或完整文件内容。原生选择器把文件复制进临时空间，Web 保留 File。调用 release 或销毁宿主会释放引用，不能跨页面缓存，也不能在上传进行中释放正在使用的文件。

HTTP 普通正文支持文本/JSON，request 的正文响应上限为 48000 字节左右，整个编码结果仍受 64 KiB 桥接限制。大文件使用 download/upload。Web 下载使用浏览器内存构建 File，应控制文件大小。传输 taskId 在当前宿主的活动任务中必须唯一；退出页面会取消任务，本版本不提供后台续传。进度可能合并，未知长度时 total 为 0。

## 权限与链接接入

iOS 在 Info.plist 配置对应的 `NSLocationWhenInUseUsageDescription`、`NSCameraUsageDescription`、`NSMicrophoneUsageDescription`、`NSPhotoLibraryUsageDescription`。macOS 定位还应配置 `NSLocationUsageDescription`，沙箱 App 按实际需要声明系统 entitlement。iOS 安全存储需要正常签名的应用身份；CLI 的模拟器构建默认采用临时签名，无需开发团队。未签名模拟器 App 可能被 Keychain 拒绝，接口不会降级存储明文。

Android 在 Manifest 按实际需求声明 ACCESS_COARSE_LOCATION/ACCESS_FINE_LOCATION、CAMERA、RECORD_AUDIO、POST_NOTIFICATIONS 和相应版本的照片权限。框架库默认只加入网络状态、网络、振动和受控文件分享 Provider。示例 App 为权限演示声明上述权限；新建业务 App 需按需求配置。选择照片/文档使用系统选择器，无需为了选择单个文件申请广泛存储权限。

示例和新建工程已转发 iOS openURL、Android onCreate/onNewIntent、macOS open URLs 到 `AnseronUILinks.receive`。已有原生宿主也应转发相同回调；应用还需配置 URL scheme、Android intent-filter 或通用链接关联。链接事件只传 URL，不自动更改路由。

## 错误

标准服务抛出 `NativeServiceError`，code 为 `UNSUPPORTED`、`PERMISSION_DENIED`、`CANCELLED`、`TIMEOUT`、`INVALID_ARGUMENT` 或 `IO_ERROR`。原始宿主信息保留在 message，便于定位配置或系统错误。业务用 code 分支处理，不应解析平台特有错误字符串。用户主动关闭选择器、确认框或分享面板时，优先使用正常返回值表示取消。

## 推送通知、后台任务、蓝牙与 NFC

支付按本次需求暂不接入，生物识别不在本次范围。新增服务通过 `useServices()` 获得，所有跨端参数和结果仍为 JSON；调用前使用 `capabilities.has(module, method)` 检查具体方法。

| 服务 | iOS | Android | macOS | Web |
| --- | --- | --- | --- | --- |
| `notifications.register` | APNs，需签名 entitlement 与 delegate 回调 | FCM／厂商 SDK 提供 tokenProvider 后启用 | APNs，需签名配置与 delegate 回调 | 活跃 Service Worker + VAPID 公钥 |
| 本地通知 | 系统调度，至少延迟 1 秒 | AlarmManager 非精确调度；需通知权限 | 系统调度，至少延迟 1 秒 | Service Worker 即时通知，`delaySeconds: 0` |
| `background` | BGProcessingTask，宿主启动时注册 | JobScheduler，Application 注册处理器 | 不支持 | Background Sync，依浏览器；无延迟与取消 API |
| BLE | CoreBluetooth | Bluetooth LE / GATT | CoreBluetooth | Web Bluetooth 系统选择器；依浏览器与安全上下文 |
| NFC | CoreNFC NDEF；需真机及 entitlement | NFC Reader Mode / NDEF | 不支持 | Web NFC；依浏览器、设备与安全上下文 |

### 通知与消息消费

```tsx
const services = useServices();
await services.permissions.request('notifications');
const registration = await services.notifications.register(); // { token, provider }
// 应用负责把 token 上传自己的推送服务；框架不发送远程推送。
await services.notifications.schedule({ id: 'reminder', title: '提醒', body: '内容', delaySeconds: 5 });
await services.notifications.cancel('reminder');
const events = await services.notifications.getEvents();
// 业务处理成功后再确认，读取本身不删除。
await services.notifications.acknowledge(events.map(event => event.id));
```

通知事件为 `{ id, kind: 'received' | 'opened' | 'token', payload, timestamp }`，时间为 Unix 毫秒。收件箱存于应用持久化空间，页面销毁和重建不清空。最多保留最近 100 条且总 JSON 大小不超过 48 KB，超限从最旧条目淘汰，单条超过容量也会淘汰。它是供应用同步消费的有限收件箱，不能替代服务端消息历史；推送渠道也不保证每次送达。接收和点击可能各自形成一条事件。

Apple demo 和脚手架已转发注册成功／失败、远程消息及通知点击回调至 `AnseronUINotifications`。自定义 AppDelegate 时需转发相同回调，并设置 `UNUserNotificationCenter.current().delegate`。APNs 需要 `aps-environment` entitlement、开发者配置文件及服务端 APNs 凭据。静默推送需要 `remote-notification` 后台模式，系统决定是否唤醒。模拟器／ad-hoc 签名构建不会自动获得 APNs 生产配置。

Android 没有通用系统远程推送 token。接入自己的 FCM／厂商 SDK 后，在 `Application.onCreate` 配置：

```kotlin
AnseronUINotifications.tokenProvider = { complete ->
    // providerSdk.fetchToken 成功时：
    // complete(Result.success(JSONObject().put("token", token).put("provider", "fcm")))
    // 失败时 complete(Result.failure(IllegalStateException("IO_ERROR: ...")))
    // 返回取消闭包，或在 SDK 不支持取消时返回 null。
    null
}
// SDK 消息回调（不依赖 Activity 或页面）：
AnseronUINotifications.receive(applicationContext, payloadJSONObject)
AnseronUINotifications.tokenChanged(applicationContext, newToken, "fcm")
// 通知打开时：receive(context, payload, opened = true)
```

上面的 provider 代码是接入位置示意；应替换为实际 SDK 的异步 token 获取。未配置 provider 时 `capabilities.has('notifications', 'register')` 为 false。demo Activity 和脚手架已调用 `receiveIntent`，用于框架本地通知的点击事件。远程通知的 SDK 自有 Intent 由应用转换后转发。Android 13+ 需 `POST_NOTIFICATIONS`；本地通知采用非精确 AlarmManager，不申请精确闹钟权限，系统可能推迟投递；重启后本地闹钟需应用重新提交。

Web 宿主通过 `PlatformExtensions.services` 传入 `{ registration, applicationServerKey, backgroundIdentifiers }`。`registration` 应来自应用注册且已激活的 Service Worker；VAPID 公钥是 URL-safe Base64。`notifications.register()` 返回 `{ provider: 'webpush', token }`，其中 token 是 PushSubscription JSON（含 endpoint 和公钥），应用负责交给推送后端。使用 SDK 导出的 `installNativeServiceWorker(self, handlers)` 安装 push、notificationclick 和 sync 监听。示例 `examples/native/web/native-worker.ts` 已安装收件箱和示例后台处理器；未配置 VAPID，不假装可注册远程推送。Web 的 `cancel` 关闭已展示通知，没有延时通知调度；浏览器拒绝非零延时。

### 后台原生处理器

```tsx
await services.background.schedule({ identifier: 'org.anseronui.demo.refresh', delaySeconds: 0, requiresNetwork: true });
const pending = await services.background.pending(); // identifier[]
const completed = await services.background.getEvents(); // { id, identifier, success, timestamp }[]
await services.background.acknowledge(completed.map(event => event.id));
await services.background.cancel('org.anseronui.demo.refresh');
```

后台工作是宿主注册的原生处理器，不执行卸载页面的 TSX 回调。提交任务成功表示系统接收请求，不表示已运行。iOS 与 Android 的 `delaySeconds` 为最早执行时间；系统可延后或不执行。同一标识重复提交在 Android 更新已有 job；iOS 按 BGTaskScheduler 的系统规则返回错误。`pending()` 列出系统已接收尚未运行的任务。持久化执行结果需业务读取后确认；取消、系统终止进程等情况不保证产生结果。

Apple 在 AppDelegate 启动时注册标识，并在 Info.plist 的 `BGTaskSchedulerPermittedIdentifiers` 声明它，`UIBackgroundModes` 包含 `processing`：

```swift
AnseronUIBackground.register("org.example.refresh") { complete in
    // 启动异步原生工作，完成后调用 complete(true/false)。
    // 可返回取消闭包；系统到期时调用它，并将任务标为失败。
    return nil
}
```

Android 在 `Application.onCreate`（每次进程启动，包括 JobService 启动时）注册：

```kotlin
AnseronUIBackground.register("org.example.refresh") { context, complete ->
    // 将耗时任务交给线程池；完成后 complete(true/false)。
    null // 可替换为取消闭包
}
```

框架库声明了 `AnseronUIJobService` 及持久任务所需 `RECEIVE_BOOT_COMPLETED` 权限。demo 的处理器 `org.anseronui.demo.refresh` 写入最后执行时间后完成。Web 处理器是 Service Worker 中的 Promise；`schedule` 仅支持 `delaySeconds: 0`，网络条件由 Background Sync 控制，没有 `cancel` 方法，能力查询返回 false。Web 示例将最后执行时间写入 Cache Storage。后台回调的耗时工作须在系统允许时间内完成。

### BLE 扫描、连接与 GATT

```tsx
const devices = await services.bluetooth.scan(['180f'], 5000);
const id = devices[0]!.id;
await services.bluetooth.connect(id);
const characteristics = await services.bluetooth.getServices(id);
const battery = await services.bluetooth.read(id, '180f', '2a19'); // number[]，每个值 0..255
const stop = services.bluetooth.subscribe(event => console.log(event));
// 在支持 Notify/Indicate 的特征上启用：
await services.bluetooth.setNotify(id, serviceUUID, characteristicUUID, true);
await services.bluetooth.setNotify(id, serviceUUID, characteristicUUID, false);
stop();
await services.bluetooth.disconnect(id);
```

`getServices()` 返回扁平的 `{ service, characteristic, readable, writable, notifiable }[]`。先发现服务再读写。`write(id, service, characteristic, bytes)` 使用有响应写入；Android 限制为默认 ATT MTU 下的 20 字节，Apple 按连接的最大写入长度检查；更长数据由业务按设备协议分片。UUID 支持 16／32／128 位表示。设备标识是宿主不透明引用，应先扫描，不应跨安装持久化。

原生扫描支持 500..30000 ms，扫描结束返回去重设备列表 `{ id, name, rssi }[]`。Web 的 scan 打开系统选择器，只返回用户选中的一台设备；浏览器不暴露 RSSI，用 0 表示未知，`durationMs` 不控制选择器。必须在用户操作中调用；过滤服务也决定浏览器授予的服务访问权限。

一次仅运行一个 GATT 操作；超时约 35 秒。切页取消扫描并断开页面拥有的连接。特征订阅按到达顺序缓存最多 64 条，保留相同字节的重复事件；消费过慢溢出报告 `IO_ERROR` 并终止订阅。业务应停止 notify／重连后恢复；它不提供无限缓存。

Apple 需要 `NSBluetoothAlwaysUsageDescription`（demo 和脚手架已加）。Android demo 已加 `BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT`；Android 11 及以前需要蓝牙与定位权限，扫描前由框架申请运行时权限；Android 12+ 扫描时申请 Nearby Devices 权限。库不替宿主声明敏感蓝牙权限，自有应用需在 Manifest 添加与 demo 对应的权限与可选硬件声明。关闭蓝牙、拒绝权限和断开连接会返回错误。

### NFC NDEF

```tsx
const message = await services.nfc.read(); // { records: [{ type, text }] }
await services.nfc.writeText('AnseronUI');
```

`read()` 读取一个 NDEF 标签的记录，文本为 `type: 'text'`，URI 为 `type: 'url'`，其他类型的 `text` 是 payload Base64。写入 UTF 文本记录，检查标签是否可写及容量；不会自动格式化非 NDEF 标签。iOS 使用系统会话，可由用户取消；Android／Web 约 30 秒超时，切页释放会话。

iOS 必须配置 `NFCReaderUsageDescription` 与 `com.apple.developer.nfc.readersession.formats` entitlement 的 `NDEF` 值，并启用开发者账号 NFC Tag Reading capability；这要求真机、有效签名与配置文件。示例 entitlement 文件见 `examples/native/ios/DeviceServices.entitlements.example`，需与自己的应用签名配置合并。Android Manifest 需 `android.permission.NFC` 及可选 NFC 硬件声明。Web 需支持 NDEFReader 的浏览器、NFC 硬件、安全上下文和用户许可。macOS／无 NFC 的平台通过能力查询降级。

Extensions 页面末尾的「通知、后台任务与设备连接」包含上述完整操作入口。默认 BLE 用例读取电池服务，写入和订阅需要改成目标设备支持的特征；NFC 写入按钮会修改靠近标签的内容。
