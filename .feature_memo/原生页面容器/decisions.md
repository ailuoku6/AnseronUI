# 决策

## 2026-11-07

- 在 View 层组合 Host，保留现有低层 API。
- 显式销毁，避免临时 detach 丢失页面状态。
- 每次 load 使用独立根视图和 generation，隔离异步生命周期。
