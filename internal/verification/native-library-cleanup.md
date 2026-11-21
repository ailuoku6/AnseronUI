# scriptc library session Native 清理修复验证

2026-11-21，测试应用 `/Users/ailuoku6/web_project/myanseronApp`；框架 `/Users/ailuoku6/web_project/TSNative`。本记录区分已经修复的线程退出泄漏与仍待定位的会话内增长。

## 结论

当前内置 scriptc 0.4.8 runtime 的 library session 销毁路径遗漏了线程局部缓存的物理释放。AnseronUI 每个页面使用独立 Core/HandlerThread，退页会结束线程；TLS 指针随线程消失，但其 malloc 块不会自动释放，因此产生跨页面累积。故障定位在 runtime 的嵌入式库生命周期，不是悬浮按钮事件本身。未检查 scriptc 上游最新版本，不能推断上游当前状态。

最终修复包完成 20 次通过 UI 标签确认的详情页进出。根 Activity 退出、进程仍存活后，完整 malloc_debug 堆转储中，含 libanseronui.so 分配栈帧的存活分配从修复前的 **3,332,802 B / 16,706 块**变为 **0 B / 0 块**。这支持本次 workload 的线程退出泄漏已修复，不证明所有功能、平台或所有运行期间内存行为均无问题。

## 源码改动

- `scr_library.c:scr_library_reset`：在业务全局释放和注册 teardown 之后，清理转换缓存、完整回收循环对象、排空 JSON freelist、释放字符串 spare、释放 collector TLS 缓冲，最后释放结果 arena 的 backing table。每次结果读取后的 arena reset 保持原有语义；完整清理只在 session reset/shutdown 执行。
- `scr_json.c:scr_dyn_pool_clear`：释放 arr/obj/misc freelist 中已逻辑释放的节点及保留的 items/slots/entries。这些缓存被 RC 审计模式禁用，因此仅看审计对象数无法检测其普通构建泄漏。
- `scr_json.c:scr_dyn_conversion_clear`：释放 matching/built/viewed 访问表、转换日志、typed→dyn 递归检查栈并重置状态。第一次修复后的分配栈还暴露了这些遗漏，最终版本一起处理。
- `scr_string.c:scr_str_spare_clear`：释放单槽字符串复用缓存。
- 调用现有 `scr_cyc_context_cleanup`：释放 roots/cands/pending 等 collector 向量和 kinds/sites 表；以前 library shutdown 只 collect，没有执行此清理。
- 修改已同步到 `internal/toolchain/async-embedding.patch` 和测试项目 `.anseronui/sdk`，使 Core 构建指纹失效并从源码重编译 Framework、Business 两份运行时。

## 模拟器方法

Medium_Phone_API_35，Android 15/API 35，ARM64，emulator-5554，包名 com.example.myapp。使用 malloc_debug `backtrace=32` 和 `am dumpheap -n` 的完整存活分配记录，不依赖 RSS/PSS 判断泄漏。各阶段均已返回首页；结束后通过系统返回退出根 Activity，再采集存活进程的堆。

诊断包临时使用 legacy JNI packaging 和 `src/debug/resources/lib/arm64-v8a/wrap.sh`。仅诊断 JNI 在打开 Core 前关闭 heap tagging，以避开 wrap 分配器与 tagged pointer 在关闭过程中的冲突。最终已移除诊断设置，普通源码和安装包不保留关闭 tagging 或强制每步完整 collect 的实验。

符号化使用本轮匹配的 ELF；可执行 LOAD 的 file offset 为 0x1622c0、virtual address 为 0x1632c0，maps 中对应页偏移为 0x162000，PC 换算需加 0x1000。不同构建不可盲用此偏移。

## 分配栈对照

以下按第一个 libanseronui.so 符号聚合；bytes 为分配请求大小乘记录数量，非 malloc 元数据占用。

| 分配入口 | 修复前 20 轮 | 修复前根页面退出 | 最终修复 20 轮 | 最终根页面退出 |
| --- | ---: | ---: | ---: | ---: |
| scr_cyc_grow | 839,168 B / 357 | 839,168 B / 357 | 146,944 B / 17 | 0 B / 0 |
| scr_cyc_kind_grow | 258,048 B / 42 | 258,048 B / 42 | 12,288 B / 2 | 0 B / 0 |
| scr_dyn_alloc | 1,114,624 B / 8,708 | 1,114,496 B / 8,707 | 267,264 B / 2,088 | 0 B / 0 |

最终轮次中，scr_dyn_visit_put 一直为 3,072 B / 2 块；scr_dyn_visit_view 为 768 B / 1 块；scr_dyn_from_enter 为 64 B / 1 块。根页面退出后全部为 0。仍然打开的首页允许持有自身的运行时缓存，所以 20 轮时非零不等于泄漏。

全进程 native 存活分配（包括系统库）如下，不能把它当作 AnseronUI 独占内存：

| 阶段 | 修复前 | 最终修复 |
| --- | ---: | ---: |
| 首页 | 28,698,674 B | 29,047,046 B |
| 5 轮 | 32,413,081 B | 31,659,489 B |
| 10 轮 | 34,366,577 B | 33,778,284 B |
| 15 轮 | 37,779,897 B | 35,849,958 B |
| 20 轮 | 39,227,221 B | 37,733,652 B |
| 根页面退出 | 14,391,931 B | 11,052,137 B |

## 尚未解决：会话内字符串增长

最终包的 scr_str_alloc_raw 存活分配从 9,109,291 B / 341 块增长到 16,662,145 B / 483 块，增加 **7,552,854 B（约 7.20 MiB）**。相关分配栈经过 JSON 输出与 BusinessRuntime.visit 的字符串构建。分配栈只能说明分配位置，不能确定最后持有引用的对象；字符串 spare 复用还可能使当前内容与最初分配栈不相同。

额外做了临时每步 `anseronui_core_collect()` 对照：10 次往返后 scr_str_alloc_raw 从 10,212,015 B 增至 13,450,883 B。强制完整循环回收没有消除该增长，所以未把每步 collect 作为修复提交。该实验使用第一次缓存清理版本；它的目的仅是区分回收调度延迟，不能代替最终包对照。

这些字符串在根 session 销毁后归零。它们仍可能属于过度保留、尚未达到上限的缓存或未正确释放的引用，本次尚未拿到持有者链，不能将其认定为正常缓存，也不能声称整个内存问题已彻底修复。后续需要针对仍存活的字符串和 record/capsule 所有权建立引用证据，而非仅修改业务 stringify 或增加 GC 频率。

## 回归验证

新增 `scr_library.test.c`、`scr_library.test-alloc.h`、`scr_library.test.ts`。在真实 runtime malloc/calloc/realloc/free 外层计数，覆盖 JSON 解析、带大字符串的自循环、结果 arena、typed capsule 的匹配/构建/视图转换、递归检查缓冲及重复空 reset。

- 每个配置 4 个并发线程 × 3 组线程 × 12 次会话，实际分配数和字节数在每次 reset 后均为零。
- 非 RC 审计和 RC 审计两种构建均通过 ASan/UBSan；每种构建测试 cycle threshold 1 和 256。最初的最小测试在未修复源码上失败：每个线程的 session 0 遗留 12 块 / 6,089 B；同一测试修复后通过。之后扩展了转换缓冲覆盖。
- `scr_library.test.ts`：2 tests passed。
- `scr_json.test.ts`、`scr_cycle.test.ts`：3 tests passed。
- `npm run test:build`：7 tests passed。
- 新增 TS 文件 oxfmt、oxlint 检查及 `git diff --check` 通过。
- 新增 cleanup patch 单独反向应用检查通过。整个既有 async-embedding.patch 的反向检查在原有 compiler/src/index.ts hunk 不匹配；本次未修改该既有 hunk。
- Android Framework Core、Business Core 及 APK 源码构建成功。
- 恢复普通 Debug 包后又完成 3 次详情页往返，PID 始终为 16306；根页面系统返回后进程仍存活，再次启动首页成功。本轮没有复现返回导致进程崩溃。

未运行全量 scriptc sandbox 发布门禁，未发布 npm 包，也未将本轮修复重新部署到华为真机或验证 iOS/Harmony/Web。测试应用的 SDK 是本地补丁版本；未来重新安装/替换 SDK，需要使用包含这些修复的新包或重新应用补丁。
