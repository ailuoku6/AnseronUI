# AnseronUI DevTools

在电脑的浏览器里查看正在运行的 Debug 应用。业务代码不用导入或注册 DevTools。

面板是本机的 Node 服务，默认地址是 `http://127.0.0.1:8091/__anseronui_devtools`。Debug 应用大约每秒把页面、组件、日志、网络和原生调用发到 `http://127.0.0.1:8091/__anseronui_devtools/ingest`。服务没开时，应用照常运行，面板里没有会话。

`npm run ios` 和 `npm run android` 是 Debug 构建，会带上检查器。带 `--release` 的构建，以及 `build:ios:release`、`build:android:release`，不会上报。改过上报地址后要重新构建，地址在编译 Core 时写入。

## 调试 iOS 模拟器或 Android

在应用目录开两个终端。

先启动面板，并保持这个命令运行：

```sh
npm run dev:web
```

终端会打印面板地址。在桌面宽度的浏览器打开：

```text
http://127.0.0.1:8091/__anseronui_devtools
```

再启动要调试的平台：

```sh
npm run ios
npm run android
```

iOS 模拟器和这台 Mac 共用 `127.0.0.1`，所以模拟器能直接连上面的面板。`npm run android` 会执行 `adb reverse tcp:8091 tcp:8091`。模拟器或 USB 连接的设备访问自己的 `127.0.0.1:8091` 时，转到电脑上的面板。

应用打开后，面板的页面列表里出现该会话。点选会话，再看元素、组件、控制台、网络和原生调用。

Android 指定设备：

```sh
npm run android -- --device <adb序列号>
```

`npm run ios` 只启动模拟器。iOS 真机见下一节。

## 调试真机

Android 用 USB 连接时，仍用上一节的 `npm run android`。`adb reverse` 对已连接的设备生效。

iOS 真机访问不到电脑的 `127.0.0.1`。在 Debug 构建前指定电脑的局域网地址，并用能从局域网访问的方式启动面板。生成应用的 `npm run dev:web` 只监听 `127.0.0.1`。自定义 Vite 配置：

```ts
import { anseronuiDevtools } from 'anseronui/devtools/vite';
export default defineConfig({ plugins: [anseronuiDevtools({ host: '0.0.0.0' })] });
```

然后重新构建并安装：

```sh
ANSERONUI_DEVTOOLS_ENDPOINT=http://<电脑局域网IP>:8091/__anseronui_devtools/ingest npm run build:ios-device
```

真机安装和签名见[构建与运行](../reference/build.md)。没有 adb 的 Android 设备用同样的环境变量执行 `npm run android`。地址必须是 `http://` 或 `https://`。

## 调试 Web

`npm run dev:web` 同时启动 Web 应用和面板。修改 TSX 后重新 `npm run build:web`，再刷新 Web 页面。面板进程保持运行。

浏览器里的 fetch 和 XHR 属于该浏览器页面。同一窗口里的多个 Web 宿主共享这些浏览器日志和请求。不同标签页互不影响。这不影响各页面自己的元素树。

## 面板内容

- **页面：** 当前宿主会话。可以选择、刷新，销毁或过期后移除。
- **元素：** 渲染节点的层级、边界、属性和计算样式。
- **组件：** 组件名、层级、props，以及已提交的 state、reducer 和 memo。
- **控制台：** 业务代码里的 `console.log`、`info`、`debug`、`warn` 和 `error`。`console.warn` 出现在 error 分类里，并带有 `warn` 标签。
- **网络：** 通过框架 HTTP 发出的请求。正文上限 64 KiB。
- **原生调用：** 模块名、方法、参数、结果或错误、耗时。HTTP 仍在网络页。

面板不提供截图、从截图点选元素，也不能远程改属性。这些控件是禁用的。

iOS、Android 上的日志来自已插桩的 Core，归到当前页面。原生模块调用归到实际宿主。

## 生产构建

Release 构建不包含检查器，也不复用 Debug 产物。不要在生产入口导入 `anseronui/devtools/client`。

服务中断后，面板会重连。只有模拟器或真机需要走局域网时，才把服务绑到 `0.0.0.0`。

## 在本仓库里看面板

```sh
npm run dev:devtools
```

测试应用在 `http://127.0.0.1:5173/`，面板仍在 8091。可用 `?page=counter` 和 `?page=network` 切换示例页。

面板界面来自 kuikly-devtools 1.0.7。来源和适配见 `packages/devtools/ui/UPSTREAM.md`。
