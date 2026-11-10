# 技术方案

- 保留原始 RenderProps，系统主题变化只刷新颜色，不往返 Core 或修改布局。
- Web matchMedia 监听，dispose 移除监听；主题刷新跳过输入值、键盘配置、nativeProps 和媒体命令。
- iOS/macOS CALayer 阴影；动画绘制时更新 roundedRect shadowPath。
- iOS 父容器 trait 回调后异步刷新，等待子根视图 trait 传播；appearanceChanged 在 iOS 18+ 主动 updateTraitsIfNeeded。
- AppKit 给 cornerRadius 赋值会开启 masksToBounds；动画绘制前保留 clipsToBounds，绘制结束恢复，显式 overflow 仍生效。
- Android ShadowLayout 在父容器 drawChild 前绘制缓存位图，支持任意方向、颜色和半径；限制 8192 像素维度和 16M 像素面积。
- borderRadius 不隐式裁剪普通容器；显式 overflow:hidden 和滚动视口仍裁剪。阴影与内容裁剪建议两层 View。
- Android 自定义原生容器内部子节点阴影需扩展配合，推荐外层框架 View。
