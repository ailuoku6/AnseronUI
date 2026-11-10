# 文件

| 路径 | 用途 |
| --- | --- |
| `packages/ui/src/index.ts` | Style、RichTextSpan、TextInputProps |
| `packages/protocol/src/index.ts` | 校验和协议 minor |
| `packages/core/src/business-runtime.ts` | 样式与 span 序列化 |
| `packages/render-{web,ios,macos,android}/` | 四端渲染、主题和阴影 |
| `packages/render-web/test/styles.browser.ts` | WebKit 回归 |
| `examples/native/ios/RenderViewTests.swift` | iOS 原生回归 |
| `examples/native/android/app/src/androidTest/java/org/anseronui/demo/RenderViewTest.kt` | Android 阴影像素回归 |
| `packages/render-macos/Tests/RendererRegression.swift` | AppKit 回归 |
| `docs/styles.md` | 使用文档 |

工作区已有图标与持久化布局等未提交修改，必须保留；本需求部分文件与其重叠。

演示新增：`examples/components/appearance-showcase.tsx`、`anseronui.config.json`；`examples/native/ios/App.swift` 支持 `--page appearance`。
