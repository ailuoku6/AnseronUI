# 交接说明

用户要求完善鸿蒙直到与其他端对齐。当前为 HarmonyOS 6.0.1/API 21 原生 Stage + ArkTS 服务 + C++ ArkUI Native Node + 固定线程 AOT Core，已完成主要标准服务及渲染/生命周期对齐。先读 docs/harmonyos.md，不要再按早期“通知/BLE/NFC 未实现”的历史记录判断。

关键文件：HarmonyApplicationServices（通知/后台、持久收件箱）、HarmonyRadioServices（BLE/NFC）、HarmonyPageStack/AnseronView（可见性/容量回收）、HarmonyMedia/HarmonyVideoSurface（AVPlayer）、HarmonyHost（服务/协议/统计）、bridge.cpp（事件/焦点/插件/原生计时）。DemoExtensions.cpp 仅仓库示例自动链接。

测试：Harmony 40，framework 80，tooling 30 pass/2 skip，build 7，npm package 1。设备烟测 14 组，.verification/harmony/acceptance/results.json；提醒 schedule 1700002 是使用资格/配额阻塞，绝非成功。最新日志 parity-*.log。完整 build 用 scripts/anseronui.mjs build harmony --config examples/harmony-smoke/anseronui.config.json；run harmony --no-build --device 127.0.0.1:5557 后 scripts/test-harmony.mjs 127.0.0.1:5557。

避坑：UIAbility 构造会无 Want 调用 onCreate，先 guard；不能每次 MoveChild 都拆挂原位置节点，否则 focus 立刻 blur；native.invokeView 需 ui.runScopedTask 且 await 自定义 Promise；AVPlayer raw fd 需串行所有权及代际检查；WorkScheduler repeatCount:1 + 最小两小时；SDK 类型文件是大写 Index.d.ts；JSON5 的 TypeScript 依赖需按需加载，不阻塞无安装编译依赖的 create。

剩余：开发者签名、代理提醒资格、推送 SDK、BLE/NFC 外设及各系统交互真机验证；autoCapitalize/autoCorrect 暂保留系统输入法行为。工作区大量原有未提交修改，别回滚其他平台。未提交 Git。DevEco SDK 位于 /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony，hdc 连接本机 server 需提升沙箱权限。

2026-11-14 主示例安装发现 READ_PASTEBOARD 被测试签名拒绝（9568289），默认配置已移除该受限权限；不修改SDK测试profile绕过授权，正式剪贴板读取需应用合法授权。其他demo权限按功能声明。

最终主配置七页 HAP 已构建、安装、启动；scripts/test-harmony-demo.mjs 额外验证原生扩展、5000项列表跳到4000（挂载7行）、头插仍在深处窗口，报告 acceptance/main-results.json。默认示例不声明受限 READ_PASTEBOARD；其他演示权限已配置。

最近完成默认 UI 样式对齐：Native Node Button/TextInput 不再依赖 ArkUI 可见默认样式，统一为跨端 16vp 字号、Button 12/6vp padding 与蓝色标题、TextInput 0 padding/无下划线；Host 测量和单元回归同步更新。`npm run test:harmony` 当前 41 项通过，`npm run build:harmony -- --config anseronui.config.json` 构建成功。设备脚本当前启动后未发现 `smoke-count`，首个断言超时，后续需先恢复正确的验收页面/构建产物再做真实外观截图。
