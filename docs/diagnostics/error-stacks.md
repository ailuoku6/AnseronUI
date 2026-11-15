# TS 错误堆栈

业务运行时通过 `Diagnostic` 输出原始错误的 `stack`。Debug 和 Release 均保留该字段。原生与 Wasm 构建在编译时将源码位置还原到原始 TS/TSX，宿主不需要下载 Source Map。

## 接收错误

| 宿主 | 接收入口 |
| --- | --- |
| Web 参考运行时或 Wasm | `PlatformExtensions.onDiagnosticDetails`；`host.diagnostics` 保留最近 200 条诊断 |
| iOS / macOS | `AnseronUIRenderView.onDiagnosticDetails` 或 Host 的同名回调；参数为 `[String: Any]` |
| Android | `AnseronUIRenderView.onDiagnosticDetails` 或 `AndroidHost` 构造参数；参数为 `JSONObject` |
| HarmonyOS | `HarmonyHost.onDiagnosticDetails`；参数为 `DiagnosticDetails` |
| 自定义 Core 宿主 | 读取输出 Envelope 中的 `Diagnostic` payload |

原有 `onDiagnostic(code, message)` 回调继续可用。详细回调提供完整诊断字段。将收到的字段交给应用自己的存储或上传组件；框架不配置远程接收地址。

| 字段 | 含义 |
| --- | --- |
| `code` | 捕获边界，例如 `RENDER_ERROR`、`EVENT_REJECTION`、`TIMER_ERROR` |
| `message` | 错误摘要，最多 4096 个 UTF-16 代码单元 |
| `errorName` | `Error.name`；非 Error 值为 `NonErrorThrown` |
| `stack` | 原始错误对象的堆栈，最多 32768 个 UTF-16 代码单元；没有有效堆栈时为空字符串 |
| `buildId` | 业务运行时的 `bundleBuildId`，与输出 Envelope 一致 |

后三个字段在协议中可选，宿主应允许旧业务包不发送这些字段。保存错误时，也保留 Envelope 中的 surface、generation、runtimeEpoch 和 sequence，以便区分发生错误的页面实例。

## 源码位置

原生测试产物的实际输出示例：

```text
Error: original
    at leaf (src/original.tsx:2:9)
    at caller (src/original.tsx:6:3)
    at caught (src/original.tsx:9:9)
```

行号和列号从 1 开始。列按 UTF-16 代码单元计算。路径使用工程内相对路径；外部源码和 npm 插件使用 staging 的稳定逻辑路径。

构建阶段组合 TSX 转换、定时器转换、调试插桩和 import 重写的位置映射。scriptc 在函数执行和调用时维护源码栈，创建 Error 时复制当前栈。`catch`、重新抛出和诊断输出读取该副本，不会用捕获位置替换它。

源码映射作为构建输入保存在暂存 TS 文件的 `anseronuiSourceMap` 注释中。它不包含源码正文。编译后的程序保留必要的函数名与位置文本。调整原始源码行列会使对应构建缓存失效。

## 覆盖范围

- 渲染、事件、异步事件拒绝、计时器、页面生命周期、Effect、Effect 清理、Ref 和返回键回调的业务异常。
- Error 创建位置、同步调用者位置，以及正在执行的异步函数在 `await` 恢复后的源码位置。
- `Error.captureStackTrace(error, constructorOpt)` 的静态函数跳过行为。
- Web 参考运行时保留 JavaScript 引擎提供的原始堆栈；浏览器源码映射显示仍由其构建工具和开发者工具负责。

跨 `await` 的历史父任务调用链不会额外拼接。字符串或普通对象抛出时不构造假堆栈。未进入业务捕获边界的进程级异常、Native 信号崩溃、OOM 和系统强杀需要独立的原生崩溃采集器。此功能不替代 dSYM / DWARF 对 Native 地址栈的符号化。

## 验证

安装仓库依赖并完成 `npm run prepare:compiler` 后执行：

```sh
npm run test:stacks
npm run test:framework
```

堆栈测试编译并执行 Release 原生产物和 Wasm 库，检查原始行列、嵌套调用、异步恢复、跳过指定函数及源码位置变更后的重新构建。测试需要当前主机的 LLVM helper、runtime pack 和 Wasm 构建工具。
