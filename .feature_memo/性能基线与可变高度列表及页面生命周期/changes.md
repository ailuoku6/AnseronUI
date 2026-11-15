# Changes

## 2026-11-13

- 新增三部分基建及示例、回归、基准。
- 框架 70 个测试通过（修正泛型 lowering 断言后需复跑）；最新类型检查进行中。
- Reference 基准通过：120 个滚动样本，5 次销毁重建，挂载节点峰值 78。
- 真实 WebKit reference 列表回归通过：展开、跳转、头插、隐藏计时、resize。
- Android Kotlin 渲染器编译通过；iOS/macOS Swift 类型检查通过，含既有并发警告。
- native/Wasm 初版 AOT 构建成功；最新代码需要重建运行。

## 最终验证（2026-11-13）

- `npm run test:framework`：13文件73项通过；`npm run typecheck:framework`通过。
- `npm run test:tooling`：27通过、2平台条件跳过；`npm run test:build`：7通过；`npm run test:package`通过。
- Native/Wasm 原页面 Core 回归通过，Native/Wasm/iOS/Android 最新 AOT 构建通过。
- Android API35 `connectedDebugAndroidTest`：15项通过，含真实变高列表、隐藏计时、回收和既有HTTP路径。
- iOS26.4 `-only-testing:RenderViewTests`：19项通过，新增内存警告回收与原参数重建。iOS27启动被UIScene要求阻止，已记录边界。
- AppKit真实集成通过；WebKit Reference/Wasm完整列表通过；WebKit路由通过（可见性信号受控、真实DOM）。
- 三个串行基准及 Reference 同机相对比较通过，各120更新样本；节点峰值78、消息约123KiB、稳定缓存200。原始报告 `.verification/performance/`；跟踪快照 `docs/performance-baseline.md`。
- 最终 `git diff --check`通过。未提交，未运行远端CI。测试自启 HTTPfixture 和 ADB5174 转发已清理。

## Android 快速滑动复查（2026-11-13）

- 用户实际反馈：滑动快一点后长时间空白，随后才渲染列表。已在模拟器重现；之前程序跳转测试只检查控件存在，覆盖不足。
- 新共享回归证实：60个滚动位置被顺序回放，触发60次提交；改为在连续滚动段内按nodeId只保留最新位置，点击/输入等离散事件保持顺序边界。
- 新回归证实：原生事件在Core线程被提交版本超越后，最终scroll位置会被旧revision检查丢弃。对仍存活node的scroll/scrollEnd接受已提交的旧版本，其他事件保持既有校验。
- 共享框架76项和类型检查通过；Android AOT已重建，新增密集事件/真实手势/完整视口覆盖及裁剪测试验证中。
- 示例如遇深色模式，浅色行背景配系统浅色文字会不可读，已补显式明暗文字与背景配色。

### Android 复查完成

- 共享框架76项及类型检查通过；Android AOT重建通过；Reference节点/缓存/消息预算通过。
- Android RenderViewTest共12项通过；快速滚动测试校验整个视口覆盖、最终偏移没有倒退、500ms后仍填满，并包含真实惯性手势。
- 最终本机记录：60次密集偏移（最终24000布局单位）停止后约1061ms填满；真实手势停止后约1ms检查通过。属于本次模拟器功能测试观察值，不是设备帧率/分位数保证。
- 像素测试先复现预渲染行越过ScrollView覆盖外部控件；TouchScrollView.dispatchDraw显式按viewport裁剪后通过。
- 连续三次160ms快速滑动截图复核通过，文字与固定操作栏正常。应用已重新安装并打开到列表。
- 日志：`/tmp/anseron-android-fast-verified.log`；截图：`/tmp/anseron-list-fast-fixed.png`、`/tmp/anseron-list-fast-final.png`。未提交。

## 2026-11-13 猛烈甩动优化

本轮已实现原子锚点、预测/稳定窗口、Android事件与测量批量及提交去重复。共享80项通过、TS类型通过，Android功能14项已通过；连续fling性能门槛仍在迭代，前期单轮零空白但连续三轮暴露误判方向和父组件裁剪窗口，均已修复，正在最终复测。WebReference曾通过，最新重跑遇沙箱WebKit进程退出，待提权重跑。

- 最终补充：最终验证完成：共享80项、Android16项、TS类型、WebKit Reference通过；Android连续六次±20000甩动895帧无空白/反向跳动，前轮889帧也为0。合成Reference资源预算通过，扩大窗口后CPU耗时增加，未声称通过旧版相对时延门槛。APK已安装emulator-5554并打开virtual-list，实际快速往返手势后截图正常。详见docs/performance-baseline.md与.verification/performance/android-fling.json。

2026-11-14：按用户要求重新构建最新 iOS Simulator Core 和 Debug 应用（npm run build:ios 成功），安装到已启动的 iPhone 17 Pro / iOS 26.4（53172492-D6E5-42C4-8530-1C5BE594193D）。simctl launch org.anseronui.demo --page virtual-list 成功，截图 /tmp/anseron-ios-installed.png 确认可变高度列表已显示，供用户体验。本轮仅构建/安装与启动确认，未新增 iOS 猛烈甩动性能结论；Android 专属惯性保护/复用池不属于 iOS 实现。

2026-11-14：按用户要求 npm run build:macos 成功，最新 framework/business AOT 与AppKit宿主已重建；安装到 /Users/ailuoku6/Applications/AnseronUI.app，codesign --verify --deep --strict通过。已启动应用，通过Navigate菜单打开virtual-list，实际向下滚动3屏，AX与截图确认列表内容正常，窗口保留供用户体验。本次为安装和基本交互检查，不新增macOS猛烈甩动性能承诺。
