# 技术记录

- 文档以 `packages/ui/src/index.ts`、Core/Protocol、原生容器和 `scripts/*.mjs` 为依据；没有把历史方案 API 当成已实现接口。
- 根 npm `build:*` 快捷脚本不解析 `--config`；非默认应用使用 `anseronui build <target> --config <path>`，或生成目录自己的构建脚本。
- 默认 Web 输出由 URL 相对路径解析为 `examples/dist/wasm-web`；共享 Core 修改需要 AOT 重编。
- HTTP fixture 使用 `npm run dev:async-form -- --port 5174 --strictPort`；Android 需要 `adb reverse`。
- 生成应用共用原生示例壳和包名，不宣称 `--name` 可配置独立品牌或签名；构建应串行。
- `.gitignore` 对生成 `.so`、`core.wasm`、`core.manifest.json`、生成 Xcode 工程和 Web 示例资源副本使用有依据的规则；不整体屏蔽 IDE 共享配置。
- 适配 Flexily 源码应普通文件入库。布局差分当前依赖本地 `.git` 固定提交，源码包缺失时可 init/fetch 获取对象，不 checkout 覆盖适配源码。
- 根目录本轮已存在 Git 元数据但尚无跟踪文件；本轮只读检查，不改索引。旧摘要“没有 Git 仓库”已不是最新现场。

## 2026-11-08：编译边界核对

- `stage-core.mjs` 为所有配置 pages 生成同一个 entry，包含框架和业务；一份目标产物并非每页独立产物。Host/surface/Wasm 实例创建与二进制划分不同。
- `coreFingerprint` 包含框架、业务源码、配置和工具链输入。页面改变使应用合包过期；不能跳过检查假装更新。
- `compileLibrary` 固定静态 tier；项目 async embedding 只扩展 Promise/await，不开放 Node 的 timers、网络、generator 等 library 禁用面。
- Framework Core / Business Bundle 分离需独立 ABI、Hook/闭包所有权、runtime/内存边界、回调重入和版本协商。当前未实现，未修改编译器或打包代码。
- 官网 compatibility 为动态加载的 Node API 表。本轮读取官网说明入口并核对固定提交的本地 ledger 与 library policy，未引用网站实时支持百分比。命令行直接获取在线数据失败于受限网络 DNS，不影响本地固定版本核对。
