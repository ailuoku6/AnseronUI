# 会话内 Promise 拒绝记录与字符串容量修复验证

2026-11-21。前置持有者证据见 [会话内字符串增长定位](native-session-string-retention.md)。本次修改框架源码，并同步到 `/Users/ailuoku6/web_project/anseronui012MemoryTest/.anseronui/sdk`，从源码重建 Framework Core、Business Core 和 Android App。测试应用仍锁定 npm 0.1.2，但其自有 SDK 已应用本地补丁，不能称为未经修改的发布版。

## 实现

- `scr_async.c`：embedding 的 ready jobs 排空后释放 `rejection_observed` 的跟踪引用，保留未观察的 rejection。释放回调产生的新记录按原顺序留到后续 checkpoint；读取当前数组以适应回调导致的 realloc。重入清理被阻止，清理期间的 close 返回未完成，避免释放正在遍历的数组。
- `scr_json.c`：JSON builder 完成时，若容量大于 1024 字节且长度小于容量的四分之一，将结果收缩到实际长度。普通余量和下一次构建的容量 hint 保留；不修改字符串内容。
- 同步 `internal/toolchain/async-embedding.patch`，已检查涉及 async/JSON 的补丁能对当前源码反向应用。

这次没有关闭 DevTools，也没有依靠增加 GC 频率来掩盖问题。真正未观察的拒绝仍遵循现有 embedding 行为，宿主的 unhandled-error 策略不在此次修改范围内。

## 回归测试

新增 `scr_async_embed.test.c` 和 Vitest 驱动，直接编译真实 runtime，覆盖每 session 1000 次已处理拒绝、3 次 session、延迟 handler、0/1 事件预算、保留未处理项及次序、释放 payload 时追加 64 条拒绝并触发数组 realloc、嵌套 step 与 close。非 audit 和 RC audit 构建均通过 ASan/UBSan，并分别运行 cycle threshold 1 和 256。

扩展 `scr_json.test.c`：先构建 60,000 字节大输出，再构建 100 次短输出，检查内容、结尾 NUL 和实际容量；同时继续运行现有 UTF-8/孤立代理项等 JSON 边界测试。非 audit 和 audit 构建均通过。

修复前，Promise 两个配置均在 `scr_nunhandled == 0` 断言失败；JSON audit 配置在短输出容量断言失败。修复后的 async、JSON、library cleanup、cycle 四个测试文件共 7 项通过；最终扩展后的 async 测试又单独重跑，两项通过。已有多线程 session 清理测试继续通过。

- `npm run test:build`：7 项通过。
- scriptc `pnpm lint`、`pnpm format:check` 通过。
- App `npm run check`、`npm run typecheck` 和 Android 源码构建通过。
- 本轮没有执行全量 scriptc Sandbox 发布门禁，没有发布 npm 包。

## 模拟器方法与统计口径

emulator-5554，Android 15 / API 35 / ARM64。临时 malloc_debug `backtrace=32`；只在诊断 JNI 关闭 heap tagging 以兼容采栈，不加入持有者探针、不加入外部清理调用。预热后首页静置 60 秒，每 20 秒采样；随后 20 次通过 UI 标签确认的详情页打开/返回，每 5 次采样，最后静置并退出根 Activity。

修复增加了 realloc 收缩，因此字符串统计合并首个框架符号为 `scr_str_alloc_raw` 和 `scr_str_regrow` 的存活分配，不能只看前者下降。另统计所有包含 libanseronui.so 帧的存活分配来检查退出清理。数值是 malloc 请求字节数，不是 RSS/PSS，也不是所有字符串 API 的总和。

旧发布版的原始堆使用匹配的旧 ELF 重新按相同口径分析：预热 10,294,828 B / 366 块；20 次往返 17,582,157 B / 503 块；增加 7,287,329 B（6.95 MiB）；根 session 退出为 0。两轮调度和预热时长不同，不能把绝对初始差额全部归到单一优化。

修复后诊断 ELF 的可执行 LOAD offset 为 0x1639c0、vaddr 为 0x1649c0，映射文件页 offset 为 0x163000，符号化加 0x1000。完整原始堆、匹配 ELF、分析脚本和测试日志保存到应用 `verification/native-leak/fixed/`。

## 模拟器结果

诊断进程 PID 21563，20 次路由往返全部通过 UI 标签确认，无进程崩溃。单位为字节，块数仅针对上述 JSON 构建字符串分配口径。

| 阶段 | 构建字符串活跃字节 | 块数 | 任意 libanseronui.so 栈活跃字节 |
| --- | ---: | ---: | ---: |
| 预热 | 46,899 | 329 | 1,581,253 |
| 静置 20 秒 | 44,224 | 328 | 1,576,834 |
| 静置 40 秒 | 44,224 | 328 | 1,593,218 |
| 静置 60 秒 | 44,224 | 328 | 1,593,218 |
| 往返 5 次 | 44,388 | 334 | 1,708,014 |
| 往返 10 次 | 44,838 | 339 | 1,724,317 |
| 往返 15 次 | 45,288 | 344 | 1,738,932 |
| 往返 20 次 | 45,738 | 349 | 1,733,355 |
| 再静置 20 秒 | 45,738 | 349 | 1,733,355 |
| 根页面退出、session 销毁 | 0 | 0 | 0 |

静置三次的构建字符串存活量完全相同；20 次往返相对静置基线增加 1,514 B，往返后再静置保持不变。5→10→15→20 每 5 次增加 450 B，与保留短路由调试历史一致；本轮没有删除调试历史，源码仍限制每 surface 200 条。相对于最初预热值，20 次往返后的数值更低，但不拿尚有瞬态对象的预热值夸大改善。

所有框架栈活跃分配在路由过程中仍有缓存和对象数量波动，本轮没有逐个解释约 140 KB 的净差额。退出后全部归零。证据支持已定位的已处理 rejection 无界保留和大容量短字符串问题在本 workload 中已修复，不证明任意业务、无限运行时间或所有平台均无泄漏。

## 验证边界

后续已扩展到 iOS、macOS、HarmonyOS、Web/Wasm，见 [跨平台验证记录](native-session-cross-platform.md)。以下保留首次 Android 修复验证时的边界。

实际运行了 Android 模拟器 Debug 包以及 macOS 上的 runtime C 测试。没有重新部署华为真机，未实测 iOS/Harmony/Web 或 Release App。共享源码修复会随各目标重新构建进入产物，但不能以此代替各端实测。

## 普通包恢复

已移除 malloc_debug wrap 和 legacy packaging 诊断配置，恢复普通的修复后 Native 库并重新打包安装。普通 ELF SHA-256 为 `f844f45fc06472c2f42066949ad6c6ac3e4b5d9bac9cadac16f26a1f17d617b2`。APK 检查不含 wrap.sh、诊断 mallopt 引用或持有者探针标签。普通包 3 次详情页往返保持 PID 22959；系统返回根页面后进程仍为 22959，重新打开首页成功。普通包不包含关闭 heap tagging 的诊断 JNI。

本地测试 App 保留 SDK 源码修复以便继续验证；依赖版本号仍为 0.1.2，重新安装或刷新 SDK 时应改用未来包含修复的正式版本。原 npm 包未被修改或发布。
