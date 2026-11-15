# 协议与接入

- `Diagnostic` 保留 code/message，增加可选 stack（32768 UTF-16 单元）、errorName（256）、buildId（256）；无栈时业务事件传空字符串。
- Core 的 emitError 读取原始 Error.stack，不在 catch 里新建 Error；格式化和 getter 失败不影响事件发送。
- Web PlatformExtensions、Apple Host/RenderView、Android Host/RenderView、HarmonyHost 提供 onDiagnosticDetails；旧 onDiagnostic 保持兼容。
- Web 内存诊断最多保留 200 条；应用可在详细回调中持久化或上传；SDK 未添加远程地址。
- 项目构建 ID 沿用 bundleBuildId；构建缓存另由源码指纹保证位置一致。
