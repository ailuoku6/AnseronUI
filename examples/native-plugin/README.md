# AnseronUI npm 原生插件示例

一个同时支持 iOS、Android、Web 的设备信息插件。发布前请将包名和原生工厂类型改成自己的唯一名称。

在本目录执行 `npm pack` 可生成本地安装包；在 AnseronUI 独立 App 中执行
`npm install /absolute/path/anseronui-example-device-0.1.0.tgz`，然后重新构建目标平台。

```tsx
import { useDevice } from '@anseronui/example-device';
import { Button } from 'anseronui/ui';

function DeviceButton() {
  const device = useDevice();
  return <Button title="读取设备" onClick={async () => {
    const info = await device.info();
    console.log(info.platform, info.version);
  }} />;
}
```

插件协议与发布步骤见仓库根 README 的「发布带原生能力的 npm 包」。此包尚未发布到 npm。

## macOS

示例已增加 `macos/DevicePlugin.swift`，通过 schema 2 显式声明 AppKit 工厂 `AnseronMacDevicePlugin`。应用安装后使用 `npm run macos` 构建运行。原有三端适配继续保留；schema 2 需要包含 macOS 支持的新 AnseronUI SDK，旧 SDK 会拒绝该清单。
