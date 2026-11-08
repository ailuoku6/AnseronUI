# 技术实现

`scripts/native-plugins.mjs` 遍历应用的已安装生产依赖（含传递/可选，不遍历 dev/peer）。清单仅为数据，不执行包内安装脚本。解析包路径兼容 scoped、exports 隐藏 package.json、nested node_modules 和 npm workspace symlink。

生成 `.anseronui/plugins/` 的 Swift/Kotlin/Web 工厂合并代码与平台 JSON。生成文件内容不变时不写入，变化时原子替换。iOS 工程生成脚本加入 Swift 源码、系统框架和合并 plist；Android app Gradle 加入源码、Maven implementation、Debug/Release 权限 overlay。入口模板自动注入注册表。

共享 TS 主入口与其目录加入应用专用 build.config，staging 重写包名并将其放到 `__npm_plugins__`，避免 scriptc 将 node_modules 路径当成不支持的 npm 静态依赖。源码进入 Core 指纹。local-framework 新建应用额外生成公开包名的 TS/Vite 映射。

限制：不自动处理 Pods/SPM、二进制 SDK、资源、entitlements、复杂清单；旧生成应用需迁移模板，integrate 模式保留手动接入。共享代码仍受 AOT 子集约束。
