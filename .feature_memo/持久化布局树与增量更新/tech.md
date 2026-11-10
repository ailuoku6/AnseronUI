# 技术方案

- 每个 ReferenceRuntime 拥有 LayoutKernel；原生/Wasm Framework archive 的模块级 Kernel 由独立 runtime 实例隔离，并仅在 owner thread 执行。
- Kernel 按 surfaceId 持有 SurfaceLayout，generation 更新替换旧实例。稳定 node ID 映射 LayoutRecord/Flexily Node。
- 每轮传递完整 JSON 描述树、已提交树与测量缓存；内核按 ID 增量同步布局节点，按布局样式签名跳过未变化 setter；变化时补齐缺省值，避免删除样式残留。
- 删除节点先解除父子关系，再移动保留节点，最后释放，支持被删除父节点中仍保留的后代、重排、跨父移动与祖先反转。
- 测量回调不捕获旧 RenderRequest，读当前轮缓存。文本/字体变化、surface 宽度变化、占位尺寸、已使用缓存项变化使节点 markDirty。每轮结束清空对请求缓存的引用。
- LayoutEngine 所有权登记使用 Set<Node>，保留插入顺序与倒序 dispose，避免批量删除时重复扫描/移动数组。
- 原有宿主 Commit diff、ACK/effect/ref 语义保留。本阶段未做增量消息、挂载命令精简或并发调度。
