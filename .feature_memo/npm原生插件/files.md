# 文件

- `scripts/native-plugins.mjs`：发现、校验、配置和原生/Web 注册生成。
- `scripts/standalone-app.mjs`：setup/build、应用模板和本地包名映射。
- `scripts/anseronui.mjs`：check 列出插件。
- `scripts/stage-core.mjs`：TS 主入口源码暂存/导入改写。
- `scripts/sdk-files.mjs`：将新工具分发到 npm SDK，排除 Python cache。
- `scripts/templates/app/`：三端工厂入口、iOS 工程/plist、Android Gradle、Core 校验配置。
- `scripts/native-plugins.test.mjs`、`scripts/npm-package.test.mjs`、`package.json`：验证与测试命令。
- `examples/native-plugin/`：可打包设备信息插件。
- `README.md`、`docs/native-extensions.md`：安装、协议、发布和限制。

工作区开始时已有大量用户改动及未跟踪工具文件，未回滚或提交。
