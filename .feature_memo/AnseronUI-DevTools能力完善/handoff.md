# 接续

从 `index.md` 和 `changes.md` 开始。四项能力已实现，代码未提交或发布。

核心入口：`packages/devtools/instrumentation/editing.inc`、`runtime.inc`、`src/server.ts`、`src/client.ts`。用法见 `docs/diagnostics/devtools.md`，合约见 `packages/devtools/native/PROTOCOL.md`。

Web Reference 面板端到端、真实 AOT Wasm、macOS PNG、iOS/Android/Harmony 模拟器截图与元素/组件点选均已通过。三移动平台还完成滚动120后的页面/节点 PNG 实际像素、裁剪、采样及命中测试。图像/结果在 `.verification/devtools-native-<platform>/`，面板证明为 panel-picked.jpg / panel-component-picked.jpg。

新增回归：`npm run test:devtools:native -- ios|android|harmony`；先启动8091服务，使用 `packages/devtools/test/native/anseronui.config.json` 构建并启动 devtools-native 页面。文档含步骤。测试结束恢复业务背景。iOS/Android 仓库宿主需要 buildId=anseronui-demo。测试构建改写 Harmony 示例配置，验证后需恢复这些生成文件。

Release native Core、macOS Swift、Android class、Harmony HAP/ABC/.so 及 Vite 生产 bundle 的隔离检查已通过。SDK 打包检查通过。用户明确允许内置浏览器访问 http://127.0.0.1:5173 和 http://127.0.0.1:8091，无须再请求授权。

不要在 Core 构建中修改插桩模板；不要并行 staging 同一 target。Wasm 回归前先构建 Debug Core。组件编辑必须验证真实渲染输出；AOT JSON command.value 须 unknown。Android variant Kotlin roots 排除不能回退。原生 fixture 使用 async/await，避免动态 Promise.then；布局需显式 column。

本轮测试服务8091已停止，最终 framework typecheck 和 diff check 通过。

2026-11-23：已修复macOS截图Y轴翻转，非对称像素回归覆盖页面/节点与sample1/2。App已重建重启，8091仍运行供用户验证；见changes.md最新记录。

2026-11-23：npm真实tarball安装→独立create→install/setup→macOS运行→包内面板和inspect全链路验收通过，见changes.md及.verification/npm-devtools-e2e/。新建工程增加devtools脚本/README，打包测试1/1、tooling31通过2skip。临时18091和测试App已停止；原8091仍运行。
