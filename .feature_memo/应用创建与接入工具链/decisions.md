# Decisions

- 2026-11-08：新应用默认生成在 AnseronUI workspace 内，复用共享 packages 和 Core build，避免复制框架源码造成版本分叉。
- 2026-11-08：integrate 只生成配置、最小页面和平台清单，不改写现有业务入口和原生工程，降低接入风险。
