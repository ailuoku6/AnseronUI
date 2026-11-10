# Brief

## User Goal
- 支持路由跳转携带参数；页面 A→B 再返回时页面 A 状态保留，不销毁。

## Scope
- 跨端 `push/replace/getParams` JSON 参数；每个路由栈条目保留页面运行时实例。
- 覆盖 iOS、Android、macOS 和 Web 宿主，提供 TSX 示例与验证。

## Non-Goals
- 进程终止持久化、深链、浏览器历史同步、原生转场动画、内存压力时自动淘汰。

## Acceptance Criteria
- 返回复用原页面 Hook state、控件值及滚动位置。
- 同名页面不同栈条目状态独立；replace 释放旧栈顶；load/销毁释放整个栈。
- 每条 route 能读取自己的参数；JSON snapshot 有大小上限。
