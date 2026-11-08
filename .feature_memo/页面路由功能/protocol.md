# Protocols and Contracts

## API Contracts

- `router.push` / `router.replace` 参数为 `{ page: string }`，方法名分别为 `push` / `replace`。

## Data Models

- 路由栈由宿主维护，Core 只负责发出 `InvokeModule` 请求。

## Storage and Config

- `router` 是框架保留 module，业务侧 `Services.invoke` 不能重复注册此名称。

## Compatibility Notes

- None confirmed.
