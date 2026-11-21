# anseronui 0.1.2 会话内字符串增长：持有者定位

2026-11-21。全新发布版应用 `/Users/ailuoku6/web_project/anseronui012MemoryTest`，Android 15 / API 35 / ARM64，emulator-5554。本次定位延续 `native-library-cleanup.md` 中尚未解决的会话内增长；没有修改框架生产源码。

后续已实施修复并完成回归和模拟器验证，见 [修复验证记录](native-session-string-fix.md)。本文保留修复前的持有者调查证据。

## 结论与责任层

主要问题是 AnseronUI 为 scriptc 添加的异步 embedding 循环没有清理已经处理的 Promise rejection tracking 引用。拒绝被 catch/await 处理后，Promise 仍由 `scr_maybe_unhandled` 持有，连带 Error 及字符串存活至 `scr_embed_close`。这是会话内无界保留；退出可释放，不代表运行期间没有问题。

- `internal/toolchain/scriptc/packages/runtime/src/scr_async.c:1797`：`scr_track_rejection` 将 Promise retain 后加入跟踪数组。
- 同文件 `scr_prom_observe`（439 行）设置 `rejection_observed`，并不释放跟踪数组的引用。
- 同文件 `scr_embed_step`（5711 行）只处理 ready jobs 和 scheduled cycle collection，没有回收已观察的 rejection。
- 同文件 `scr_embed_close`（5702 行）才 discard 并释放 tracking 数组。普通 executable 循环另有 `scr_report_unhandled_rejections`，会释放 tracking 引用。
- embedding 实现来自 `internal/toolchain/async-embedding.patch:538` 附近，因此责任应归到 AnseronUI 的 scriptc 嵌入式适配；不能据此声称最新上游 scriptc 也有同样问题。

## 触发及放大因素

Debug 注入的 `packages/devtools/instrumentation/runtime.inc:91` 持续上传 inspector 快照，默认间隔 1000 ms。模拟器的 `127.0.0.1:8091` 不可连接，产生 `java.net.ConnectException: Failed to connect to /127.0.0.1:8091`。`packages/core/src/business-runtime.ts:340` 附近将失败 ModuleResult 转成 `reject(new Error(payload.value))`。轮询函数的 catch 正常处理异常，但底层跟踪引用未释放，所以停在首页不操作也会增长。

探针直接读取发布版编译对象内的 Promise/Error/String，发现一个 63 字节错误 message 的容量为 53,080 字节，malloc 请求为 53,105 字节。JSON builder 的全局容量 hint（`scr_json.c:325`、`scr_jb_finish:569`）与字符串 spare 复用（`scr_string.c:450`、`:487`）放大短字符串的存储容量。原始分配栈可以来自 JSON 输出，但最终持有者已是 Error，不能把分配位置当成所有权证据。

## 因果验证

在发布版 Business archive 的复制品中只导出诊断所需符号，加入 JNI 后置观察探针。观察阶段不改变业务逻辑。干预阶段通过设备标记启用“只释放 observed rejection”的临时处理，未处理的 rejection 保留。该干预用于证明因果，不是交付补丁。

| 阶段 | scr_str_alloc_raw 活跃字节 | 块数 |
| --- | ---: | ---: |
| 释放前 | 11,286,596 | 382 |
| 释放 57 条已处理 rejection 后 | 8,259,611 | 325 |
| 干预开启，5 次路由往返 | 8,590,185 | 331 |
| 干预开启，10 次路由往返 | 8,855,710 | 336 |
| 根 session 销毁后 | 0 | 0 |

下降 **3,026,985 B = 57 × 53,105 B**，与 57 个 Error message 大字符串分配逐个吻合。探针同时确认这些 Promise 的 `rejection_observed=true`、`rc=1`、library arena 数量为 0。GC 无法回收它们，因为 tracking 数组仍持有有效引用。

另用 npm 0.1.2 包内 runtime 源码编译独立 C 复现，100 次 rejection 均 mark handled、释放调用者引用并执行 embed step 后，tracking 数量仍是 100，每个 rc=1。清理 observed 项后归零；一条未处理加一条已处理时仅清理一条，保留未处理项；embed close 最后归零。ASan/UBSan 运行通过（显式关闭 LeakSanitizer；不是全局无泄漏证明）。

## 剩余路由增量

第二轮保持 rejection 清理开启，直接观察 BusinessRuntime 的 `devtoolsCalls`。首页每次 router.push 留下一条调试记录；详情页自己的记录随详情 session 销毁。5 次往返后首页有 5 条记录。

| 阶段 | scr_str_alloc_raw 活跃字节 | 块数 |
| --- | ---: | ---: |
| 路由前 | 8,259,611 | 325 |
| 5 次往返后 | 8,590,185 | 331 |
| 清空 devtoolsCalls 后 | 8,324,660 | 326 |

清空调试历史释放 **265,525 B = 5 × 53,105 B**，证明主要路由相关残留由历史记录持有。`runtime.inc:10–22` 明确将每个 surface 的调用历史限制为 200 条；短文本 slice 可保留原本过大的容量，因此这是有条数上限但内存利用率差的调试保留。剩余相对基线 65,049 B / 1 个此类分配未在本轮单独追踪，不能把所有差额都归为已证明的缓存；也未实跑到 200 条验证平台值。

## 修复方向与验证边界

1. 在 embedding 的安全 checkpoint 清理已经 observed 的 tracking 引用，并同步维护 `async-embedding.patch`。考虑 budget 中断、延迟 catch、release 触发清理的重入，以及真正 unhandled rejection 的宿主诊断策略。
2. 不要每步直接 discard 全部 rejection，也不要不加设计地调用 executable 的 stderr/exit 报错路径，否则可能丢失真正错误或改变宿主语义。
3. 独立优化 JSON builder 产出小字符串时的容量保留，避免短错误和调试历史各占约 52 KiB；仅减小容量不能修复未释放的 Promise 引用。
4. DevTools 断连重试可增加退避，降低失败频率；它只缓解当前触发器，不能代替 runtime 修复。

本轮只在 Android 模拟器 Debug 包及 macOS 上编译的独立 C 复现中验证。共享 embedding 路径意味着其他使用该路径的目标也有风险，但没有实测 iOS/Harmony/Web。Release 不注入该 Debug 轮询；其他业务 rejection 路径仍需回归，不能宣称 Release 已确认安全或已确认复现。

原始堆、符号化统计、探针、复现和恢复验证日志保存于测试应用 `verification/native-leak/owner-investigation/`。临时 ELF 含诊断符号和清理开关，不应用于产品发布。

## 恢复确认

已恢复普通 Native ELF（SHA-256 `298af4339daed6b0b2f68c71442d5bb0ba73a28550f92efdacc8b2f64f0bfdd7`）和原始 Gradle 文件，移除 wrap.sh 与设备干预标记，重新构建、安装普通 Debug APK。检查 APK 不含 wrap.sh、AUIMemoryOwner 或 AUIMemoryCalls 诊断标签。普通包连续 3 次详情页往返保持 PID 20863；根页面系统返回后进程仍存活，重新打开首页成功。
