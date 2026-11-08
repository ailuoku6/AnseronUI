# Decisions

- **2026-11-08：在 Android Renderer 兼容两种 spans 形态。** 协议层保持 scalar JSON 约束，避免改变跨端协议；直接 JSONArray 仍可用于原生测试和调用方。
- **2026-11-08：禁用按钮使用文字 ColorStateList + alpha。** 通用 GradientDrawable 覆盖 Android 默认按钮背景后，系统 disabled tint 不再可靠；在 Renderer/动画层显式表达禁用视觉。
