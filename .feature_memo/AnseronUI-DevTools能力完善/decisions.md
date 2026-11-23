# 决策

## 2026-11-22

- 延续 staged Debug Core 插桩。业务源码零导入、零注册；Release 从源码阶段排除，不能依赖运行时开关或优化器删代码。
- props/style 按 surface + node/frame path 保存临时覆盖，传给正常组件渲染和宿主布局；Hook state 使用原有 dispatch。成功必须经过 CommitAck 后回读。
- 属性编辑只允许 schema 中基础类型。state 只允许同类型 state[n]，reducer/memo/复杂对象/事件/children/ref 只读。
- CLI 与面板共用 HTTP 命令和查询；服务端分配唯一 requestId/deadline，设备拒绝过期命令，避免断线后延迟执行。
- 复用已有 HTTP/timer 模块，不为每个平台新增调试 socket。截图模块分块返回，避免 64 KiB 单条模块限制。
- Swift 用 #if DEBUG；Android/Harmony 在 Release 编译输入中删除调试块。Android Kotlin 编译任务还需排除插件早期捕获的原始 Java roots，否则生成源码与原始源码重复编译。
- Wasm 必须测试公开协议，不能只验证 JS 私有方法。命令 value 必须声明为 unknown，声明成 number 会使 AOT 无法处理字符串编辑。
- 组件编辑测试必须断言宿主真实文本，不能只断言 frame.props 的检查回读；渲染函数必须接收 overlay 后的 props。
- Web 使用 DOM foreignObject 栅格化；跨域图片、canvas、视频和系统合成层存在截图限制，文档明确说明。
