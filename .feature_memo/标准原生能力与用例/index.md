# 标准原生能力与用例
- Status: done
- Last updated: 2026-11-10
- Current focus: 基础标准服务及追加通知、后台任务、BLE/GATT、NFC/NDEF 与页面用例已实现，支付按用户要求暂不接入。验证与设备边界见 changes.md。
- 文档地图：brief.md 需求；tech.md 实现；protocol.md 契约；files.md 文件；decisions.md 决策；changes.md 验证；handoff.md 续接。
- 已完成：HTTP、存储与安全存储、信息、剪贴板、弹窗、链接、分享、触觉、环境订阅、权限、定位、文件选择与传输。
- 追加：应用级通知收件箱与确认消费、本地通知／推送注册接入、原生后台处理器、BLE 扫描连接读写通知、NFC NDEF 读写；详见 docs/native-services.md。
- 下一步：配置自己的 APNs／Android 推送供应商／Web VAPID，在真实设备验证远程推送、后台系统调度、BLE 外设及 NFC 标签。当前无 Android 连接设备。
