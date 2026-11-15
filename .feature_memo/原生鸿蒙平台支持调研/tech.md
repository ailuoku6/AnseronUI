# 技术记录

- 正文：`internal/design/harmonyos-native-support.md`。
- 基线 commit `67ac8419` 加已有未提交修改，package 0.0.8。
- 共享 TSX/scriptc，双 archive + split facade，C++ Host/Renderer，ArkTS Stage/服务。
- scriptc 0.4.8 无 OHOS target，driver 仅 clang/zigcc，显式 target + clang 失败。
- AArch64 async 有 SCR_FAST_CTX；include ucontext 不等于主路径依赖 swapcontext。
- Darwin 非 Android 合包走 Apple libtool，OHOS 必须按目标对象格式改。
- 固定线程单 context；保活成本包括多 worker。ArkUI measure/layout 限合法回调。
- 实际验证环境为 DevEco Studio 6.0.1.251、Native SDK 6.0.1.112/API 21、Mate 70 Pro `aarch64` 模拟器；API 21 是当前最低兼容基线。SDK 26 仍是后续候选，未作为本次证据。
- PATH 未发现 hdc/hvigorw，不据此断言未安装 SDK。
- 已实际验证：SDK pthread/TLS/mmap、LLVM 无栈协程、AArch64 fast-context 栈式 fiber、双 runtime ELF localization 和 Core transport 线程所有权。SDK Clang 15 用补丁选 SHA-512 标量实现；LLVM IR 由本机 clang 23.1.1 编译。正式 scriptc helper/driver 没有新增 target。
- 故障限制：poisoned context 无法 close/重新 open，已以设备探针复现；需要正式 Host 的隔离/回收方案。HTTP/timer/存储等协议回放使用测试宿主回包，未映射鸿蒙系统服务。

## 2026-11-14 能力对齐实施（更新早期调研结论）

- 正式 harmony CLI、Stage 模板、schema 3 插件已实现；固定 worker 独占 Core，UI scoped task 应用节点/ref，worker step 和 TSFN 主线程排队有可关闭计时。
- UIAbility 构造阶段无 Want 回调不读上下文；正常启动继承 HarmonyAbility 转发生命周期。
- HarmonyPageStack 默认无限容量，可限制/内存压力释放隐藏宿主，保留名称与参数并重建；只有活动页可导航。
- AVPlayer 与 XComponent 实际首帧、ms 进度；异步播放命令收敛到最新可见性/控制意图；raw fd 操作串行，迟到事件丢弃。
- C++ 不拆挂原位置节点，避免失焦；插件事件按 node handle 识别，Emit 有存活令牌，卸载后不解引用旧 Node。
- 下载流式落盘；上传分块读入有上限缓冲（32 MiB），HTTP 响应上限 64 KiB。活跃上传禁止 release，取消/晚到 open/copy 失败清理资源。
- 主机 LLVM23 + API21 SDK Clang15 是当前配方，发布仍要求开发者证书。

2026-11-14 主示例安装发现 READ_PASTEBOARD 被测试签名拒绝（9568289），默认配置已移除该受限权限；不修改SDK测试profile绕过授权，正式剪贴板读取需应用合法授权。其他demo权限按功能声明。
