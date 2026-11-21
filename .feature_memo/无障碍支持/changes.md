# 进展

## 2026-11-21

- 已实现共享 API/协议、五端映射、组件页末尾的无障碍演示与使用文档。
- 已通过：framework 类型检查；framework 19 文件 / 102 测试；Harmony 53 测试；真实 WebKit DOM 无障碍回归；iOS AOT/宿主构建与 iOS 26.4 模拟器专项测试 1 项；Android 10（VOG-AL10）设备专项测试 1 项；完整 macOS AOT/AppKit 集成测试（含新演示的勾选、长按、播报和焦点方法）；鸿蒙 API21 HAP 构建。
- macOS 已验证共享 TSX → AOT Core → AppKit → 状态更新及 __view ref 调用。未启用 VoiceOver，因此仅证明语义与请求链路，不证明实际语音。
- 已通过 Web/Wasm AOT 构建及 accessibility-wasm 真实浏览器链路：共享 TSX → Wasm → DOM 的 checkbox 受控状态、长按、播报 live region、聚焦、隐藏子树及销毁全部通过。
- 最终 `git diff --check` 通过。未创建提交。
- Web 最终回归额外验证父容器不截获输入框按键、显式动作禁用、命名文本 group 与输入原生语义。
- 鸿蒙 hdc 无连接设备；未执行设备读屏验收。
- 首次 Android 测试误取 surface 包装层且视图未附着；已改用 renderer.viewFor 的真实节点并挂到 Activity，设备回归通过。
- 首次 iOS/Harmony 验证期间修改了共享源码，触发 Core 指纹失效；已冻结共享源码并重建，最终验证通过。后续构建时勿并行修改共享源码。
- 沙箱内 Gradle 用户缓存、WebKit、设备服务不可用；申请扩展执行后自动审批允许，未要求用户确认。
