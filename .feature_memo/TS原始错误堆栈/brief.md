# 需求范围

- 用户要求完善错误堆栈收集和还原，能够捕获 TS 原始堆栈。
- 当前实现聚焦业务 Error 原始栈、原始 TS/TSX 行列映射和全端 Diagnostic 转交；不部署远程平台。
- 验收：真实 Release 原生与 Wasm 产物输出原始源码文件、行列；异步恢复、constructorOpt、源码位置变更缓存均正确；框架捕获边界不丢 stack。
- Native 信号崩溃、OOM、系统强杀不属于 Error 对象路径；不能宣称已经接入原生崩溃符号化。
