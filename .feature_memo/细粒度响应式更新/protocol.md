# 当前协议

- Core ABI 3：BeginRender、ContinueRender、Prepared、FinalizeRender、AbortRender、ResetSurface、ReleaseSurface。
- 正常更新只发送 Create/Patch/Children/Delete 增量；JSON 双向分片默认单片 1 MiB、消息 32 MiB。
- 宿主协议 2.0：PatchProps(set/unset)、DetachChild、CommitBegin/Chunk/End、幂等 ACK、ResetSurface。
- Commit 上限 16 MiB / 65536 命令；每片最多 4096 命令，按 UTF-8 核算。
- value/inputRevision 原子组；独立 inputSyncDirty 校正同值过滤和拒绝输入。
- 宿主 ACK → Core Finalize 确认 → Business 发布 → ref/onLayout/effect。
- reset 保留逻辑 state/ref 容器，退役旧 NodeHandle，重建物理树和全部 effect/ref 资源；旧事务下界拒绝迟到消息。
- Framework、Business 与宿主必须匹配版本；业务继续现有 TSX/Hooks。

具体合同见主设计第 4–13 节。
