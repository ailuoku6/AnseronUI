# 细粒度更新验证记录

日期：2026-11-23。实现合同：[保持 TSX 与 Hooks 写法](../design/fine-grained-reactivity.md)。

## 实现范围

- Hook slot 直接定位 owner；脏路径、Context 消费者、backPress 与节点索引支持局部调度。
- 持久输出 region/node，逐记录 draft 与 ACK 发布，不为局部字段更新复制全树。
- TypeScript Program/TypeChecker 识别框架符号，生成静态宿主模板、动态字段与结构槽。未知调用、JSX 逃逸及不可证明的路径使用普通 JSX。
- 组件仍可完整求值。静态常量提升和动态输出比较消除无关输出遍历。通用纯计算 DAG 属可选优化，当前不缓存任意业务表达式。
- ABI 3 增量节点事务、测量 round、Finalize/Abort/Reset、有限幂等历史及双向 CoreWire 分片。
- Flexily 变化 observer；跨 round frame 候选与最终 committed 几何比较；绘制字段零布局。
- 宿主协议 2.0：PatchProps、DetachChild、拓扑预检、完整事务分片、重复确认、reset 旧事务拒绝。
- 五端字段 handler、触及节点/滚动/动画集合，输入原子 value/inputRevision 校正。
- 超时重传同一事务；ACK 后等待 Core Finalize，再发布回调/ref/effect。
- reset 保留逻辑状态，旧 handle 失效；清理并重建 effect/ref/imperative handle 资源。
- DevTools 编辑与撤销使对应 owner 失效；构建指纹覆盖 compiler/ABI/注入；SDK 包含新增源码。

业务 TSX 和公开 Hooks 写法保持兼容。Framework、Business 和宿主必须使用匹配的新协议构建。

## 自动化结果

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| framework | 24 文件、129 测试通过 | `.verification/fine-framework.log` |
| framework typecheck | 通过 | `.verification/fine-typecheck.log` |
| build inputs/compiler | 7 测试通过 | `.verification/fine-build-tests.log` |
| tooling | 31 通过、2 跳过 | `.verification/fine-tooling.log` |
| DevTools | 9 通过 | `.verification/fine-devtools.log` |
| DevTools Wasm AOT | 快照、schema、宿主/组件/state 编辑及截图成功/失败通过 | `.verification/fine-devtools-wasm.log` |
| Harmony 适配/拓扑/工具 | 57 通过 | `.verification/fine-harmony-tests.log` |
| npm SDK portable package | 1 通过 | `.verification/fine-package.log` |
| npm pack dry-run | 通过，2112 文件、13.1 MB 压缩包 | `.verification/fine-pack-dry-run.log` |
| Native AOT Core | counter/async-form/components/extensions/timers 全过 | `.verification/fine-native-tests.log` |
| Wasm AOT Core | 同上五页全过 | `.verification/fine-wasm-tests.log` |
| 布局 Wasm 差分 | probe-layout 421 行、probe-advanced 596 行、engine 16 行一致 | `.verification/fine-layout-wasm.log` |
| 布局 Native 差分 | 同上三组一致 | `.verification/fine-layout-native.log` |
| Flexily | 2648 通过、1 跳过、0 失败 | `packages/flexily/.verification/fine-flexily.json` |

Core 回归包括固定 seed 的 50 步约束/字段/重排全量布局对照。专门的多轮测量测试覆盖：A 首轮变化、后续命中缓存；兄弟因占位尺寸临时移动、最终回到原几何。仅最终变化输出 SetFrame。

## 真实平台

| 平台 | 环境与结果 | 证据 |
| --- | --- | --- |
| iOS | iPhone 17 Pro / iOS 26.4 模拟器，28 Renderer + 14 UI 全过 | `.verification/fine-ios-final.log`、`fine-ios-final.xcresult` |
| Android | Huawei VOG-AL10 / Android 10，33 项中 32 通过、1 按 API 跳过，无失败 | `.verification/fine-android-final.log`、设备测试 XML |
| macOS | 实际 AOT Core + AppKit 集成通过 | `.verification/fine-macos-final.log` |
| Web | 真实 WKWebView DOM；extensions/styles/accessibility/routing/layout/virtual-list 通过 | `.verification/fine-web-*.log` |
| Web/Wasm | 独立 Business/Framework Wasm；split/accessibility-wasm/virtual-list-wasm 通过 | `.verification/fine-web-*-wasm.log`、`fine-web-split.log` |
| Harmony | API 21 Core、C++、ArkTS、unsigned HAP 构建通过；无连接设备 | `.verification/fine-harmony-build.log` |

Android 跳过项是硬件背景模糊，要求 API 31。字段补丁、输入本地编辑保持、unset 默认值、同 revision 重放/冲突、媒体像素和播放/暂停已实际验证。iOS 新增同类输入/字段测试通过。完整 UI 覆盖原生扩展、ref、无障碍、动画、触摸、滚动、导航与 HTTP。

WebKit Reference 和 Wasm 的虚拟列表均使用 5000 条数据、最多 32 行实际挂载，验证展开、20 次滚动、深处定位、头插锚点、隐藏/恢复及 resize。Wasm 样本线性内存容量为 Business 16121856 / Framework 20381696 字节；它包含分配器空闲空间，不等于活对象或峰值 RSS。

Harmony 的 TopologyDraft C++ 测试验证 10000 次 paint-only 预检零图查询、环/叶父节点/非法位置/重复节点拒绝、草稿隔离和幸存后代脱离。构建通过不能证明 ArkUI 控件、输入法或媒体在设备上的行为。

## AOT 细粒度硬门槛

环境：macOS Darwin 27.2.0 / arm64 / Apple M5 / Node v24.19.0 / scriptc 0.4.8。每个规模预热 3 次，更新采样 12 次。

场景 A：100/1000/10000 个实际挂载独立分支，一叶 opacity 更新。

- logicalEvaluations=1，scopeVisits=2，reconciledNodes=1。
- Core patch=1，layoutVisited=0，ACK 日志=4，Core 请求=407 UTF-16 单元。
- 恰好一条 PatchProps；没有 MoveChild、SetFrame 或测量。
- 每次输出小于 8 KiB，计数不随无关分支规模增长。

| 模式 | 挂载分支 | 冷挂载 ms | 更新 p50 ms | 更新 p95 ms | 最大更新输出 bytes |
| --- | --- | --- | --- | --- | --- |
| native | 100 | 575.4 | 0.428 | 0.670 | 1958 |
| native | 1000 | 397.5 | 0.939 | 2.153 | 1960 |
| native | 10000 | 31358.7 | 2.773 | 17.643 | 1962 |
| wasm | 100 | 293.2 | 1.553 | 3.066 | 1958 |
| wasm | 1000 | 557.5 | 1.602 | 5.085 | 1960 |
| wasm | 10000 | 39810.4 | 13.131 | 47.590 | 1963 |

场景 B：页面自身持有状态，1001 个静态宿主节点，2 个动态槽（事件闭包、style）。Native/Wasm 均验证 12 次更新：组件求值 1、作用域访问 2、动态槽检查 2、节点协调 1、Core patch 1、布局 0、单条 opacity PatchProps，更新输出 1960 bytes。

计时包含标准输入输出通信，Renderer 和测量传输为合成实现。并行编译与 GC 会影响延迟；这些数据证明结构工作量，不构成同设备优化前后加速倍数、恒定墙钟时间或原生屏幕呈现时延保证。10000 分支冷挂载仍昂贵，结构列表路径成本与列表规模有关。

源报告：`.verification/performance/fine-native.json`、`fine-wasm.json`；可复跑命令见[性能指南](../../docs/diagnostics/performance.md)。性能 fixture 后已恢复默认 native/Wasm 业务构建，两种模式的五页面回归均通过。

## R1–R7 对照

| 项 | 当前回归 |
| --- | --- |
| R1 输入同值 | 过滤回原值、无 setter 拒绝、旧 token/IME、原子字段组与平台输入状态 |
| R2 身份 | 条件同位置同类型保留 state/effect；模板结构槽透明；普通/优化 lowering 对照 |
| R3 输入闭合 | 父子同脏、多级 props 与实际 Context 消费者隔离 |
| R4 缓存隔离 | 完整组件求值；memo/Hook draft/watermark；未提交不发布，安全回退 |
| R5 多轮 frame | 首轮变化跨测量保留、临时几何回退、50 步全量布局对照 |
| R6 reset | state/ref 容器保留、effect 资源重建、捕获物理 handle 的 imperative handle 重建可用 |
| R7 生命周期 | 干净父 effect 不重跑；同值逻辑求值、闭包和已提交生命周期；几何 oracle 独立 |

## 验收边界

- Harmony 无连接设备。待设备可用运行 `test:harmony:device` / `test:harmony:demo` 并覆盖输入、媒体、无障碍、扩展与恢复。
- 不承诺任意 TS 计算自动 O(1)。动态数组、结构列表和保守回退按其实际输出成本协调。
- 没有新增进程峰值 RSS、GPU 或移动设备 FPS 硬预算；节点/缓存释放测试不证明所有平台资源均无泄漏。
- 原生网络请求等外部副作用不承诺 exactly-once。恢复 setup/cleanup 合同见[生命周期](../../docs/guides/navigation/page-lifecycle.md)。
- 代码在当前工作区，未提交、未发布。

收尾检查：`git diff --check` 通过；19 份相关文档的本地链接、代码围栏及末尾换行检查通过。Android 临时保持唤醒设置和 HTTP 端口映射已恢复/清理；本轮 HTTP fixture 已停止。npm dry-run 使用 `/tmp/anseronui-fine-pack-cache`，避免写入当前不可写的全局 npm 缓存。


## 渲染器跟进（2026-11-24）

- macOS standalone `backgroundBlurRadius` 使用 AppKit `NSVisualEffectView` 在窗口内实时合成；模糊层与业务前景分层，圆角裁切只应用于模糊层。iOS 同样使用系统视觉效果视图。AppKit regression 覆盖透明材质档位、前景层级、圆角、属性更新、焦点与 IME。
- Android 虚拟列表保留 OverScroller 原生速度至已挂载窗口边缘，只在窗口耗尽时限制位移。真机 HUAWEI VOG-AL10 Android 10：虚拟列表六次双向快滑、原生速度/边界、锚点、触摸仲裁、停手后覆盖与视口裁剪测试通过。

macOS 已按系统材质方案重建。Android 修复 APK 已安装并启动 `virtual-list`，测试临时常亮设置已恢复。日志：`.verification/blur-macos-native-renderer-tests.log`、`.verification/blur-macos-native-build.log`、`.verification/fling-android-tests.log`、`.verification/fling-android-related-tests.log`、`.verification/fling-android-velocity-test.log`。
