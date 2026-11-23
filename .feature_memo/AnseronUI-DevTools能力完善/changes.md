# 实施与验证

## 2026-11-22

- 实现独立 devtools 服务、CLI 搜索/分页/详情，以及 props/state/edit/shot。
- 接通 schema、临时 props/style 覆盖、Hook state 更新、CommitAck 后回读、错误回滚、卸载清理、过期和离线处理。
- 实现 Web/Swift/Android/Harmony 截图分块、面板预览和截图选点；元素页选宿主，组件页选最近组件。
- 完成 Release 源码隔离、缓存指纹、SDK 打包输入与文档。
- 修复截图异步结果缺少 BrowserHost.flush()、大截图 SSE backpressure、AOT value 误声明 number、组件渲染未使用覆盖 props、截图失败错误回执，以及 CLI 负数参数解析。

已通过：

- `npm run test:devtools`：9/9，包含真实 CLI 负数参数、过滤分页详情、设备回执、错误回滚和 70000 字符截图分块。
- `npm run build:core:wasm` + `npm run test:devtools:wasm`：真实 split AOT Wasm，宿主/组件 props、Hook state 和截图成功/失败回执。
- `npm run typecheck:framework`；`npm run test:framework`：107/107。
- `npm run test:build`：7/7；`npm run test:tooling`：31 通过、2 既有 skip。
- Web Reference：真实页面截图、截图点选 Text、面板编辑后业务页面和面板回读均更新。截图 `.verification/devtools-browser-verified.jpg`。
- macOS：真实 PNG 像素、节点/页面坐标及采样；Release Swift 目标文件无 capture 方法和模块字符串。
- iOS Debug app 编译；Android Debug/Release Kotlin 编译；Harmony Debug HAP 构建。
- 最终 Release native Core 静态库无检查器标记；Android Release 生成源码和 class 无截图代码；Vite production 测试无 devtools/client/panel/React 模块。
- `git diff --check` 通过。

最终收尾通过：`npm run build:harmony:release` 构建 unsigned HAP，生成 ArkTS/ABC/原生库均无检查器标记；`npm run test:package`：1/1，打包 SDK 创建独立应用通过。测试服务 5173/8091 和 18091 已停止。代码未提交或发布。

验收边界：未在 iOS/Android/Harmony 真机执行截图点选和编辑；不能把编译成功等同完整设备验证。Web canvas/跨域图/视频、复杂原生变换及系统合成层需专项核对。

## 2026-11-22 原生截图与点选验收

- iOS（iPhone 17 Pro / iOS 26.4 模拟器）、Android ARM64 模拟器 emulator-5556、HarmonyOS 模拟器 127.0.0.1:5555 均完成实际运行验证。
- 三端均通过 HTTP 命令修改 Text 背景，读取真实页面和节点 PNG，验证目标像素；实际浏览器面板点击截图，Elements 选中 Text，Components 定位 Counter/Components。证据：`.verification/devtools-native-{ios,android,harmony}/panel-picked.jpg`、`panel-component-picked.jpg`。
- 修复 Core 向截图宿主传递节点 rect 时未扣除祖先滚动偏移，解决 Harmony 滚动后节点截图裁剪位置错误；增加插桩回归断言。
- 新增专用 native fixture 与 `npm run test:devtools:native -- <platform>`。三端滚动 120 后目标 visualFrame 均为 [0,160,200,40]，页面 PNG 像素、节点裁剪坐标、采样、元素命中和 CaptureCard 所属组件全部通过。iOS PNG 使用 ColorSync 转 sRGB 检查。
- PNG：iOS 1179×2048 / 节点300×60；Android 1054×2048 / 节点262×52；Harmony 1037×2048 / 节点350×70。结果见各目录 result.json；日志 `.verification/devtools-<platform>-native-test.log`。
- DevTools 回归9/9；三端最终 Debug 应用构建成功。专用测试页采用 async/await，显式纵向布局，避免 AOT 动态 Promise.then 限制和默认横向布局干扰。
- 已恢复测试构建生成的 Harmony 仓库示例配置，保留独立测试配置。验证对象是模拟器，未声称物理真机验收。

收尾：`npm run typecheck:framework` 与 `git diff --check` 通过。8091 测试服务已停止。

## 2026-11-23 macOS 截图方向修正

- 用户现场发现 macOS PNG 上下翻转。原因：左上原点的 AppKit layer 直接 render 到左下原点的 CGContext，缺少 Y 变换。
- Renderer 截图在 render 前 translate(0,bitmapHeight) 并 scale(scale,-scale)，修正 PNG 像素；截图/点选的逻辑坐标保持左上原点。
- 回归改用上红下蓝、右上绿色的非对称图案。旧代码实际失败；修复后页面/节点 × sample1/2 全部通过。`npm run test:macos -- --devtools-regression` 通过，DevTools9/9与 diff check通过。
- 重建并重启 macOS 示例，DevTools获取 appearance 真实720×640 PNG已目视确认正向，文件 `.verification/devtools-macos-orientation-fixed.png`。8091服务及macOS App保持运行供用户验证。

## 2026-11-23 npm 独立项目验收

- 从当前源码 npm pack 生成真实 tarball（未发布），在 /private/tmp/anseronui-npm-devtools-check-20261123 仓库外 npm install，使用包内 CLI create App（不带 local-framework），App npm install/setup/check 完成。
- 使用该项目自己的 .anseronui/sdk 构建并运行 macOS Debug app，包内 npx anseronui devtools --port18091 提供独立调试服务，页面自动接入。页面业务仅增加普通 console/http/device 调用，不导入任何 DevTools。
- 使用该项目 npx --no-install anseronui inspect 验证 sessions、nodes/logs/network/native 的过滤检索及4类详情、props、负数组件ID state、真实原生 PNG；12节点/3日志/1网络/1原生均通过。面板 HTML 和打包 JS均200。证据 .verification/npm-devtools-e2e/result.json 与各命令JSON、npm-app.png。
- 新建工程增加 npm run devtools 和 README 用法，docs/diagnostics/devtools.md 增加 npm 项目说明；打包测试新增 CLI/服务/查询/命令/插桩/Android支持文件及runtime依赖、生成脚本和文档断言。
- 最终 test:package1/1，test:tooling31通过2既有skip，diff check通过。npm包安装、构建和运行验证未借用本地框架链接。
- 临时验证 App/18091已停止，原有用户使用的macOS示例/8091保持运行。未执行npm发布，当前版本号未变。
