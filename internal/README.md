# 内部资料

`internal/` 保存框架设计记录、实验说明和验证结果。这里的内容用于维护和追溯，不定义面向 App 开发者的稳定 API。

## 设计记录

- [AnseronUI 框架设计](design/anseronui-framework.md)：框架目标和主要设计决策。
- [HarmonyOS 原生支持](design/harmonyos-native-support.md)：平台架构、实现计划和验收边界。
- [macOS 与 HarmonyOS 支持方案](design/macos-harmony-support.md)：平台方案和实施记录。
- [Flexily 与 scriptc 适配](design/flexily-scriptc-adaptation.md)：布局源码的静态编译适配证据。
- [布局库调研](design/ts-layout-libraries-research.md)：布局实现选型资料。
- [框架实施状态记录](design/framework-implementation-status.md)：阶段性验证快照。

## 实验

- [Flexily/scriptc 实验](experiments/flexily-scriptc/README.md)：布局源码编译探针。
- [HarmonyOS Runtime 实验](experiments/harmony-runtime/README.md)：原生运行时验证记录。

## 验证报告

- [HarmonyOS API 21 报告](verification/harmony-api21-report.md)
- [HarmonyOS 视觉与组合验证](verification/harmony-visuals-and-composition.md)
- [多平台共享按钮验证](verification/shared-button-three-platforms.md)
- [外观与文本布局验证](verification/appearance-text-layout.md)
- [2026-11-13 性能验证快照](verification/performance-baseline-2026-11-13.md)

平台日常使用说明见[文档目录](../docs/README.md)。贡献入口见[CONTRIBUTING.md](../CONTRIBUTING.md)。测试命令和维护流程见[框架开发指南](../docs/contributing/framework-development.md)。
