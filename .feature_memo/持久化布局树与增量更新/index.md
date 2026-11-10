# 持久化布局树与增量更新

- Status: done
- Last updated: 2026-11-10
- Current focus: 已安装 iOS 模拟器供用户试用；启动画面发现 Counter 布局异常，待定位。
- Workspace: `TSNative`

## Document Map

- `../recording-preferences.md`: 记录偏好
- `brief.md`: 范围和验收
- `tech.md`: 实现与生命周期
- `protocol.md`: 内部 ABI
- `files.md`: 修改文件
- `decisions.md`: 决策
- `changes.md`: 验证记录
- `handoff.md`: 接续说明

## Latest Summary

- 已按 surface 持有布局树，复用节点与缓存，完成结构/样式/测量增量同步。
- ABI 2 与释放生命周期已接通，Native/Wasm 各 5 个页面和 200 次 owner-thread 生命周期通过。
- 框架 58 测试、构建 7 测试、布局多端差分和旧内核 300 组随机布局对照通过。

## Next Actions

- 后续需定位 iOS Counter 文字挤成竖排的问题；已保留运行现场供用户试用。
