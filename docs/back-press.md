# 系统返回键监听

AnseronUI 支持在 Core 内同步监听系统返回键。页面节点可以声明 `onBackPress`，回调返回 `true` 表示消费本次返回键，返回 `false` 表示交给宿主继续处理：通常是先执行 AnseronUI 路由 `back/pop`，栈为空后再执行系统默认退出。

```tsx
import { Text, View, useState } from "@anseronui/ui";

export function EditorPage() {
  const [editing, setEditing] = useState(true);
  return (
    <View onBackPress={() => {
      if (!editing) return false;
      setEditing(false);
      return true;
    }}>
      <Text>{editing ? "编辑中：返回键会先退出编辑态" : "已退出编辑态"}</Text>
    </View>
  );
}
```

回调必须同步返回 `boolean`，不能返回 Promise。系统返回键需要在当前系统事件调用栈内得到“消费/未消费”结果；异步回调无法阻止 Android 默认返回或导航控制器的默认行为。

## 宿主流程

宿主先调用渲染容器的 `handleBackPress()`：

```kotlin
if (pageView.handleBackPress()) return
if (pageView.pop()) return
super.onBackPressed()
```

```swift
if pageView.handleBackPress() { return }
if pageView.pop() { return }
navigationController?.popViewController(animated: true)
```

Web 宿主使用 `await host.handleBackPress()`；生成的 Web 入口已监听 `Escape` 和 `BrowserBack`，未消费时自动执行路由返回。生成的 Android 示例 Activity 也已经把系统返回键接到该流程。

返回回调按当前渲染树的后序顺序检查，最内层可消费节点优先；第一个返回 `true` 的回调结束本次分发。回调抛出异常会记录 `BACK_PRESS_ERROR`，并按未消费处理。页面销毁或路由切换后，旧页面的返回回调自动失效。

## 和路由的关系

返回键消费与 `router.back()` 是两层语义：`onBackPress` 适合关闭编辑态、弹窗或临时模式；回调返回 `false` 后，宿主再调用 `pop()`/`back()` 返回上一页。根页面没有可返回路由且没有消费回调时，宿主可以退出当前 Activity 或交给系统导航控制器。

这版采用同步回调和单次分发，暂不提供异步确认弹窗、返回键事件队列或跨多个页面的全局回调注册表。
