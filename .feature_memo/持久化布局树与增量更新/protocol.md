# 协议

- CORE_ABI_VERSION 升为 2，Framework/Business/Native facade/Wasm adapter 和构建 manifest 同步。
- CoreRequest = RenderRequest(type=Render) | ReleaseSurfaceRequest(type=ReleaseSurface, abi, surfaceId, generation)。
- CoreResult = RenderResult(type=RenderResult) | SurfaceReleased(type=SurfaceReleased, abi, surfaceId, generation)。
- surface 销毁过滤仍排队的该 generation 请求并排队 ReleaseSurface；直接组合时同步调用 Kernel.execute。整体实例 dispose 由 adapter 显式调用 Framework.dispose 清空所有布局树。
- 迟到旧 generation 的 ReleaseSurface 不删除新树；低于当前存活 generation 的 Render 拒绝执行。
- 外部宿主协议 major 1 / minor 0、C transport 和 TSX API 保持现有语义。内部自定义 RuntimeOptions.renderCore 回调现在处理 CoreRequest/CoreResult 联合类型，须处理释放消息。
- ABI 1 产物不能与 ABI 2 混用，升级后需重建 Framework 与 Business。
