# TypeScript 布局库与 scriptc 静态编译调研

调研日期：2026-11-07。目标是复用不依赖 JS 引擎、DOM 或 Wasm 绑定的 TypeScript 布局计算源码，用于 AnseronUI 的共享 LayoutEngine。本轮没有选定生产依赖，也没有修改 scriptc compiler/runtime；主方案第 6 节的有限 Flex 仍是待 P0 验证的基线。

## 结论

有现成候选，`yoga-layout-tui` 的未修改计算源码及公开入口已通过当前 scriptc 静态编译并生成 LLVM IR；这不等于生成的原生程序已执行，也不证明 library embedding、Android/iOS 或 Wasm 可用。`typeflex` 与 `flexily` 均需要源码适配，不能把“纯 TypeScript”直接等同于 scriptc 静态兼容。

| 候选 | 源码与维护情况 | 本轮结果 | 对 AnseronUI 的意义 |
| --- | --- | --- | --- |
| [yoga-layout-tui](https://github.com/cha133/yoga-layout-tui) 0.5.0 | MIT、纯 TS、零运行时依赖、已归档，面向终端 | 内部计算入口及公开入口均生成 LLVM IR；Node 数值探针见下文 | 最接近静态编译原型，但需接管维护并修正终端假设 |
| [typeflex](https://github.com/dead/typeflex) 0.1.0 | MIT、纯 TS Yoga 移植，源码引用 Yoga 1.19.0，最近 push 为 2021-10-20 | Node 两列布局通过；静态编译被 strictNullChecks、初始化与类型问题阻挡 | 可作为移植参考，不能直接使用，旧版本算法需单独审计 |
| [flexily](https://github.com/beorn/flexily) 0.8.5 | MIT、纯 TS/JS，仍在维护，功能较丰富 | Node 两列布局通过；原版缺可选日志模块，禁用日志发现的临时副本仍遇动态属性访问等限制 | 值得评估长期源码移植，当前不是直接可编译依赖 |
| [yoga-layout](https://github.com/react/yoga) | 官方 Yoga 的 C++/Wasm JS 绑定 | 本轮未做 scriptc 探针；不是纯 TS 算法 | TS 类型声明不能代替实现；若选它，应另走宿主原生 Yoga 或独立 Wasm 路线 |

以上“编译通过”特指从固定提交下载的 TS 源码及探针，不表示已验证直接安装 npm 发布包、打包产物或整包全部导出。

## 固定源码与环境

| 项目 | 提交 |
| --- | --- |
| scriptc | `294bb3608da12ae6af7f54f67b47c222c93cb2aa`，compiler 0.2.1 |
| yoga-layout-tui | `1688ea19514d1a055239788c5e00487f28b69036` |
| typeflex | `bd9681e5a275c905df0d6e8484c5285f7279f48a` |
| flexily | `4850f1fb475f8147458059b45fb4f148d14a6ab4` |

Node 为 v24.19.0。全部探针使用 `dynamic: false`，没有启用 dynamic island，没有安装候选包依赖或修改编译器。下载与日志暂存于 `/private/tmp/scriptc-layout-probes-ytngs6rv`；临时文件不是稳定交付依赖，复现时应从上述提交获取源码。

## 实测结果与证据边界

三个库均执行相同的两列布局：300×100 的 row 容器，左侧固定 100×40，右侧 flexGrow=1、高 40。Node 的位置/尺寸输出一致：

```text
0 0 100 40
100 0 200 40
```

`yoga-layout-tui` 通过两组静态编译探针：直接导入 `src/node/node.ts` 的两列布局，以及从 `src/index.ts` 导入公开 Node/枚举的扩展探针。后者覆盖百分比宽度、gap、宽度修改后重排、测量回调和 `freeRecursive()` 的代码生成。它不调用异步 `loadYoga()`，也不证明所有导出都可用。

扩展探针的 Node 实际输出为：

```text
150 160 140
200 210 190
0 0
80 3
```

前两行依次是宽 300/400、gap=10 时左宽 50% 与右侧剩余空间的结果。第四行是列容器内测量叶节点的 80×3 结果，符合该探针预期。第三行是一个待审计边界：根节点的 measure 回调固定返回 37×13，但 `calculateLayout(undefined, undefined, LTR)` 后得到 0×0；尚未建立官方 Yoga 对照，因此只记录观察，不宣称完整兼容或已定位原因。

尝试构建原生 executable 时，后端报 `SC3003`：本机 LLVM native helper 的 `scriptc_package_version` 为 0.2.0，compiler 期望 0.2.1。这是当前工具链版本不匹配；没有绕过检查，也没有原生运行结果。LLVM 生成成功与原生执行验证应分开报告。

`typeflex` 原版静态编译产生 130 条诊断（SC0002×1、SC0001×120、SC1016×9），包括关闭 strictNullChecks、number 字段使用 undefined、字段未初始化等。诊断存在关联，不能把条数解释为独立修复项数量或工期。

`flexily` 原版先在 logger 的可选 `debug`/`loggily` 模块解析失败。本轮临时复制一份并仅替换 logger 为无发现行为的 stub 后，仍产生动态读写异构 `this._style[key]`、嵌套数组类型推断等静态障碍。临时 stub 自身也产生类型诊断，因此不将其总诊断数归因于上游，更不推断删掉日志就能编译。

## 公开入口探针

以下是实际执行并生成 LLVM IR 的探针，置于固定提交的 yoga-layout-tui 源码根目录：

```ts
import { Node, FlexDirection, Direction } from './src/index.js';

const root = Node.create();
root.setWidth(300);
root.setHeight(100);
root.setFlexDirection(FlexDirection.Row);
root.setGap(10);
const left = Node.create();
left.setWidth('50%');
left.setHeight(40);
const right = Node.create();
right.setFlexGrow(1);
right.setHeight(40);
root.insertChild(left, 0);
root.insertChild(right, 1);
root.calculateLayout(300, 100, Direction.LTR);
console.log(left.getComputedWidth(), right.getComputedLeft(), right.getComputedWidth());
root.setWidth(400);
root.calculateLayout(400, 100, Direction.LTR);
console.log(left.getComputedWidth(), right.getComputedLeft(), right.getComputedWidth());
const measured = Node.create();
measured.setMeasureFunc((_width, _widthMode, _height, _heightMode) => ({ width: 37, height: 13 }));
measured.calculateLayout(undefined, undefined, Direction.LTR);
console.log(measured.getComputedWidth(), measured.getComputedHeight());
const container = Node.create();
container.setWidth(80);
container.setHeight(24);
container.setFlexDirection(FlexDirection.Column);
const text = Node.create();
text.setMeasureFunc((width, _widthMode, _height, _heightMode) => ({ width, height: 3 }));
container.insertChild(text, 0);
container.calculateLayout(80, 24, Direction.LTR);
console.log(text.getComputedWidth(), text.getComputedHeight());
root.freeRecursive();
measured.freeRecursive();
container.freeRecursive();
```

本轮用当前 compiler 源码 API 执行 `compile(entry, { outputKind: "llvm", outPath, outDir, dynamic: false })`，具体 runner 如下；这不是已验证的框架 library 构建配置。

```ts
// 此历史探针以独立的 scriptc 源码仓库为工作目录。
import { compile, renderDiagnostics } from './packages/compiler/src/index.ts';
import { writeFileSync } from 'node:fs';
const entry=process.argv[2]!;
const outputKind=(process.argv[3]??'llvm') as 'llvm';
try {
 const r=await compile(entry,{outputKind,outPath:entry+'.'+outputKind,outDir:entry+'.out',dynamic:false});
 if(!r.ok){
  const counts:Record<string,number>={};for(const d of r.diagnostics)counts[d.code]=(counts[d.code]??0)+1;
  writeFileSync(entry+'.diagnostics.json',JSON.stringify(r.diagnostics,null,2));
  console.log(JSON.stringify({ok:false,total:r.diagnostics.length,counts}));
  console.log(renderDiagnostics(r.diagnostics.slice(0,8),r.sourceTexts));process.exitCode=1;
 }else console.log(JSON.stringify(r));
}catch(e){console.error(e);process.exitCode=2;}
```

## 建议与验收门槛

先保留框架自身的 LayoutEngine 抽象，业务组件不直接依赖第三方 Node 类型。以 `yoga-layout-tui` 做短期静态编译原型，并评估 `flexily` 源码移植的算法覆盖与适配成本，再决定采用维护分支还是继续自有有限 Flex。引用或移植源码应保留 MIT 许可与来源记录。

`yoga-layout-tui` 明确省略 flex-wrap、align-content、aspect-ratio、RTL 和 baseline，Config 的 pointScaleFactor 默认 1.0 且面向无亚像素终端布局。移动端需要逻辑单位、渲染边界取整，并审计缓存、dirty 传播、父子引用与 scriptc RC 下的销毁。终端测量不能替代 UIKit/Android/浏览器的字体排版。

三款库提供的同步 measure 回调，也不自动满足主方案的平台异步测量协议。框架需根据约束收集测量请求，由宿主返回结果并缓存，再推进布局；测量缺失不能把临时尺寸当最终提交，保留现有收敛合同。

选型前至少完成：匹配版本工具链上的 Node/native 差分、选定 Wasm 解释器实跑、移动端 library embedding、浮点与取整、嵌套自适应/文本约束/缓存失效、节点移除与销毁，以及真实页面性能和内存测试。此次未执行这些验收，也未运行上游全量测试。

## 主要来源

- [yoga-layout-tui README（固定提交）](https://github.com/cha133/yoga-layout-tui/blob/1688ea19514d1a055239788c5e00487f28b69036/README.md)：目标、功能与明确缺省范围。
- [yoga-layout-tui Config](https://github.com/cha133/yoga-layout-tui/blob/1688ea19514d1a055239788c5e00487f28b69036/src/config/config.ts)：pointScaleFactor 与缓存版本。
- [typeflex 源码](https://github.com/dead/typeflex/tree/bd9681e5a275c905df0d6e8484c5285f7279f48a/src)：移植基线及类型结构。
- [flexily README](https://github.com/beorn/flexily/blob/4850f1fb475f8147458059b45fb4f148d14a6ab4/README.md)、[Node 实现](https://github.com/beorn/flexily/blob/4850f1fb475f8147458059b45fb4f148d14a6ab4/src/node-zero.ts)：算法范围与动态 style 访问。
- [官方 Yoga](https://github.com/react/yoga)：原生引擎与 JS/Wasm 绑定。

## 2026-11-07 后续：flexily 源码改写

本报告的表格与原生工具链阻碍描述属于原库筛选轮次。后续已通过源码改写让 flexily 底层 Node/长度解析探针完成 macOS arm64 原生差分，并在临时目录补齐匹配的官方 0.2.1 helper/runtime pack；详见 [适配验证](./flexily-scriptc-adaptation.md)。createFlexily composable 入口仍未通过；前轮 yoga-layout-tui 的原生执行不因此变为已验证，生产布局选型仍未确定。
