# Changes

## 2026-11-24

- 完成纯文本 API、参数预处理、组件 owner 生命周期、示例与公开文档。
- 修复 Android numberOfLines=0 语义，新增仪器回归。
- `npm run typecheck:framework`：通过。
- `npm run test:framework`：30 文件、321 测试通过（其中本次14项）。
- `npm run test:build`：20项通过。首次发现新增浏览器测试遗漏 CI 注册，已补齐；HTTP fixture 需沙箱外端口权限。
- `npm run test:tooling`：31通过，2项原生图标测试按配置跳过。
- `npm run build:core:native`、`npm run test:core:native`：通过，5个示例。
- `npm run build:core:wasm`、`npm run test:core:wasm`：通过，5个示例。
- WebKit text-measurement 与 text-measurement-wasm：均通过，断言实际 Text 折叠/展开高度、结果尺寸与 probe 清理。
- WebKit 沙箱内无法启动子进程，获批在沙箱外运行后通过。
- `npm run test:macos -- --text-measurement`：通过，实际 AppKit Text 折叠、展开、再次折叠高度与测量结果一致。编译存在原有系统服务 Swift Sendable/actor 警告。
- Android 当前设备在线；本机可见 JDK11/21/25，但项目测试入口要求 JDK17，仪器回归未运行。
