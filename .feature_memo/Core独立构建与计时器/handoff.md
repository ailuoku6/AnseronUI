# 交接

从 index.md 进入。代码已实施独立 Core/业务 SDK 构建与 setTimeout。
内核 kernel.ts 纯数据布局/测量/diff，business-runtime.ts 保留组件/Hooks/闭包/生命周期。C split_bridge.c 顺序搬运字符串，原生两库 localize_runtime；WasmRuntime 加载 core.wasm（业务）+ framework.wasm。内部 CORE_ABI_VERSION=1。
计时器 ui/src/timers.ts，staging scripts/lower-timers.mjs 处理无局部遮蔽的全局 setTimeout/clearTimeout。useTimers 可绑定页面供 await 后使用，多个 surface 的无作用域全局调用拒绝。
已通过 40 单测、4 构建测试、1 CLI 测试、两端五个真实 AOT 页面及线程生命周期。当前实现及 iOS/Android 构建已完成。`.verification/split-cache-result.json` 记录真实业务 TSX 改变后 native/Wasm Framework Core hash + mtime 未变。无需继续实现。WebKit 双 Wasm DOM/真实 timer 集成也已通过：测试视图必须附着 NSWindow，隐藏 WKWebView 暂停布局/计时器曾造成超时，已修复运行器。`npm run test:browser:split` 可复验。
不要改运行中的构建输入；构建器会拒绝中途源码变化。构建按 target 独立 staging，但同 target/多应用应串行。
