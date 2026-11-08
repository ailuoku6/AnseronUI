# 实施记录

## 2026-11-08
- 提取 `kernel.ts`、`contracts.ts`、`business-runtime.ts`，原 ReferenceRuntime 为本地参考组合。
- 独立 profile + 原生 localize_runtime；C 组合 facade 保留外部 ABI；Web 两份 Wasm/memory。
- 构建分别计算指纹/产物 SHA-256，分目标 staging 清理旧副本，增加 framework-only/business-only。
- setTimeout/clearTimeout/useTimers 经宿主 timer.sleep/CancelRequest 实现；staging 尊重作用域重写全局计时器。
- 新增 timers 示例页和自动化验证。
- 已通过：40 框架测试、4 构建测试、1 CLI 测试、native/Wasm 五个 AOT 页面、4 线程 200 次生命周期循环、Web 生产构建。
- 已完成：业务样式变更后 native + Wasm Framework Core SHA-256 与 mtime 均未变化（见 `.verification/split-cache-result.json`）；iOS 模拟器与 Android arm64-v8a 构建成功。Gradle 获准访问用户缓存后成功。尝试 WebKit UI 测试时，锁定桌面无法建立 LaunchServices 沙箱扩展，30 秒超时；native/Wasm AOT timer 页面已通过。

- 最终浏览器验证已通过：请求系统图形服务权限并让 WKWebView 附着测试窗口，避免隐藏页面暂停布局/定时器。`npm run test:browser:split` 覆盖双 Wasm、DOM、1 秒真实等待、取消、await 后调度和退出清理。先前 WebKit timeout 是隐藏视图/图形服务前置条件，修正测试运行器后消除。
- 最终复核：4 目标 manifest 与当前分离指纹相符；framework-only/business-only 均复用缓存；40 项框架、4 项构建、1 项工具测试通过；16 公开文档 128 本地链接/锚点通过。
