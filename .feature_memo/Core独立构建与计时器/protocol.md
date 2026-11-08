# ABI 与 API

- Framework/Business 内部 ABI：`CORE_ABI_VERSION=1`；启动两侧各校验版本，不允许 mismatch。
- 请求：`RenderRequest` 带 surfaceId、generation、revision、round、尺寸、业务 render tree、previous tree、next requestId、文本 measure cache。
- 回复：`RenderResult` 带身份、所有 HostNode frames、MeasureQuery、RenderCommand 与后继 requestId。
- 跨边界用 UTF-8 JSON；两个侧不传闭包、GC 对象、指针或分配器所有权。
- 原生公开宿主 ABI 沿用 `anseronui_core_*`，由 C facade 顺序驱动两份 namespaced scriptc library；Web 两个 Wasm instance 分别拥有 allocator/memory。
- Framework fingerprint 不包含页面/配置；Business fingerprint 包含 config、所有配置 sourceDirs 和业务 SDK。产物复用按 target、source hash、ABI 和 artifact SHA 校验。
- Timer API：`setTimeout(() => void, delay=0): number`、`clearTimeout(handle)`、`useTimers()`。内部复用 `timer.sleep` 和 `CancelRequest`；页面退出清理其余请求。全局异步作用域不明且多 surface 活跃时报 `TIMER_SCOPE_REQUIRED`。
