# HarmonyOS API 21 实际运行验证报告

- 验证日期：2026-11-14（Asia/Shanghai）
- 目标：HarmonyOS 原生（非 Android），最低兼容 HarmonyOS 6.0.1 / API 21
- 设备：Mate 70 Pro 模拟器，`127.0.0.1:5557`，`aarch64`
- 系统：`OpenHarmony-6.0.1.112`，`emulator 6.0.0.112(SP3DEVC00E112R4P11)`
- SDK：DevEco Studio `6.0.1.251`，Native SDK API `21`，`6.0.1.112`
- 编译器：OHOS (dev) clang `15.0.4`；scriptc AOT LLVM object 使用本机 Homebrew clang `23.1.1` 生成，目标仍为 `aarch64-linux-ohos`
- 设备连接：DevEco SDK `hdc` `3.2.0b`

## 结论

API 21 模拟器已经实际执行 scriptc/runtime 和 AnseronUI Core 原生代码。runtime 探针通过两个线程、40 个会话、80 个异步任务；原生栈式 fiber 探针通过两条交错 fiber 的 4,000 次 await；Core transport 探针通过两个线程、20 个会话。当前证据支持“API 21 的 AArch64 原生 runtime/Core 可执行”，不支持“鸿蒙平台已经完成交付”：正式 scriptc OHOS target、HAP、签名、ArkUI Renderer、Native Node、输入法和系统服务仍未接入。

## 已通过项目

| 探针 | 结果 |
| --- | --- |
| SDK C ABI | `SDK_SMOKE PASS thread=21 main_tls=6 mmap=ok`；pthread/TLS/mmap |
| scriptc runtime | `RUNTIME_PROBE PASS threads=2 sessions=40 async=80 unicode=json+utf8 nested_await=ok rejection=ok shutdown=ok` |
| AArch64 栈式 fiber | `FIBER_PROBE PASS backend=AArch64-fast-context fibers=2 awaits=4000 checkpoints=4002 x19=ok d8=ok mmap_stack=ok shutdown=ok` |
| Core transport | `CORE_TRANSPORT PASS threads=2 sessions=20 handshake=ok ownership=ok duplicate_open=refused close=ok` |
| 五组 Core 协议回放 | `counter`、`async-form`、`components`、`extensions`、`timers` 均设备退出码 0；输出与本机 oracle 逐字节相同 |
| Framework/Business | 当前源码分别编译为 API 21 ELF 静态库并与 `split_bridge.c`、`transport.c` 链接，设备运行通过 |

完整结果、版本、源码指纹、产物 SHA-256 和命令清单保存在 `.verification/harmony-api21/results.json`；逐项原始日志、设备输出和构建产物保存在同目录。这些目录是验证证据，不是发布 SDK。

本次结果另保存为可入仓的 [JSON 快照](harmony-api21-results.json)，不依赖被忽略的构建目录保存结论。最终运行 `reuseBuild=false`，从当前源码重建全部 OHOS archive；Core 输入指纹为 `66b0d0ff421a60c74f024c308c6195c5c37506fb4e86574f7f0e3d893d6673b9`，补丁 SHA-256 为 `89f4671f027ad9282d4577f515a1182a650e910c997b13fad8201803786384a4`。ELF 检查确认 AArch64、PIE，解释器 `/lib/ld-musl-aarch64.so.1`，runtime 探针动态依赖仅 `libc.so`。

| 协议场景 | 输入步骤 | 输出 Envelope | 比对 |
| --- | ---: | ---: | --- |
| counter | 118 | 111 | 字节完全相同 |
| async-form | 114 | 88 | 字节完全相同 |
| components | 784 | 718 | 字节完全相同 |
| extensions | 1,046 | 986 | 字节完全相同 |
| timers | 84 | 67 | 字节完全相同 |

共 2,146 个输入步骤、1,970 个输出 Envelope。先用项目现有 `scripts/test-native-core.mjs` 对当前源码的本机 Core 执行断言，同时记录输入/预期输出；再将输入送入鸿蒙 SDK 编译的 Core，取回结果按原始字节比对。覆盖 handshake、布局/测量请求和响应、事件、Commit/ACK、异步 ModuleResult、取消和销毁。测试中的 HTTP、timer、存储等服务由测试宿主回包，未调用 HarmonyOS 对应系统服务。

TS 异步探针使用 LLVM 无栈协程；`fiber-host.c` 另直接调用 runtime 的栈式 `scr_async_spawn`，两条 fiber 保持 ready 队列有竞争者，确保发生原生上下文切换。检查 `x19` 整数和 `d8` 浮点 callee-saved 值，不把这两个寄存器的探针扩展为全寄存器/全部 ABI 情形的证明。

## 复现

```sh
node scripts/verify-harmony-runtime.mjs
```

在仓库根执行；默认从源码重建并运行全部探针，约需数分钟。依赖已准备好的 scriptc 0.4.8 编译器、macOS AArch64 工具链、Node 24、DevEco API 21 SDK 和已启动的模拟器。可用 `HARMONY_NATIVE_SDK`、`HARMONY_HDC`、`HARMONY_DEVICE`、`HARMONY_LLVM_CLANG` 指定安装位置/设备。`--reuse-build` 只用于明确需要复用已有 archive 的调试，最终结果会记录该标志。工具需要访问本地 hdc server，在当前受限环境中需提升沙箱权限。

脚本上传到模拟器 `/data/local/tmp/anseronui-api21/`，仅清理该目录下自己生成的 replay 数据；不会安装 HAP 或修改系统分区。单独构建静态库可使用：

```sh
node scripts/verify-harmony-build.mjs internal/experiments/harmony-runtime/profile.json .verification/harmony-api21/runtime
node scripts/verify-harmony-build.mjs .verification/source-native/framework/profile.json .verification/harmony-api21/framework
node scripts/verify-harmony-build.mjs .verification/source-native/business/profile.json .verification/harmony-api21/business
```

总入口会调用 API 21 SDK Clang 链接 `host.c`、`fiber-host.c`、`transport.c` 等，通过 SDK `hdc file send` 部署后执行。单个 archive 的 runtime 源码和特性清单见各子目录的 `build.json`。这是单独的验证流程，未修改正式 target 选择逻辑。

## 已发现的工具链差异

1. 当前 scriptc native helper 的允许 target 列表没有 OHOS；不能把 `aarch64-linux-ohos` 伪装成 Android 或普通 Linux。
2. API 21 SDK Clang 15 不能解析 scriptc 新 LLVM IR 的 `memory(...)` 属性；验证 lane 使用本机 LLVM 生成同一 OHOS ELF 对象，SDK Clang 编译 runtime C 源码和最终链接。
3. API 21 SDK 的 Clang 15 `arm_neon.h` 没有 scriptc runtime 的 SHA-512 intrinsic 声明；[`internal/toolchain/harmony-api21.patch`](../toolchain/harmony-api21.patch) 在 OHOS + Clang 15 上选择已有的标量实现。正式 target 需要把该差异纳入版本化 runtime 适配，而不是依赖工作站 LLVM。
4. 模拟器 shell 用户不允许监听 TCP 端口，因此协议回放使用 `hdc shell` 文件输入；这证明的是原生进程/ABI/Core，不是 ArkUI 应用进程。
5. runtime C 编译显式启用 `_GNU_SOURCE`，暴露 `stpcpy` 等声明；OHOS SDK 默认 PIE，合并可重定位 ELF 对象时需 `-no-pie -nostdlib -Wl,-r`。archive 使用 LLVM ar，运行时符号通过 scriptc 现有 ELF localizer 隔离，没有混入 Android 或 glibc runtime。

## 故障与回收边界

未决 Promise 的 shutdown 拒绝和恢复后 shutdown 成功已验证。另用独立进程输入非法 JSON 检查 panic sink：宿主能接住错误，但当前 `transport.c` 的 `enter()` 拒绝 poisoned context，因此 `close()` 也被拒绝，线程的 `current` 槽位保持占用。这属于现有宿主层的故障回收限制，需要在正式鸿蒙 Host 中设计线程/实例隔离和终止回收策略。它不能被正常会话关闭测试的 PASS 掩盖；最终结果单独记录为 `KNOWN_LIMITATION_CONFIRMED`。

## 尚未覆盖

尚未生成或安装 HAP，未验证签名、Stage Ability、NAPI/Native Node、ContentSlot、自定义 measure/layout、文字输入、返回键、窗口生命周期、真机、x86 模拟器和系统服务权限。未运行 ASan、泄漏趋势测试、密码学全向量测试或 scriptc 全平台完整测试集；runtime 源码编译仍有现存警告。只测试了 API 21 镜像，较新系统仍需独立兼容回归。正式支持前必须完成这些项目，并把 `scripts/build-core.mjs`、scriptc target/driver、OHOS runtime 闭包、Renderer 和 HAP 模板纳入产品构建；未来 HAP 的 compatible SDK 至少锁定 `6.0.1(21)`。
