# 性能基线与可变高度列表及页面生命周期

- Status: completed
- Last updated: 2026-11-13
- Current focus: 猛烈甩动与回滑优化完成；最终895帧无空白/反向跳动，80项共享、16项Android与WebReference通过；新版已装模拟器。
- Workspace: `TSNative`

## Document Map

- `../recording-preferences.md`：无额外偏好。
- `brief.md`：用户范围与验收。
- `tech.md`：架构、实现与边界。
- `protocol.md`：API、配置与兼容性。
- `files.md`：主要改动位置。
- `decisions.md`：技术决策与测试环境处理。
- `changes.md`：最终验证记录。
- `handoff.md`：后续维护入口。

## Latest Summary

- 完成可变高度 VirtualList：真实行高、稳定 key、展开/插入锚点、深处定位、宽度变化失效和 O(log n) 高度索引。
- 完成页面可见性、剩余时长计时器、动画/视频暂停恢复、usePageEffect、保活容量和隐藏实例回收。
- 完成 Core/宿主分阶段性能采样、JS/Native/Wasm 基准、PR 预算工作流与真实平台回归。
- 共享框架 73 项、Android 15 项、iOS 26.4 容器 19 项通过；AppKit、WebKit Reference/Wasm 列表与 Web 路由通过。
- 三模式各 120 样本，节点峰值 78、稳定测量缓存 200；详细数值和验证边界见 `docs/performance-baseline.md`。

## Next Actions

- 授权范围已完成，等待用户体验。远端 CI 未运行，代码未提交；其他平台应用产物需正常重编后才能包含最新共享改动。
- 后续若扩展质量门槛，可增加移动设备 FPS/RSS 和 UIKit 大列表专项；iOS 27 示例宿主需要另行接入 UIScene。
