# 变更

## 2026-11-14

- 已审计架构、protocol 1.5、transport/facade、scriptc target/driver/fiber、构建与插件。
- 查询华为/OpenHarmony 一手资料，正文记录 21 组来源。
- 新增 18 节设计，含 P0–P4、H00–H08、测试矩阵、性能和风险边界。
- 仅文档/memo，无运行时代码修改。
- 验证通过：18 个一级编号章节、21 组引用均有来源、代码围栏成对、文档及索引本地链接无失效、8 个 memo 文件完整；相关 tracked 文档 git diff --check 通过，新文无行尾空白。
- 当时无鸿蒙编译、签名或设备测试；本次 API 21 验证已补充，HAP/签名仍未执行。
- 下一步 P0 HAP/ArkUI。

## 2026-11-14（API 21 验证）

- 锁定 DevEco Studio 6.0.1.251、Native SDK 6.0.1.112/API 21、Mate 70 Pro `aarch64` 模拟器。
- 新增 `scripts/verify-harmony-build.mjs` 和 `internal/toolchain/harmony-api21.patch`；验证 lane 可编译 runtime、Framework、Business 为 `aarch64-linux-ohos` ELF 静态库。
- 通过 SDK ABI、scriptc runtime、Core transport；五组 Core 协议回放在设备退出码 0，输出与本机 oracle 逐字节相同。HAP/ArkUI Renderer 仍未实现。
- 最终统一入口从源码完整重建通过：`node scripts/verify-harmony-runtime.mjs`；增加两条栈式 fiber、4,000 次 await、4,002 检查点的 x19/d8 和 mmap 栈验证。五组协议合计 2,146 个输入步骤和 1,970 个输出 Envelope。
- 确认既有故障回收限制：非法 JSON 触发 panic 后 sink 能接住错误，但 poisoned context 的 close 被 enter 拒绝，同线程无法重新 open。单独记录 KNOWN_LIMITATION_CONFIRMED，未修改生产 transport。
- 原始日志/命令/产物/版本/指纹在 `.verification/harmony-api21/`；可入仓结果快照为 `internal/verification/harmony-api21-results.json`。一键脚本检查 API 21 和 AArch64，不承诺其他设备/版本。临时 TCP 转发已清理。

- 2026-11-14 实施：增加 harmony-library/harmony-app、build-core/build-app/CLI、Stage 模板与 packages/render-harmony。HAP 用 SDK debug profile 成功签名安装到 127.0.0.1:5557；原生 Button 点击使 Count: 0 → Count: 1。18 项既有 CLI/插件测试通过。API21 measure 返回 px，需换成 vp；Counter 缺少 flexDirection 时 Core 默认 row，并非 Renderer 自动交换坐标。剩余工作尚未宣称全部完成。

## 2026-11-14（标准服务与 API 21 验收）

- 新增 ArkTS HarmonyServices：Harmony Asset 加密安全存储、系统照片/文档选择器、临时文件引用/release、systemShare、振动反馈、位置单次/订阅、流式下载/上传及进度/取消。
- Native Node 接入 API 21 ArkUI long-press gesture；CLI JSON5 读取使用 TypeScript parser；HAP 清单权限合并保留既有字段并生成权限 reason 资源；独立应用 README 加 Harmony 命令与工具链提示。
- 遇到模拟器拒绝自动授予 READ_PASTEBOARD；基础清单移除此权限，仅在应用显式配置时添加。默认 INTERNET/GET_NETWORK_INFO 生成合规 reason/usedScene。安全 Asset API 不支持 DATA_LABEL_CRITICAL_1 tag，改以应用标识+命名空间编码 alias，并在读取 keys/clear 时按 alias 前缀过滤。
- API 21 HAP 最终构建、debug 签名、安装、启动成功；Mate 70 Pro 模拟器 5/5 smoke 通过，包含普通 preferences、安全存储 set/get/remove、device、按钮、TextInput、router 参数及页面状态保留。结果 `.verification/harmony/acceptance/results.json`，截图 `screen.jpeg`。
- `npm run test:tooling` 28 pass / 2 skip；`npm run test:build` 7 pass；`npm run typecheck:framework` 和 `git diff --check` 通过。
- 系统选择器、分享、位置、传输、触感完成 API 21 编译但尚未逐项运行；通知、后台、BLE、NFC 未实现；真机与商店签名未验收。

## 2026-11-14（多页测试 app 与平台差异）

- 主配置 `anseronui.config.json` 增加 Harmony-only 初始页 `components`；安装包复用其他原生端的七个业务页，避免单独的两页 smoke app 冒充功能 showcase。
- Harmony Host 新增水平页签，切换时替换根页面并销毁旧 Core；构建器打包 `examples/components/assets` 到 HAP rawfile，Native Image/ArkUI Video 将 `asset://` 映射到 `resource://RAWFILE/assets/`。
- DevEco API 21 HAP build/install/start 成功；模拟器布局截图确认组件实验室、RichText、touch/long press 区、可拖浮球和示例图渲染。原生页签从 components 切换到 counter，Core 页面显示 `Count: 0` 和参数页，已验证切页。
- `npm run test:tooling` 28 pass / 2 skip、`npm run test:build` 7 pass、`npm run typecheck:framework`、`git diff --check` 通过。
- 确认仍未对齐：notifications、background tasks、BLE、NFC、permissions.notifications、linking.subscribe；嵌套滚动手势仲裁不完整。系统 UI/硬件服务虽编译但未实机逐项验收。

## 2026-11-14 — 鸿蒙能力对齐续做

- 完成通知/后台收件箱、WorkScheduler、BLE/GATT/NDEF、Linking和订阅所有权、可见性/容量回收。
- 修复启动无Want白屏、MoveChild失焦、漏绑定ScrollView仲裁、累计列表锚点、属性移除/主题色。
- AVPlayer实际首帧/ms进度、隐藏暂停恢复、原始资源fd与异步控制竞态回归。
- 修复自定义NAPI ref Promise、插件事件数据/卸载回调安全、HTTP超限/不可序列化结果、传输/picker取消及临时文件清理。
- 加入原生worker step/uiQueue统计、Host测量/提交/UTF8计数；README/能力矩阵/服务/生命周期/性能文档同步。
- 已通过：Harmony40，framework80，tooling30+2skip，build7，npm package1；API21 HAP编译及模拟器14组（最终复跑日志parity-device）。
- 1700002代理提醒资格/额度阻塞单列；真机/外设/签名/真实后台与系统交互仍待验收。autoCapitalize/autoCorrect没有Native Node映射。

2026-11-14 主示例安装发现 READ_PASTEBOARD 被测试签名拒绝（9568289），默认配置已移除该受限权限；不修改SDK测试profile绕过授权，正式剪贴板读取需应用合法授权。其他demo权限按功能声明。

最终主配置七页 HAP 已构建、安装、启动；scripts/test-harmony-demo.mjs 额外验证原生扩展、5000项列表跳到4000（挂载7行）、头插仍在深处窗口，报告 acceptance/main-results.json。默认示例不声明受限 READ_PASTEBOARD；其他演示权限已配置。

## 2026-11-14 — 默认 UI 样式对齐

- `bridge.cpp` 明确覆盖 ArkUI Button/TextInput 的默认外观，避免 capsule、系统下划线、隐式背景/边框/内边距重新出现；完整 SetProps 和主题切换后仍恢复同一基线。
- Button 默认字号 16vp、透明背景、普通矩形、12/6vp 内边距、`#007aff` 标题色；禁用按钮使用 `#8e8e93`，显式颜色按其他端的 40% alpha 规则处理。
- Text/TextInput/RichText 默认字号统一为 16vp；TextInput 默认透明、0 padding、无下划线，placeholder 使用浅色/深色灰色基线。
- `HarmonyHost` 测量默认字号从 14 调整为 16，并保留 Button 24/12vp 测量增量和 TextInput 120×32vp 最小尺寸。
- 新增 Host 测量回归；`npm run test:harmony` 41 项通过，API 21 HAP 构建通过。设备烟测因当前目标页未出现 `smoke-count` 在首个断言超时，不能作为本次样式验证结论。
