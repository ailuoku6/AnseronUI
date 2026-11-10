# 变更记录

## 2026-11-09

- 阅读现有架构、构建、插件、SDK 打包、C transport 与 scriptc target/driver 源码。
- 检索 Apple Catalyst 和华为 ArkUI Native Node/NodeContent/ContentSlot 官方文档，方案列出来源和证据边界。
- 新增完整技术方案，并在文档目录加入草案入口；创建本需求功能记忆。
- 验证：文档相对链接和代码围栏检查、`git diff --check`；未执行平台构建或运行测试，未安装 SDK。
- 已知未验证项：Catalyst/OHOS runtime、目标 SDK API 覆盖、鸿蒙布局/返回与签名安装。
- 下一步：按用户后续指示进入 P0，先锁定工具链/设备版本并记录实际结果。

## 2026-11-09：AppKit 方案修订

- 根据用户不用 Catalyst 的方向，重写 macOS 技术选择、宿主实现、组件映射、编译链、插件要求与验收。
- 核对已有 macOS target 及宿主版本检查；检索 Apple AppKit、isFlipped、NSScrollView 官方资料。
- 更新全部当前功能记忆；初版 Catalyst 决策保留为明确标注已替代的历史。
- 验证：文档相对链接、围栏、空白、旧目标残留检查与 git diff --check；无平台编译或运行测试。
- 当前风险：AppKit Renderer 尚未实现；鸿蒙 target/runtime 和设备运行尚未验证。

## 2026-11-09：macOS AppKit 首期实现

- 按用户要求先实现 macOS，采用 Swift + AppKit，不使用 Catalyst。
- 新增 `packages/render-macos`、原生 Core `macos-arm64` 构建、`.app` 构建/校验/运行 CLI、独立应用模板和 schema 2 AppKit 插件接口。
- 真实 AOT/Core + AppKit 集成覆盖计数器、表单、路由、缩放、Promise/定时器取消、Module、原生组件/ref、滚动和销毁；独立应用、AppKit 插件应用构建成功；桌面按钮点击已确认 Core 状态变化。
- Swift/AppKit arm64 类型检查和构建通过；框架 40 项、tooling 18 项及 build、layout、package 验证通过；`git diff --check` 通过。
- 已知边界：构建机 macOS 15+，产物声明 macOS 14，实测 macOS 27.2 Apple Silicon；未测 macOS 14/Intel。RichText 点击、IME、媒体播放、鼠标拖动、动画、无障碍需专项验证。鸿蒙未实现。
- 更新 README、接入/插件文档和功能记忆，反映实际能力与限制。
- 收尾复验：`npm run test:macos`、`npm run test:tooling`（18 项）、`npm run test:package`（真实 npm tarball 创建独立工程）通过；`integrate` 生成的接入清单补上 AppKit。构建类命令串行执行，避免共享 staging 竞争。

## 2026-11-09：macOS 缺陷修复与专项回归

- 用户要求继续修复问题，保留 AppKit 路线。
- 文本：新增 Text.swift，测量/绘制/点击共用 TextKit 布局，修复混合字号与换行裁剪、emoji 后 span 命中和省略号误触。
- 图片：新增 MediaViews.swift，修复 cover 按 contain 显示；远程 placeholder 异步加载，主图失败保留占位图，销毁取消请求。
- 输入：组合输入期间不提交、不回写旧状态；保留 maxLength 和 inputRevision 保护；只读可选择复制，应用 placeholder 颜色和 autocorrect；切换其他输入的 secure 模式不抢焦点。
- 鼠标：修复 AppKit hitTest 父坐标约定和初始命中目标局部坐标；窗口失焦和目标删除时取消拖动。
- 动画：从 CALayer-only 变换改为 NSView 坐标变换，视觉位置与命中同步；覆盖平移、负缩放、旋转、还原、取消和卸载。
- 视频：无效源通过错误事件报告，不销毁整页；相同播放属性的重渲染不覆盖原生播放/暂停；首帧只发一次，ended 不被迟到 paused 覆盖，loop 等 seek 完成再播放。
- 验证：系统服务可用环境下完整 AOT/AppKit 回归通过；18 项 tooling、npm tarball 打包测试通过；真实桌面 RichText 点击显示 rich span 3，悬浮球连续拖动两次通过；.app 重建成功。
- 环境限制：受限沙箱阻止系统视频解码，AVFoundation 报 -11821/-12911；允许系统服务后真实本地视频解码、首帧、时间、结束事件均通过。真实输入法候选 UI、完整无障碍、滚动仲裁及旧系统仍需验收。

## 2026-11-09：用户反馈视频暂停/秒数与触摸滚动

- 修复 macOS 秒/毫秒不一致，playTimeDidChanged 的 x/duration 按毫秒上报，组件页秒数可正常递增。
- 定位暂停漏点：Core 每次渲染保留节点都发 MoveChild，原实现移出/插回同位置视图，打断 NSButton 鼠标跟踪。对父节点和索引未变的节点保持挂载；点击/长按识别器仅按绑定事件安装。
- 视频结束后重置主动报告 paused，避免零速播放器没有 KVO 变化而滞留 ended 状态。
- 实现鼠标拖动与 ScrollView 交接：5 point 阈值、方向锁定、touchAction 祖先交集、按下快照、单次 touchCancel、滚动边界/禁用状态及 scrollEnd；横拖和 none 继续业务事件，不接管原生按钮/输入/视频交互。
- 新增实际 AOT 组件页播放/暂停/继续/重置测试和毫秒断言，补充原地 MoveChild 不卸载、真实重排、滚动交接/策略/销毁回归。测试 runner 复制组件媒体资源供 asset:// 使用。
- 桌面实测：默认 pan-y 纵拖 offset 528→593，收到 touchCancel；横拖事件计数增加而 offset 保持，none 纵拖也不滚动，stopPropagation 不影响宿主交接。
- 桌面实测暂停根因修复：播放后在暂停按钮按住 1.8 秒，跨多次进度提交，松开正常暂停；页面 paused / 2s，画面停在约 2.33s。旧实现同一操作会漏点。
- 重建时发现共享服务泛型局部闭包不支持 AOT 捕获，改内部实现为非泛型并保留公开 Services 类型；Core 编译与框架 40 项测试通过。macOS 全回归、.app 打包、框架类型检查及 diff 检查通过。
- StandardServices 属于同工作区同步进行的其他能力实现，构建仍有其 Swift 并发告警；不扩展本次修复范围。
