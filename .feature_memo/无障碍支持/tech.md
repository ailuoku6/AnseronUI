# 技术

- `CommonProps` 提供语义；Core 将 accessibilityInfo 展平为两个布尔协议字段。默认动作从现有 BindEvent 推导。
- NodeHandle 复用 `__view` 服务调用及既有挂载/销毁所有权。
- 每端按完整 SetProps 快照恢复缺省语义，同时 BindEvent 更新动作。
- iOS 使用 traits、isAccessibilityElement、custom actions、UIAccessibility.post；Label/Image 子类把激活路由到 Tap。
- Android 使用 importantForAccessibility、AccessibilityDelegate、ACTION_*；回收 TextView 清理语义状态。
- macOS 使用 NSAccessibility role/help/value/hidden/custom actions；DesktopTextField 支持 press。
- Web 使用 ARIA、键盘激活、polite live region；销毁清除播报计时器。
- Harmony CAPI 使用 mode/group/role/actions/state/value；ArkTS 发送系统事件。focus 用 CAPI 节点 ID 定位，不打开键盘。
