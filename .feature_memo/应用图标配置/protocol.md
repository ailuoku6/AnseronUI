# Protocols and Contracts

- 配置：`app.icon` = PNG 路径字符串，或 `{default?,ios?,android?,macos?,web?}`。路径相对于应用配置所在目录，不可指向 `.anseronui/`。
- iOS：`{type?:"images",light?,dark?,tinted?}`，light 回退 default；或互斥 `{type:"composer"|"appiconset",source}`。
- Android：`{legacy?,round?,adaptive?:{foreground,background:{color|image},monochrome?},night?:{legacy?,round?,foreground?,background?,monochrome?}}`；或互斥 `{resources}`。
- Android legacy 回退 default；legacy/adaptive 至少一个。night legacy/round/monochrome 要求对应默认资源，foreground/background 要求 adaptive。颜色支持 #RRGGBB 或 Android #AARRGGBB。
- macos：PNG/ICNS 路径；web：PNG 路径；均回退 default。未提供平台及 default 时保留原生宿主行为。
- PNG 方形且最大 4096；默认四端单图受 iOS 1024 与透明度约束。Android XML 支持 Vector Drawable，不转 SVG。
- 删除配置后在下次 build 清理对应生成资源；no-build 不更新产物。
- 原生资源目录不支持内部符号链接；Android 要定义 @mipmap/ic_launcher，iOS 要有 Contents.json 和所列图片。
- 完整用户协议见 `docs/app-icons.md`，随 SDK 分发。
