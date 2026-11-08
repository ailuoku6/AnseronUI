# AnseronUI 的 Flexily 源码适配

本目录作为主仓库直接管理的普通 workspace 包，源码基于 `https://github.com/beorn/flexily` 的上游 0.8.5 提交 `4850f1fb475f8147458059b45fb4f148d14a6ab4`，保留 MIT 许可、上游文档与测试。上游 README 中的性能数字不是本项目 native/Wasm 的验证结论。

本地包名为 `@anseronui/flexily`，标记 private，默认入口改为 `src/index-scriptc.ts`：低层 Node、布局常量、长度解析器和类型；上游完整入口保留在 `./upstream`。上游网站、发布和 Bun/vite-plus 开发工具链不参与 AnseronUI 安装，验证工具统一从项目根目录锁定。上游 composable 文本 mixin 不是本次移植范围。

已应用历史报告中的 7 个文件、9 类兼容改写，保留布局算法及原始布局结果；移除核心可选日志调用，避免动态导入。另新增静态入口及对应 tsconfig。后续源代码差异由主仓库的 `git diff` 跟踪；验证脚本将固定上游提交缓存到根目录 `.verification/layout/upstream.git`，首次获取需要联网，缓存后可离线重建。完整来源见 `UPSTREAM-scriptc-adaptation.json`。

框架使用方式见 `../layout/README.md`，适配过程与证据见 `../../internal/design/flexily-scriptc-adaptation.md`。根目录 `npm run test:layout` 验证真实上游、适配源码与 native 输出；`npm run test:layout:wasm` 增加 Wasm reactor 运行。`../layout/validation.json` 保存本轮验证摘要，实时日志和编译产物在项目根目录 `.verification/`。

这里沿用上游整数网格取整和同步数值测量合同。设备像素比例/连续布局模式仍未提供；异步宿主文本缓存及 iOS/Android/Web 集成现已由框架 Core 与 Renderer 承担，不属于 Flexily 包本身。容器查询回调需要由 adapter 显式清理；AnseronUI 的 LayoutEngine 负责其创建的节点，包括离树节点和子树释放。
