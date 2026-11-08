# Core独立构建与计时器

- 状态：done
- 日期：2026-11-08
- 当前重点：实现框架 Core 与业务 SDK/页面独立编译，以及宿主计时器适配。

## 文档
- `brief.md`：目标与验收
- `tech.md`：架构边界
- `protocol.md`：消息 ABI
- `files.md`：涉及文件
- `decisions.md`：决策
- `changes.md`：验证记录
- `handoff.md`：恢复入口

## 完成情况
1. 提取不依赖业务闭包的布局、测量和渲染差分 Core。
2. 独立构建、缓存、原生链接与双 Wasm 加载。
3. setTimeout / clearTimeout 适配与页面销毁清理。
4. 已完成 native/Wasm 页面 AOT、Framework 复用、iOS/Android 构建与文档。
5. WebKit 双 Wasm + DOM 真实计时器集成验证通过（1 秒触发、取消、await 后调度、退出清理）。
