# API 与协议

- `Style`：backgroundColor/dmBackgroundColor、color/dmColor、borderColor/dmBorderColor、shadowColor/dmShadowColor、placeholderTextColor/dmPlaceholderTextColor。
- `RichTextSpan.dmColor`；TextInput props 也接受 dmPlaceholderTextColor，与普通占位颜色分别覆盖 style 同名字段。
- shadowOpacity 默认 0，范围 0..1；shadowRadius 默认 0、非负；shadowOffsetX/Y 默认 0、可正负；阴影颜色默认黑色。
- 所有数值必须有限；协议 minor 由 3 增至 4。
- 颜色原始声明经 Core flatten/JSON 传到宿主；宿主保留声明，依据系统外观选择覆盖。
- 缺失 dm 值回退普通值；浅色忽略 dm 值。没有自动反色。
- 更新 SDK 需 setup 并重建 Core 和宿主。
