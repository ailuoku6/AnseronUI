# 变更记录

## 2026-11-08：项目正式命名为 AnseronUI

- 用户确定项目名称为 AnseronUI，统一更新文档、示例、私有包 `@anseronui/*`、`anseronui.config.json`、原生容器 `AnseronUIRenderView`、原生模块、C/JNI/Wasm 符号和 Demo 应用标识 `org.anseronui.demo`。
- 技术方案重命名为 `internal/design/anseronui-framework.md`，相关链接同步更新；工作区物理路径仍为 `/Users/ailuoku6/web_project/TSNative`。
- 验证通过：框架与布局类型检查、34 项框架测试、构建指纹测试、布局差分与静态库验证、Native/Wasm 四组页面探针、200 次多线程 transport 生命周期，以及 Web、iOS Simulator 和 Android APK 构建。
- Android 验证使用 Android Studio 自带 JDK 21；本机 `/usr/libexec/java_home -v 17` 实际返回 JDK 25，与当前 Gradle 8.9 不兼容。

## 2026-11-07：热更新范围收敛

- 用户要求暂不设计具体热更新方案，但保留后续扩展接口。
- 主方案修订为 v4：保留 RuntimeAdapter 生命周期、artifact/source 抽象、Runtime 身份/epoch 与能力协商；移除 Wasm 解释器选型、更新 manifest、状态迁移、双代切换、回滚、开发重载和 OTA 渠道作为当前承诺。
- 同步更新 brief、tech、protocol、index、handoff 与 decisions；历史 v2/v3 作为被取代的方案记录保留，不再作为当前决策。
- 验证：全文检索过期热更新承诺并检查章节编号；Markdown 链接/结构检查已完成。

## 2026-11-06

- 完成：本地 KuiklyUI 和 scriptc 源码调研，新增完整中文方案与需求 memo。
- 核实：移动端库模式、callback 标量结果限制、禁止回调重入、thread instance 无完整 teardown、native panic/poison/abort 边界。
- 验证：文档链接/结构与 Markdown 风格检查；未执行构建、测试或端上 UI，方案示例明确标为未实现。
- 范围：compiler/runtime、生成兼容性文件、公共 docs 站点与外部 KuiklyUI 仓库无修改。
- 后续：用户要求实施时从 P0 三端 counter、协议与关键边界验证开始。

## 2026-11-06：Promise / 热更新修订

- 用户要求：Promise，不能引入 JS 运行时，支持热更新；更新主文为 v2，重写 async、生命周期、构建与里程碑，新增完整热更新章节。
- 核实源码：`scr_async.c` 已有 Promise/微任务/async，库模式 async-free 准入与链接剔除仍存在；不能宣称移动端 library 已支持。
- 查询官方 Apple 2.5.2/4.7、Google Play Device and Network Abuse 与 WAMR interpreter 文档；主文保留链接与日期，分发结论按条件表达。
- 方案建议：Wasm interpreter 负责允许渠道逻辑更新，原生 AOT 为随包性能基线；context/step/dispose 提前至 P0，更新基于实例替换与序列化状态迁移。
- 验证：Markdown 本地链接、标题顺序、代码围栏、空白检查；没有编译、运行、性能或商店审核结果，compiler/runtime 与公共站点未变更。

## 2026-11-06：React 风格组件修订

- 用户要求：组件/页面更贴近 React，但不直接使用 React；完整方案升级 v3，替换原公开显式 State/Binding DSL。
- 新方案：函数组件、TSX、props/children、Hooks、keyed tree 协调、函数重执行/状态快照与原生 ACK 后 Effect；新增 UI compiler/Hook frame，不依赖 React。
- 生命周期：草稿/提交 revision、updater watermark、事件表/Effect ACK、卸载清理、async handler rejection 与 owner service 取消；开发 reload 依据 Hook signature 恢复可序列化状态。
- 源码核对：scriptc 能解析 TSX AST/识别 `.tsx`，未发现业务 JSX/UI lowering；语法解析不等于框架已能执行。
- 计划变化：TSX/基础 Hooks 从 P3 提升到 P0 探针/P1 必交，保留 Promise/无 JS 引擎/热更新约束；修正主文第 14 节子标题编号。
- 验证：Markdown 本地链接、标题编号、围栏、空白及源码路径检查；未运行构建、compiler tests 或端上示例，SDK API 均为提案。

## 2026-11-07：迁移至 AnseronUI

- 按用户要求，将完整技术方案、8 份需求记录和默认记录偏好迁至 `/Users/ailuoku6/web_project/TSNative`，保留原目录结构。
- 更新工作区身份、交接路径和外部源码归属说明；保留 v3 需求、历史决策与尚未实施的状态。
- 校验：文件清单、迁移前后 hash、Markdown 链接/围栏/编号/空白；在目标内容校验后才移除原文件，不修改 scriptc 编译器或运行时。

## 2026-11-07：纯 TS 布局库调研

- 下载固定提交的 typeflex、flexily、yoga-layout-tui，Node 两列布局输出一致；全程 dynamic=false，未修改 compiler/runtime 或安装候选依赖。
- yoga-layout-tui 内部计算与公开入口均生成 LLVM IR；percent/gap/宽度修改及子节点 measure 的 Node 输出符合探针预期，测量根节点在无宽高时输出 0×0，保留待审计事实。
- typeflex 原版类型检查失败；flexily 原版缺可选日志模块，禁用发现的临时副本仍有动态 style 读写等限制。未做移植，不按诊断条数估工期。
- native executable 被 SC3003（helper 0.2.0、compiler 0.2.1）阻挡，未产生原生执行或 mobile/library/Wasm/性能证据。
- 新增独立报告并更新 memo，主文仅加引用；未替换布局方案，没有启动框架实施。

## 2026-11-07：flexily 静态源码改写

- 用户要求检查不兼容特性并修改 flexily 规避；在独立源码副本完成 9 类已覆盖路径适配，修改 7 个上游文件、增加静态入口，保留 MIT 与固定提交来源。
- 官方匹配的 helper/runtime pack 0.2.1 安装于临时目录，绕开工作区旧包的解析位置但保留身份/版本校验；compiler/runtime 源码和工作区依赖未修改。
- 两组 Node/upstream、Node/adapted、macOS arm64 native 的 stdout、stderr、exit 相同，共 1017 行；上游单测和基准状态保存在原型 validation.json，排除项不算通过。
- createFlexily composable 探针仍失败，不将 Node/layout 成功外推为整包支持；未验证 mobile/library/Wasm、长期内存或完整性能 gate。
- 交付源码副本、可应用补丁、复现脚本和新报告；框架实现与生产布局选型均未开始。

## 2026-11-07：extends 澄清探针

- 完成 5 个独立最小探针：class 继承、数据接口继承、空接口继承 class、增加方法的接口继承 class、同对象具体子类类型；4 个原生通过且与 Node 输出一致，增加方法的接口视图失败。
- 更新适配报告及 memo，收窄先前 composable 类型限制的表述；不宣称所有 extends 或所有 interface extends class 都不支持，未改 compiler/runtime。

## 2026-11-07：正式引入 Flexily 布局引擎

- 用户授权克隆并适配 Flexily，适配成功后作为 AnseronUI 布局引擎。已 clone 到 `packages/flexily`，固定 0.8.5/4850f1f，应用报告的 7 文件改写；新增私有静态入口和 `@anseronui/layout` engine 包。
- 独立安装锁定 scriptc 0.4.8 + 匹配 helper/runtime；没有修改外部 scriptc 源码。0.4.9 尚未在当前 npm registry 发布，未用全局旧 CLI 或临时 0.2.1 绕过版本合同。
- `npm run test:layout:wasm` 通过：两组原版 Node/适配 Node/native 共 1017 行一致；公共包入口 16 组测量/重排/子树与离树销毁用例通过 native exe、C host 调用静态库、Node WASI reactor，stdout/stderr/exit 一致。
- `npm run typecheck:layout` 和静态 Flexily tsconfig 通过；`git diff --check` 通过；原生动态链接仅 libSystem。
- 上游布局/行为回归 50 文件、2648 通过/1 上游跳过/0 失败；独立粗粒度性能回归 8 通过。日志发布/Bun 工具测试、benchmark 报告 CLI 工具测试排除，均不计通过。
- warmup/rich 两个 benchmark 文件在原版/改写版各运行一次，均 55 完成+1 明确排除（已知 5000 节点超时）。主机有其他 CPU 负载、没有 null control，不作性能提升或小于 5% 回退声明。
- 主方案升级 v5，当前布局选型已从自研有限 Flex 改为 Flexily。移动端 library、浏览器 WASI/DOM、异步真实文本缓存、长期内存和设备像素比例/连续取整配置仍待 P0。

## 2026-11-07：框架 P0 参考实现与原生渲染模块

- 新增协议、UI/Hooks、Core、TSX lowering、Web DOM 参考宿主与 counter/async-form 样例；浏览器修复测量迭代不足导致的空白，并验证计数、输入/列表、timer Promise 与 HTTP Promise。
- Core 修复卸载后 node ID 再用，增加异步 continuation 的宿主 wake；MeasureRequest 增加控件种类，协议拒绝无效帧/计数/测量 payload。
- 新增 UIKit 与 Android View 渲染器，含基础控件、事件和真实控件测量。iOS Simulator SDK 类型检查成功；Android Gradle `assembleDebug` 成功（第一次需从官方仓库补齐本机缓存）。
- `npm run typecheck:framework`、`npm run test:framework`（10/10）、两个 Web build、`npm run test:layout` 通过；macOS scriptc `--tier static-only` 计数器输出 `Count: 0`/`Count: 1`。
- `scriptc build --lib --profile packages/core/test/library.profile.json` 仍因 SC4005 失败；没有修改外部 `../scriptc/`，Android/iOS/Wasm Core 宿主和真机验证未完成。

## 2026-11-07 真实原生 Core 嵌入增量

- 在 `internal/toolchain/scriptc` 固定官方 v0.4.8（3d1888ae），实现 opt-in `async_embedding.version=1`、bounded async_step/pending、源运行时链接、shutdown 与线程实例支持；相邻旧 `../scriptc` 的原型源码编辑已恢复。
- 完整 ReferenceRuntime + Flexily + counter/async-form 已编成 macOS 原生静态库。`scripts/test-native-core.mjs` 经 C stdio 宿主验证计数、输入/列表、timer/HTTP Promise 回填、等待过程中销毁；不是 JS 测试。
- 修正 HookDispatcher state 的内部擦除边界，以及 ServiceSlot 未完整初始化的断言，保持公共泛型 useState API。
- iOS/Android 交叉编译遇到 Zig LLVM 与 coroutine intrinsic 版本差异，正在改为官方匹配 helper 生成业务对象、Zig 编译 C runtime。三端可安装运行仍待验证。
- 新增 C 所有权/固定线程 transport、Swift NativeCore、JNI NativeCore 和两端 app 源码，尚未打包验证；不可据此宣称完成。
- 2026-11-07：共享 Core 通过 scriptc v0.4.8 的显式 async-embedding patch 构建为 iOS Simulator/Device、Android arm64 与 Web Wasm 静态产物。新增 `npm run prepare:compiler`、`build:core:*`、`build:{ios,ios-device,android,web}` 与可配置 `anseronui.config.json`。
- 2026-11-07：iOS XCTest 在模拟器通过计数、文本输入/列表、Timer、HTTP 和页面替换；Android Instrumentation 在模拟器通过同类真实 JNI/Core 流程。iOS/Android renderer 均避免无意义的子视图 detach，以保留键盘焦点。
- 2026-11-07：Native 与 Wasm stdio 集成测试通过；C lifecycle 测试 4 个线程并行完成 200 次 Core open/post/step/close。TypeScript 框架 13 项、compiler embedding/cache 14 项、布局差分通过。
- 2026-11-07：Android APK、iOS Simulator app、未签名 iOS device app 与 Web Wasm production build 可生成。Android `connectedDebugAndroidTest` 的 Gradle Unified Test Platform 下载因 TLS/网络失败，使用构建好的 test APK 通过 adb 直接运行 instrumentation runner 验证。
- 2026-11-07：限制：asyncEmbedding 对 scriptc v0.4.8 有本地补丁依赖，升级须重新移植；任意未完成异步 fiber 尚不能取消回收；当前为基础跨端框架，不等同 Kuikly 全量能力或生产发布级质量。
- 2026-11-07：Wasm 浏览器复验暴露协议校验未接纳受控输入新增的 `inputRevision` 字段，已修正 `validProps` 并在真实 Wasm 浏览器重测页面切换、输入/列表、timer、HTTP 全流程通过。
