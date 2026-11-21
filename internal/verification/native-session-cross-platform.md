# 会话内存修复跨平台验证

2026-11-21。延续 [修复与 Android 内存压力验证](native-session-string-fix.md)，本轮将验证扩展到 Android、iOS、macOS、HarmonyOS 和 Web/Wasm。构建使用当前工作区的本地源码补丁；未发布 npm 版本。

## 内存专项覆盖

使用 `scr_async_embed.test.c` 中的真实运行时白盒断言，针对各目标编译并在目标运行：重复 session、每 session 1000 次已处理拒绝、未处理记录保留、释放 payload 时追加 64 条拒绝并 realloc、清理重入和关闭保护。另加先构建 60,000 字节输出、再构建 1000 次短字符串的容量断言。断言均启用，执行退出码均为 0。

| 目标 | 执行环境 | 结果 |
| --- | --- | --- |
| Android ARM64 | Android 15/API 35，emulator-5554 | 原生程序通过；上一轮完整 Native 堆验证静置无累积、20 次往返增量 1514 B、退出框架分配为 0 |
| iOS ARM64 | iPhone 17 Pro，iOS 26.4 模拟器 | 原生程序通过，含延迟 handler 和事件预算中断 |
| macOS ARM64 | macOS 宿主 | 上一轮普通/audit ASan+UBSan 测试通过，含多线程会话销毁；本轮真实 AppKit 集成回归通过 |
| HarmonyOS ARM64 | Mate 70 Pro 模拟器，API 21，HDC 127.0.0.1:5557 | 原生程序通过，使用 OHOS API 21 编译和运行 |
| wasm32-wasi | Node WASI，真实 32 位 Wasm 模块 | 拒绝记录、重复 session、释放回调和字符串容量断言通过 |

Wasm 专项的 C 程序不生成编译器 coroutine，因此跳过 native stackful fiber 的 delayed-handler 子测试；coroutine resume/destroy 为不可达 trap 桩。另用实际编译器生成的双 Wasm Core 回归补充 await、计时器、模块和销毁路径，并在 WebKit 中执行真实 Wasm→浏览器计时器→Wasm 回归；两者均通过。不能把 WASI C 程序单独视为完整协程覆盖。

Android 原生专项使用 Homebrew LLVM 编译 C 对象，再用 NDK 25 链接，以保持当前 LLVM 能识别的 ARM 内建函数与 Android libc/运行库匹配。iOS 使用 Xcode arm64 Simulator 工具链；Harmony 使用 API 21 runtime 对象与 SDK clang；Wasm 使用 Zig wasm32-wasi。临时工具链尝试的失败日志不作为产品构建失败结论，最终执行记录见 contract-test 日志。

## 宿主与功能回归

- Native AOT Core 五组通过：counter、async-form、components、extensions、timers，覆盖握手、布局、事件、ACK、模块调用和销毁。
- iOS 最终完整运行 13 项 UI 测试和 22 项宿主单元测试，共 35 项、0 失败。UI 覆盖控件、动画、悬浮球拖动、滚动、边缘返回、路由参数与保留状态、原生组件/ref、HTTP/计时器和服务；宿主覆盖异常恢复、请求取消、销毁、内存压力重挂载和动画取消。最终结果为 `ios-verified-tests.xcresult`，不是之前用于诊断的失败记录。
- Wasm AOT Core 同样五组通过；WebKit split timer 回归通过。
- macOS 真实 AOT Core 与 AppKit 集成通过：控件、路由、resize、异步/计时器、原生模块/组件/ref、滚动、可变高度列表、保留/恢复、媒体可见性、动画和销毁。
- Harmony 宿主/工具测试最终 54 项通过；Harmony 模拟器 App 验收通过 14 项，含原生输入、异步服务、路由保留、订阅、deep link、拖动/滚动交接、视频生命周期和组件 ref。真实 HAP 构建成功并使用 SDK 调试证书安装到模拟器；未对真机使用测试证书。
- Harmony 提醒调度返回系统错误 1700002（agent-reminder entitlement/quota），验收脚本明确列入 blocked，不能计为通过。
- 框架测试 102 项通过；工具测试 31 项通过、2 项按既有条件跳过。
- 示例修正后再次重建 Native/Wasm Business Core，五组回归分别全部通过。框架类型检查和 npm 打包测试通过；`git diff --check` 与 async/JSON patch 反向应用检查通过。
- 最终 Counter 源码还重跑了 macOS 集成与 WebKit split Wasm，两者通过。iOS 最终 xcodebuild 为 `TEST SUCCEEDED`。临时 UIKit 测量日志已移除，测试 fixture 已停止；Harmony 示例构建临时生成的三个受跟踪配置文件已恢复到测试前内容，产物与设备验收证据另存于验证目录。

## 验证中修正的阻碍

1. iOS UI 测试仍使用旧 `--components`/`--extensions` 参数，默认首屏也已从 counter 变为 appearance。测试统一使用现有 `--page` 参数并明确指定测试起始页，避免测试了错误页面。
2. 原生组件卸载通过 Core 异步提交。测试改为等待元素消失，再检查 ref 失效；保留原功能断言，重跑通过。
3. Counter 示例漏写 `flexDirection: "column"`，布局引擎的默认横向布局将文本压缩为 8～9 点。补上明确的纵向布局；未更改框架默认布局语义。
4. HTTP fixture 的 localhost 只监听 IPv6，iOS App 使用 127.0.0.1。改以 `--host 127.0.0.1 --port 5174 --strictPort` 启动；实际 curl 返回 `loaded from HTTP`。
5. Harmony 增量构建保留开发者的旧权限声明，却只为本次配置权限生成说明资源，导致资源打包失败。构建现在覆盖保留声明的说明，合并仍被引用的已有资源，新增重复生成与移除资源的回归测试。修复后真实 HAP 构建、安装和运行成功。

## 证据与边界

详细构建、专项执行、iOS xcresult、macOS 和 WebKit 日志保存于 `.verification/session-cross-platform/`。该目录的 `runtime-contract.mjs`、`harmony-contract.mjs`、`contract.c` 和 `run-wasi.mjs` 保存跨目标复现方式。各平台使用源码重新构建，不能以旧缓存的历史结果替代本轮记录。

机器可读结果为 `results.json`，关键源码哈希为 `source-sha256.json`。最终 UI 测试修改和 Counter 示例修改均保留在工作区；Harmony 权限资源生成器及其测试也保留，避免下次增量构建再次缺少资源。

内存专项支持已定位的已处理 Promise 引用保留及短字符串大容量问题在上述目标得到修复。除 Android 的完整 malloc_debug 压力采样外，其余目标主要使用所有权断言和生命周期/功能回归，没有逐端完成同等规模的全堆分配审计。未验证实体 iPhone、Harmony 真机、华为 Android 真机、Windows/Linux 宿主、各浏览器组合或无限时长负载，未执行全量 scriptc Sandbox 发布门禁。
