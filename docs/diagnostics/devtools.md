# AnseronUI DevTools

在电脑的浏览器里查看正在运行的 Debug 应用。业务代码不用导入或注册 DevTools。

面板是本机的 Node 服务，默认地址是 `http://127.0.0.1:8091/__anseronui_devtools`。Debug 应用大约每秒把页面、组件、日志、网络和原生调用发到 `http://127.0.0.1:8091/__anseronui_devtools/ingest`。服务没开时，应用照常运行，面板里没有会话。

`npm run ios` 和 `npm run android` 是 Debug 构建，会带上检查器。带 `--release` 的构建，以及 `build:ios:release`、`build:android:release`，不会上报。改过上报地址后要重新构建，地址在编译 Core 时写入。

## npm 创建的应用

DevTools 随 `anseronui` npm 包一起发布，包含面板、服务、CLI、Debug 插桩和各平台宿主支持。独立项目无需克隆框架仓库，也无需另装 `kuikly-devtools` 或在业务页面导入调试代码。

```sh
npx anseronui create hello-app
cd hello-app
npm install
npm run setup
```

在该应用目录的一个终端执行 `npx anseronui devtools`（新建工程也提供 `npm run devtools`），另一个终端执行 `npm run macos`、`npm run ios`、`npm run android` 或 `npm run harmony`。Web 使用 `npm run dev:web`。CLI 同样从应用目录执行 `npx anseronui inspect sessions`，再按下文使用页面 ID 检索记录和详情。命令输出为 JSON；页面 ID 是会话返回的字符串，直接传给 `--pager`。

已有项目升级 `anseronui` 后，重新运行 `npm run setup` 并构建 Debug App，以刷新项目自己的 SDK 和插桩缓存。旧工程没有 `devtools` npm script 时，继续使用 `npx anseronui devtools` 即可。

## 调试 iOS 模拟器或 Android

在应用目录开两个终端。

先启动面板，并保持这个命令运行（无需启动 Web 应用）：

```sh
npx anseronui devtools
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

iOS 真机访问不到电脑的 `127.0.0.1`。先启动允许局域网访问的面板：

```sh
npx anseronui devtools --host 0.0.0.0
```

然后重新构建并安装：

```sh
ANSERONUI_DEVTOOLS_ENDPOINT=http://<电脑局域网IP>:8091/__anseronui_devtools/ingest npm run build:ios-device
```

真机安装和签名见[构建与运行](../reference/build.md)。没有 adb 的 Android 设备用同样的环境变量执行 `npm run android`。地址必须是 `http://` 或 `https://`。

## 调试 Web

`npm run dev:web` 同时启动 Web 应用和面板。Web 使用 JavaScript 运行时，开发服务器会更新 TSX 页面。面板进程保持运行。

浏览器里的 fetch 和 XHR 属于该浏览器页面。同一窗口里的多个 Web 宿主共享这些浏览器日志和请求。不同标签页互不影响。这不影响各页面自己的元素树。

## 面板内容

- **页面：** 当前宿主会话。可以选择、刷新，销毁或过期后移除。
- **元素：** 渲染节点的层级、边界、属性和计算样式。
- **组件：** 组件名、层级、props，以及已提交的 state、reducer 和 memo。
- **控制台：** 业务代码里的 `console.log`、`info`、`debug`、`warn` 和 `error`。`console.warn` 出现在 error 分类里，并带有 `warn` 标签。
- **网络：** 通过框架 HTTP 发出的请求。浏览器正文上限 64 KiB；Core 上报的参数和结果各保留前 4096 个字符。
- **原生调用：** 模块名、方法、参数、结果或错误、耗时。HTTP 仍在网络页。

### 修改属性与状态

选择节点后，点击属性值编辑，Enter 或失焦应用，Esc 取消。也可以通过「＋ 添加属性」查询该节点支持的基础外观、布局和文本属性。组件支持修改已有的字符串、数字和布尔 props；`state[n]` 支持修改同类型的基础值。reducer、memo、函数、事件、children、ref 和复杂对象保持只读。

修改发送到运行中的 Core，通过框架正常渲染、布局和宿主提交，收到 CommitAck 后回读实际值并确认成功。无效类型、失效 schema、已移除节点、页面忙或离线会明确报错。调试覆盖按页面和节点身份保存，普通重新渲染后继续生效，节点卸载或页面销毁后清除；不改写业务源文件。

### 截图与点选

点「截取页面」获取当前宿主真实截图；选择渲染节点后可以「截取节点」。点击截图选中对应元素，右侧显示路径、属性和状态；点击路径中的组件可以检查组件 props 和 Hooks。悬停和选择会标出节点边界。实时模式最多每 2 秒截图一次，面板预览不可见时暂停；采样 2 可降低图片大小。

Web 截图把当前 DOM 样式和图片嵌入后栅格化；iOS、Android、macOS 和 Harmony 使用各自的视图截图 API。Web 的跨域图片、canvas、视频以及部分系统合成内容可能无法完整截取，捕获错误会显示在预览中。节点边界按框架布局和滚动偏移计算，复杂原生变换、系统视频层和虚拟列表需在实际设备上核对。截图通过模块分块返回，不受单条模块结果 64 KiB 限制。

iOS、Android 上的日志来自已插桩的 Core，归到当前页面。原生模块调用归到实际宿主。

## 命令行检查页面

在应用目录执行，或者在仓库中用 `npm run anseronui -- inspect ...`。命令默认连接 8091，`--server http://host:port` 可以指定其他服务。

```sh
npx anseronui inspect sessions
npx anseronui inspect logs --pager <pagerId> --query timeout
npx anseronui inspect network --pager <pagerId> --query /api/search --status 500
npx anseronui inspect native --pager <pagerId> --query CalendarModule
npx anseronui inspect nodes --pager <pagerId> --query SearchBar

npx anseronui inspect network-detail --pager <pagerId> --id <requestId>
npx anseronui inspect native-detail --pager <pagerId> --id <callId>
npx anseronui inspect log-detail --pager <pagerId> --id <seq>
npx anseronui inspect node-detail --pager <pagerId> --id <nodeId>

npx anseronui inspect props --pager <pagerId> --id <nodeId>
npx anseronui inspect state --pager <pagerId> --id <componentId>
npx anseronui inspect edit --pager <pagerId> --id <nodeId> --target p --key width --value '180'
npx anseronui inspect edit --pager <pagerId> --id <componentId> --target s --key 'state[0]' --value '8'
npx anseronui inspect shot --pager <pagerId> --id 0
```

结果是 JSON。列表先过滤再分页，默认 50 条，`--limit` 最大 200，`--offset` 指定偏移。返回 `total`、`hasMore` 和 ID 摘要，正文和完整属性通过详情命令获取。日志还支持 `--level warn`、`--tag <tag>`。`--value` 使用 JSON，字符串要带双引号，例如 `'"新的标题"'`。未知会话、未知 ID、无效参数或设备修改失败时退出码为 1。

`npx anseronui devtools --port 8092 --host 0.0.0.0` 可独立启动服务；修改设备端上报地址后仍需要重新构建 Debug Core。

## 自动插桩与生产构建

业务源码不需要导入或安装 reporter。Core 构建先复制到 `.verification/source-<target>/`，只在 Debug 副本中加入组件名、日志、检查树、编辑和调试传输。原始业务文件不被修改。Vite 插件仅在 `serve` 阶段生效，正式 Vite build 不注入客户端。

Release 构建不包含检查器，也不复用 Debug 产物。Debug/Release、平台、上报地址与插桩模板参与构建缓存身份；原生 Release 宿主还会拒绝链接 Debug Core。Swift 通过 `#if DEBUG` 剔除截图代码；Android 在 Gradle 编译前生成分别用于 Debug/Release 的源文件，Release 不含截图方法；Harmony 在 Release 源码复制阶段剔除调试块。不要在生产入口手动导入 `anseronui/devtools/client`。

普通 `build` 仍然是 Debug。发布使用 `npx anseronui build <platform> --release`，或对应的 `build:*:release` 脚本。

服务中断后，面板会重连。只有模拟器或真机需要走局域网时，才把服务绑到 `0.0.0.0`。

## 在本仓库里看面板

```sh
npm run dev:devtools
```

测试应用在 `http://127.0.0.1:5173/`，面板仍在 8091。可用 `?page=counter` 和 `?page=network` 切换示例页。

真实 Wasm Core 的命令回归测试需要先构建 Debug 产物：

```sh
npm run build:core:wasm
npm run test:devtools:wasm
```

该测试验证快照分块、属性 schema、宿主和组件 props 修改、Hook state、提交确认及截图命令成功和失败回执。截图像素仍需通过实际宿主验证。

### 原生截图回归

仓库提供 `packages/devtools/test/native/anseronui.config.json`。测试页面启动后自动滚动 120，包含固定尺寸的截图目标。先启动 DevTools 服务，再用该配置构建并安装对应平台的 Debug 应用：

```sh
ANSERONUI_CONFIG=packages/devtools/test/native/anseronui.config.json npm run build:ios
ANSERONUI_CONFIG=packages/devtools/test/native/anseronui.config.json npm run build:android
ANSERONUI_CONFIG=packages/devtools/test/native/anseronui.config.json npm run build:harmony
```

安装和启动见[框架示例](../contributing/framework-development.md)。iOS 启动时传入 `--page devtools-native`，Android 启动 Activity 时传入 `--es page devtools-native`；Harmony 配置已指定初始页面。Android 需要 `adb reverse tcp:8091 tcp:8091`；Harmony 需要 `hdc rport tcp:8091 tcp:8091`。启动后执行：

```sh
npm run test:devtools:native -- ios
npm run test:devtools:native -- android
npm run test:devtools:native -- harmony
```

测试通过设备命令临时修改目标背景，验证整页与节点 PNG 的实际像素、滚动后坐标、采样、元素命中及所属组件，结束时恢复背景。iOS 的 Display P3 PNG 通过 macOS ColorSync 转成 sRGB 后检查。结果和图像保存在 `.verification/devtools-native-<platform>/`。存在多个同平台会话时用 `--pager <pagerId>` 指定；服务地址用 `--server <URL>` 指定。

面板界面来自 kuikly-devtools 1.0.7。来源和适配见 `packages/devtools/ui/UPSTREAM.md`。
