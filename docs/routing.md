# 页面路由

AnseronUI 的页面路由由宿主容器维护栈，TSX 通过 `useRouter()` 发起跳转。页面名称来自构建配置中注册的 `definePage`，iOS、Android 和 Web 使用同一套名称。

```tsx
import { Button, Text, View, definePage, useEffect, useRouter, useState } from "@anseronui/ui";
import type { RouteParams, UIElement } from "@anseronui/ui";

function Home(): UIElement {
  const router = useRouter();
  const [count, setCount] = useState(0);
  return <View>
    <Text>计数: {count}</Text>
    <Button title="+1" onClick={() => setCount(value => value + 1)} />
    <Button title="打开详情" onClick={() => { void router.push("details", { source: "home", count, filter: { active: true } }); }} />
  </View>;
}

function Details(): UIElement {
  const router = useRouter();
  const [params, setParams] = useState<RouteParams>({});
  useEffect(() => { let active = true; void router.getParams().then(value => { if (active) setParams(value); }); return () => { active = false; }; }, []);
  return <View>
    <Text>来源: {String(params.source)}，计数: {String(params.count)}</Text>
    <Button title="返回" onClick={() => { void router.back(); }} />
  </View>;
}
```

`push(page, params?)` 把新条目压入栈。`replace(page, params?)` 只替换栈顶；`pop()`／`back()` 返回上一条目；根页面调用会以 `ROUTER_EMPTY` 拒绝。`current()` 返回当前页面名称，`getParams<T>()` 返回当前条目的参数快照，缺少参数时为 `{}`。`RouteParams` 只接受 JSON 值（字符串、有限数字、布尔、null、数组和对象），不得传函数、循环引用或未支持的对象。

参数随导航条目保存，调用时立即复制，不会受调用方之后修改对象影响。每次导航参数上限 48 KB；超出时以 `ROUTE_PARAMS_TOO_LARGE` 拒绝。入栈同一页面两次会创建两个独立实例，各自持有不同状态和参数。

## 页面状态

`push` 后，原页面 surface、Hook state、输入值、滚动位置、动画、引用和运行时状态均保留在导航栈中，暂时从可见层级分离。`pop` 恢复原实例，不重新挂载页面；`getParams()` 读取的是调用它的页面条目参数。隐藏页面不应继续发起导航；只有栈顶条目可以执行 push／replace／pop。

移除条目的生命周期如下：

- `pop`：销毁刚离开的栈顶页面，恢复下一条原实例。
- `replace`：销毁被替换的栈顶页面，较早的页面保持不变。
- `load(page, params?)`：销毁整个旧栈并创建一个新的根页面。
- 宿主销毁：销毁栈中所有页面。

销毁条目会取消其未完成服务请求和订阅，失效原生组件 ref，并释放该页面持有的传输文件引用。页面可另外通过 `useEffect` 清理需要暂停的计时器或后台资源。平台在同一容器内复用独立页面实例；不承诺跨进程持久化、进程终止后恢复、原生系统路由动画或内存压力下的页面回收。

## 宿主接口

原生 `AnseronUIRenderView.load(page, params)` 重置整个栈，`push(page, params)`／`replace(page, params)`／`pop()` 直接操作栈。`routeStack` 与 `routeParams` 提供当前导航信息。

Web 使用 `BrowserPageStack` 保存同一套页面实例及状态：

```ts
const stack = new BrowserPageStack(container, async (root, page, router) => {
  const host = new BrowserHost(root, await loadRuntime(), undefined, { router });
  await host.mount(page, root.clientWidth, root.clientHeight);
  return host;
});
stack.router.load('home', { source: 'app' });
```

传给 BrowserHost 的 `router` handler 需由 `handlerFor` 或 `BrowserPageStack` 按导航条目绑定。Web 页面栈协调容器 attach/detach、resize、返回键与页面销毁。路由模块是框架保留能力，业务扩展不可注册同名 `router` module。

系统返回键先交给当前页面 `handleBackPress()`；页面未消费时再执行栈返回。Web 浏览器的系统前进／后退历史不与内存路由栈同步；集成入口应按需自行拦截浏览器返回键。
