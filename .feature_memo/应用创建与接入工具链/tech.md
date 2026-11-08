# Technical Notes

## Current Approach

- `scripts/anseronui.mjs` 提供 `create`、`integrate`、`check`、`build` 四个命令。
- `create` 在框架 workspace 内生成 app，使 Core staging 可以复用 `scripts/build-app.mjs`；`integrate` 的外部源码会映射到 staging 虚拟目录。
- `build-app.mjs`/`build-core.mjs` 通过 `ANSERONUI_CONFIG` 和 config.web 字段支持生成应用的页面配置和 Web 入口。

## Key Constraints

- 生成应用复用现有 packages 和 native renderer，不复制框架源码。

## Dependencies and Patterns

- 新应用的 Web 入口由生成器提供；iOS/Android 仍由宿主工程挂载 `AnseronUIRenderView`。

## Risks

- 外部现有项目由 integrate 生成接入清单，原生工程接入仍需业务侧完成。
