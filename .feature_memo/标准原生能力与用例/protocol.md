# 契约
Services 扩展标准模块并保留 invoke/getText。
http.request({url,method?,headers?,body?,timeout?}) -> {status,headers,body}，非 2xx 正常返回。
存储值为 string，namespace 默认 default，clear 仅当前空间。
FileReference={id,name,size,mimeType}，只能在所属宿主内使用，release/销毁清理；文件数据不走 JSON。
Transfer taskId 在活动任务内唯一；上传为原始文件 POST；取消可通过任务 id。
NativeServiceError.code 统一 UNSUPPORTED/PERMISSION_DENIED/CANCELLED/TIMEOUT/INVALID_ARGUMENT/IO_ERROR。
订阅返回同步取消函数，支持可选 onError；插件可注册 subscriptions 事件源。

- notifications: register/schedule/cancel/getEvents/acknowledge；事件 {id,kind,payload,timestamp}。getEvents 不删除，按 id 确认消费。应用级持久收件箱最多 100 条、48 KB，超限淘汰最旧事件。
- background: schedule({identifier,delaySeconds?,requiresNetwork?})/pending/cancel/getEvents/acknowledge。原生系统决定执行时间；Web 不支持延迟与取消。后台结果 {id,identifier,success,timestamp}。
- bluetooth: scan/connect/disconnect/getServices/read/write/setNotify/subscribe；字节 number[]；UUID 支持 16/32/128 位。Android 有响应写入最多 20 bytes。Web scan 为系统选择器返回单设备，RSSI=0 表示未知。
- nfc: read() -> {records:[{type,text}]}，writeText(text)。非文本/URL payload 为 Base64。macOS 无 NFC／BGTaskScheduler 能力，查询返回 false。
