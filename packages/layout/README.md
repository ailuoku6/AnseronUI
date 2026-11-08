# AnseronUI 布局引擎

`@anseronui/layout` 使用本项目克隆并适配的 Flexily 0.8.5 源码进行布局计算。布局算法随共享 TypeScript Core 经 scriptc 编译；宿主接收节点 frame，不需要 Native FFI 或宿主 Yoga。

```ts
import { LayoutEngine, FLEX_DIRECTION_ROW, GUTTER_ALL } from "@anseronui/layout";

const engine = new LayoutEngine("css");
const root = engine.createNode();
root.setFlexDirection(FLEX_DIRECTION_ROW);
root.setGap(GUTTER_ALL, 8);
const child = engine.createNode();
child.setWidth(100);
child.setHeight(40);
root.insertChild(child, 0);
engine.calculateLayout(root, 320, 480);
const frame = child.layout;
// 宿主把 frame.left/top/width/height 应用到真实视图。
engine.dispose();
```

`LayoutEngine` 默认显式选择 `css` preset：row、flexShrink=1、alignContent=stretch；需要其他语义时逐节点设置，或传入 `"yoga"` preset。它沿用 Flexily 的行为，不等同完整 CSS 或 Yoga。现有算法在内部进行整数网格取整，frame 目前按一个逻辑单位量化；尚未增加按设备像素比例配置的连续布局模式，不要在宿主再次独立取整相邻节点的宽度。

一个 engine 对应一个 surface，使用 `createNode()` 创建该 surface 全部节点，不混入其他 engine 的节点。`releaseSubtree(node)` 用于卸载组件子树，清除回调、父子关系并移除所有权记录；从树移除但尚未释放的节点仍由 engine 跟踪。`dispose()` 幂等释放全部节点，包括脱离根树的节点；随后通过 engine 发起的创建和计算会抛错。释放后的原始 Node 句柄不能继续使用。不承诺当前 scriptc runtime 已具有完整实例销毁或长期无泄漏证明。

文本使用 Flexily 的 `setMeasureFunc()` / `setBaselineFunc()`，测量结果必须来自宿主真实文本引擎。回调是同步数值回调，不能返回 Promise，也不能在宿主回调期间重入同一 scriptc 实例。框架 Core 已通过 `MeasureRequest` / `MeasureResult` 和结果缓存对接这些回调，缓存未命中时请求宿主测量并继续布局；布局包本身不提供平台字体测量，也不包含终端 monospace/plugin API。

低层 `Node`、布局常量、`parseLength()` 和类型从同一入口导出。上游完整 composable API 留在 `@anseronui/flexily/upstream`，它供上游 Node 回归使用，不在 scriptc 入口支持范围。

在项目根目录复现：

```sh
npm ci --ignore-scripts
npm run prepare:tools
npm run typecheck:layout
npm run test:layout
npm run test:layout:upstream
```

`test:layout` 使用锁定的 scriptc 0.4.8，重建固定提交上游，比较原版 Node、适配版 Node、适配版 native 的两组历史布局探针，并额外验证 engine 和 native library/C host。所有生成产物留在根目录 `.verification/layout/`，最终摘要在 `summary.json`。验证脚本从 `packages/flexily/UPSTREAM-scriptc-adaptation.json` 读取来源，将固定提交自动获取到 `.verification/layout/upstream.git`，再重建原版差分参照。首次获取需要联网；缓存存在后可离线运行。

`npm run test:layout:wasm` 进一步编译同一 library profile 为 Wasm reactor，并通过 Node 的真实 WASI Preview 1 宿主运行、比较输出，需要 PATH 中有 `zig`。该验证不等于浏览器 DOM 或移动端 UI 接入。

运行上游两组基准：

```sh
npm run bench:layout -- --testNamePattern='^(?!.*Flexily: 5000 nodes)'
```

上式明确排除已知耗时异常的 5000 节点创建项；如要完整基准，去掉筛选。Node 基准不能替代 native/Wasm 性能测试，当前不作跨端性能或小于 5% 回退承诺。跨端宿主文本、移动端 library、浏览器宿主与长期 RC 行为需分别验收，不能由 macOS executable 或 Node WASI 通过推导。

## 源码管理与上游验证

`packages/flexily` 是主仓库直接跟踪源码的普通 workspace 包。上游 Git 历史仅用于差分验证，由脚本保存在忽略的 `.verification/` 目录中。在框架根目录执行：

```sh
npm run test:layout
```

删除 `.verification/layout/upstream.git` 后，下次运行会重新获取固定提交。实际使用入口仍为 `@anseronui/layout`，不是上游完整组合 API。

更多入口：[中文文档](../../docs/README.md) · [能力清单](../../docs/capabilities.md) · [架构与原理](../../docs/architecture.md)。
