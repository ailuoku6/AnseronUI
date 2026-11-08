# Handoff

Resume from `index.md`.

Current state:
- 已完成 `scripts/anseronui.mjs` 工具链：`create` 生成完整 workspace app，`integrate` 生成现有项目接入文件，`check` 校验配置，`build` 选择 target 并复用框架构建链路。

Most relevant files:
- `scripts/anseronui.mjs`、`scripts/build-app.mjs`、`scripts/build-core.mjs`、`scripts/stage-core.mjs`、`docs/tooling.md`。

Need next:
- 未来如需产品化，发布独立 npm CLI 并增加 CocoaPods/Gradle 自动接入。

Watch out:
- `create` 目标必须在当前 AnseronUI workspace 内；`integrate` 不会自动修改现有原生工程。
