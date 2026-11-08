# 页面路由

AnseronUI 的页面路由由宿主容器维护栈，TSX 通过 `useRouter()` 发起跳转。页面仍然是 `anseronui.config.json` 中注册的 `definePage`，所以 iOS、Android 和 Web 使用同一套页面名称。

```tsx
import { Button, Text, View, useRouter } from "@anseronui/ui";

function Home() {
  const router = useRouter();
  return <View>
    <Text>首页</Text>
    <Button title="打开详情" onClick={() => { void router.push("details"); }} />
  </View>;
}

function Details() {
  const router = useRouter();
  return <View>
    <Text>详情页</Text>
    <Button title="返回" onClick={() => { void router.back(); }} />
  </View>;
}
```

`Router` 提供以下方法：

- `push(page)`：将已注册页面压入栈并显示。
- `replace(page)`：替换当前栈顶页面。
- `pop()` / `back()`：返回上一页；根页面调用会拒绝；具体错误文本随宿主实现不同（如 `ROUTER_EMPTY`）。
- `current()`：读取宿主当前页面名称。

`push` 和 `replace` 的页面名必须符合小写字母开头的 `a-z0-9_-` 规则，并且必须出现在构建配置的 `pages` 中。导航调用返回 Promise；宿主收到请求后替换渲染容器，旧页面的节点 ref 和未完成服务请求按页面销毁语义失效。当前版本不保留旧页面实例状态，也不传递路由参数；需要跨页数据时使用由宿主持有的 Module 或持久化服务。页面 surface 的 Hook state 以及随运行时重建的模块变量不能当作跨页缓存。

## 宿主行为

`AnseronUIRenderView.load(page)` 从根页面开始并重置路由栈；`push(page)`、`replace(page)` 和 `pop()` 可供原生宿主直接控制栈。Web 的 `BrowserHost` 通过 `PlatformExtensions.router` 注册同样的处理器。路由模块是框架保留能力，业务模块不能再注册名为 `router` 的 module。

页面切换会销毁当前 Core surface，再以新页面创建 surface。切换期间旧页面的动画、ref、定时器、HTTP 请求和模块请求都会按现有销毁流程取消；系统返回键或导航栏返回按钮应调用 `pop()`/`back()`。

系统返回键的拦截见[返回键监听](back-press.md)：宿主先调用 `handleBackPress()`，未消费时再执行 `pop()`。

## 当前边界

本版先覆盖页面栈和跨端跳转，暂不包含路由参数、深链解析、转场动画、页面缓存、嵌套路由和持久化导航状态。需要携带数据时，建议先把数据放入共享模块，再在目标页读取。
