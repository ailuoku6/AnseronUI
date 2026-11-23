# AnseronUI DevTools 能力完善

- 状态：done
- 更新：2026-11-22
- 当前：四项能力已实现；iOS、Android、Harmony 均完成模拟器实际截图像素、面板元素/组件点选、属性编辑和滚动后节点裁剪验证。
- 入口：`brief.md` 目标；`tech.md` 架构；`protocol.md` 合约；`files.md` 文件；`decisions.md` 决策；`changes.md` 验证；`handoff.md` 接续。
- 已确认：Debug staging 自动插桩；Release Core 无检查器代码，宿主截图代码由平台编译或源码 staging 排除。
- 验证：Web 面板、真实 AOT Wasm、macOS PNG，三移动平台模拟器验收通过。视频/系统合成层和复杂变换仍需专项设备核对。
- 代码未提交、未发布。
