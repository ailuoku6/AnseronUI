# HarmonyOS API 21 runtime 探针

从仓库根目录执行 `node scripts/verify-harmony-runtime.mjs`。详细环境、复现方式和边界见 [验证报告](../../verification/harmony-api21-report.md)。

| 文件 | 验证内容 |
| --- | --- |
| `sdk-smoke.c` | SDK C ABI、pthread、TLS、mmap |
| `profile.json`、`probe.ts`、`host.c` | scriptc TS AOT、字符串/JSON/容器、异常、嵌套 await、host resolve/reject、双线程和重复 shutdown/init |
| `fiber-host.c` | 直接调用 runtime 栈式 fiber，交错执行 4,000 次 await，检查 x19/d8、mmap 栈和关闭 |
| `transport.c` | Framework/Business/split_bridge/transport、Handshake、线程所有权、重复 open 和 close |
| `poison.c` | 单独进程复现 poisoned context 不能 close 的现有故障回收限制 |
| `record-stdio.mjs` | 在现有本机 Core 协议测试中记录已断言的输入和预期输出，用于设备文件回放 |

这些探针运行于模拟器 shell 原生进程，未接入 HAP、NAPI 或 ArkUI。服务协议由测试宿主返回数据，系统服务集成需要后续应用进程验证。构建脚本不会修改 vendor 源目录：复制 runtime 后应用版本化补丁，产物都写入 `.verification/harmony-api21/`。
