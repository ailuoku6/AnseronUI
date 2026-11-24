# 页面保活、生命周期与内存

导航覆盖页面时保留实例，并将它设为不可见；返回仍保留的条目会恢复原 Hook state、输入和滚动位置。页面可见性还会结合应用/窗口与外部容器的状态。隐藏后暂停新渲染和 UI 事件处理，恢复后提交隐藏期间积累的状态更新。隐藏前已经开始的布局/提交会完成，以保持协议事务一致；需要采集稳定隐藏快照时，应等宿主返回 `hiddenSurfaces: 1` 且 `pendingRenders: 0`。原生可见性通知通过 Core 所在线程异步处理。

`useEffect` 仍表达挂载与卸载。需要随显示/隐藏停止和重新启动的资源使用 `usePageEffect`：

```tsx
import { usePageEffect, usePageVisibility, useServices, useTimers } from 'anseronui/ui';

const services = useServices();
const timers = useTimers();
const visible = usePageVisibility();
usePageEffect(() => {
  // 以网络状态订阅为例；其他原生订阅使用相同清理方式。
  const stop = services.network.subscribe(event => {
    console.log(event);
  });
  const timer = timers.setTimeout(() => console.log('refresh'), 1000);
  return () => { stop(); timers.clearTimeout(timer); };
}, []);
```

订阅参数应按对应原生能力填写，详见[标准系统能力](../services/native-services.md)。`services.page.isVisible()` 可同步读取，`services.page.subscribe(listener)` 可直接监听并返回取消函数。重复设置相同可见性不会重复触发 setup/cleanup。依赖数组语义与 `useEffect` 相同；没有 cleanup 的工作需要自行确保可重复启动。

| 资源 | 隐藏行为 | 恢复行为 |
| --- | --- | --- |
| 框架 `setTimeout` / `useTimers()` | 取消宿主请求，保留剩余时长和回调 | 以新 requestId 继续剩余时间，忽略迟到的旧结果 |
| `usePageEffect` | 执行 cleanup | 重新执行 setup |
| 声明式/ref 动画 | 停止平台帧回调，冻结时间线 | 从暂停进度继续，暂停期间不算动画时长 |
| 正在播放的视频 | 暂停，记录恢复状态 | 恢复暂停前的播放状态 |
| 普通 `useEffect` 及服务订阅 | 维持挂载语义 | 不重复挂载 |
| HTTP、`services.sleep()` 等 Promise 服务 | 按原请求继续 | 完成后状态可在页面恢复时呈现 |

这里的计时器特指框架绑定。业务若显式使用浏览器自己的 `window.setTimeout`，由浏览器管理。订阅、轮询、定位或自定义原生视图的后台资源应在 `usePageEffect` 中清理。不要依赖隐藏页面继续发起导航；只有当前条目允许修改导航栈。

## 物理树恢复

Renderer 丢失或事务应用失败时，框架保留逻辑 Hook state、ref 容器和未消费的状态更新，清空并重建物理节点。旧 NodeHandle 立即失效，调用返回 `NODE_UNMOUNTED`。重建确认后，直接 ref 指向新节点，`useImperativeHandle` 重新创建。

恢复期间，已挂载 effect 先执行 cleanup，重建成功后重新执行 setup，包括依赖数组为 `[]` 的 effect。服务订阅应成对释放，setup 应支持资源重新建立。网络请求等外部副作用没有 exactly-once 保证。普通页面隐藏与这种物理树恢复不同，隐藏规则仍按上表执行。

## 宿主可见性

原生容器提供 `setVisibility(false/true)`，供原生导航覆盖、Tab 切换和嵌入场景调用。临时从父视图移除不等于销毁。拥有者最终必须调用 `destroy()`。

- iOS 自动响应应用进入后台/恢复活跃，以及内存警告。
- Android 自动响应窗口可见性；示例与生成的 Activity 已将 onStart/onStop 和内存压力转发到容器；自定义 Activity/Fragment 应结合自己的生命周期调用 `setVisibility`，并将内存压力转给 `trimMemory()`。
- macOS 自动响应应用隐藏/取消隐藏；失去键盘焦点不会暂停仍可见的窗口。窗口被业务遮盖或最小化时可由拥有者调用 `setVisibility`。
- Web `BrowserPageStack` 自动结合 `document.hidden` 与 `stack.setVisibility()`；单独使用 `BrowserHost` 时由拥有者调用 `host.setVisibility()`。

## 容量与回收

`maxRetainedPages` 表示总存活页面数，包含当前页面，最小为 1，默认无限以兼容原有保活行为。超出容量时从较早的隐藏条目开始释放宿主、视图、Core 与资源。`trimMemory()` 立即释放全部隐藏实例，保留当前实例以及整条路由栈的名称和参数。

```swift
view.maxRetainedPages = 3
view.onPageEvicted = { page in print("evicted", page) }
view.trimMemory()
```

```kotlin
renderView.maxRetainedPages = 3
renderView.onPageEvicted = { page -> android.util.Log.d("Pages", page) }
// 在 Activity.onTrimMemory / ComponentCallbacks2 内按应用策略转发：
renderView.trimMemory()
```

```ts
const stack = new BrowserPageStack(container, createPage, onError, {
  maxRetainedPages: 3,
  onEvict: page => console.log('evicted', page),
});
await stack.setMaxRetainedPages(2);
await stack.trimMemory();
```

回收与保活有明确区别：返回被回收的条目会创建新实例，Hook state、输入和滚动位置重新初始化，路由参数保持原快照。框架不序列化任意 Hook 或闭包；必须跨回收保存的草稿和列表定位应由业务存入外部模型或存储。

`pop`、`replace`、`load` 和 `destroy` 会销毁被移除的实例，取消未完成的计时器、服务请求和订阅、失效 ref 并释放渲染节点。回收只处理隐藏实例。默认无限保活时，应用仍应根据设备和业务设定容量；当前没有按进程 RSS/堆大小自动计算页面成本，也不承诺进程终止后的自动恢复。

## HarmonyOS 容器

ArkTS 创建 HarmonyController 并传给 AnseronView；例如 controller.setMaxRetainedPages(3)、controller.trimMemory()，通过 controller.onPageEvicted 观察回收。配置文件 harmony.maxRetainedPages 为初始容量，默认 Infinity。HarmonyAbility 转发前后台、配置变化和内存压力；controller.setVisibility 控制外部容器。隐藏页不会发起导航；BLE/NFC 会在隐藏时结束，不自动重连。AnseronView.aboutToDisappear 释放整栈，保活导航通过隐藏 ContentSlot 而非销毁组件实现。
