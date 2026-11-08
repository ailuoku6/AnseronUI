# Protocols and Contracts

## API Contracts

- `create <directory> [--name name] [--force]`。
- `integrate <existing-project> [--name name] [--force]`。
- `check [--config path]`。
- `build <ios|ios-device|android|web> --config path`。

## Data Models

- 配置可包含 `web.viteConfig` 和 `web.publicDir`，用于生成应用的 Web/Wasm 构建输出。

## Storage and Config

- `buildId` 使用小写字母开头的工作区应用标识，不再限制为 demo 固定值。

## Compatibility Notes

- None confirmed.
