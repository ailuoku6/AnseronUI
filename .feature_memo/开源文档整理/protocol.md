# API 与配置约定

- 本轮未修改任何运行时 API、协议版本或默认行为。
- 触摸：捕获和冒泡都能同步 `stopPropagation()`；滚动交接由 `touchAction` 决定。
- Router：页面需在清单中注册；没有页面缓存、路由参数与深链；跨页持久数据应存放宿主 Module/持久化服务，不能依赖重建运行时中的页面 state。
- Module：`http`、`timer`、`__view`、`router` 为保留名；通用调用异步，一次请求只完成一次。
- ref：节点提交 ACK 后绑定；动画 API 补入方法表。
- Config：`sourceDirs`、`pages[].source`、`web.viteConfig`、`web.publicDir` 按框架根目录解析；`buildId` 不是原生包名。
- `check` 只做基础结构、export 标识符/重复和文件存在性校验，不证明实际导出存在或 AOT 可编译。
- 图片/视频示例使用明确尺寸，业务媒体需按 iOS bundle/Android assets/Web public 约定打包。

## 本轮文档补充，不改变协议

- 区分框架源码、应用 Core 合包、运行时实例/surface。
- 业务写法分四层：TSX lowering、scriptc 静态语言子集、library/Wasm embedding、平台宿主 API。
- JSX 属性展开/小写 DOM 标签/条件 Hook/顶层 Hook 有明确诊断；不能将 JSX spread 拒绝概括为所有对象 spread 被禁用。
- 固定版本原生 checked values 的支持不等于任意 any 或 dynamic slot 回退可用。
- 网络/延迟使用 services.http.getText / services.sleep，系统能力由 Module 提供。
