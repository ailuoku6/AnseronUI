# Technical Notes

## Current Approach

- `packages/ui` 暴露 `Router` 和 `useRouter()`；`packages/core` 将路由调用编码为保留的 `router` module 请求。

## Key Constraints

- iOS `AnseronUIRenderView`、Android `AnseronUIRenderView` 和 Web demo host 各自维护 route stack；同一容器替换 current surface。

## Dependencies and Patterns

- 旧 surface 的 ref、动画和未完成 module 请求沿用已有 destroy/retire 生命周期。

## Risks

- 页面跳转期间，旧页面的异步工作会按现有页面销毁流程取消。
