# Protocols and Contracts

## API Contracts

- `useRouter().push(page)`, `replace(page)`, `pop()`, `back()`, `current()`；页面必须已在 `anseronui.config.json` 注册。
- `CommonProps.onBackPress?: () => boolean`：同步返回 `true` 消费返回键，`false` 交给宿主后续流程。
- 宿主接口：Android/iOS `handleBackPress(): Boolean/Bool`；Web `await handleBackPress(): Promise<boolean>`。

## Data Models

- Input payload：`{ type: "BackPress" }`。
- Output payload：`{ type: "BackPressResult", consumed: boolean }`。
- manifest page：至少包含 `name`, `source`, `export`；宿主使用 `name` 建立页面入口。

## Storage and Config

- `anseronui.config.json` 的 `pages` 是唯一页面注册清单；构建阶段复制为原生 `core.manifest.json`。
- 页面路由栈只由当前容器维护，旧页面销毁后其回调和 ref 失效。

## Compatibility Notes

- Android 系统返回键已接入 generic host；Web 监听 Escape/BrowserBack。
- iOS 无 Android 风格统一物理返回键，必须从导航控制器、返回按钮或手势回调中调用容器方法。
