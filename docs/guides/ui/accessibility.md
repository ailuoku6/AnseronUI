# 无障碍

共享组件通过通用属性提供读屏语义。业务页面从 `anseronui/ui` 导入组件，使用同一套属性适配 VoiceOver、TalkBack 和鸿蒙屏幕朗读。

## 描述与角色

```tsx
<Image
  src="asset://avatar.png"
  accessibilityLabel="张三的头像"
  accessibilityRole="image"
  style={{ width: 48, height: 48 }}
/>

<View
  accessibilityRole="checkbox"
  accessibilityLabel="接收通知"
  accessibilityChecked={notifications}
  accessibilityHint="切换通知设置"
  onClick={() => setNotifications(!notifications)}
>
  <Text>{notifications ? '已开启' : '已关闭'}</Text>
</View>
```

| 属性 | 用途 |
| --- | --- |
| `accessibilityLabel` | 节点名称。省略时使用原生控件的默认内容 |
| `accessibilityRole` | `button`、`text`、`image`、`checkbox`、`search`、`none` |
| `accessibilityHint` | 描述操作结果，避免重复名称 |
| `accessibilityValue` | 补充当前值，例如“已加载 3 项” |
| `accessibilityChecked` | 复选框的受控勾选状态 |
| `accessibilitySelected` | 当前选择状态 |
| `accessible` | 显式暴露节点；容器采用平台分组行为。`false` 排除当前节点 |
| `accessibilityHidden` | `true` 从无障碍树隐藏当前节点及其子树 |
| `accessibilityInfo` | `{ clickable: boolean, longClickable: boolean }`，声明读屏动作 |

`Button` 自动提供按钮角色和标题标签。`disabled` 禁止其激活。只有触摸事件的自定义控件仍需绑定 `onClick`，才能响应读屏激活。角色和勾选状态不会替业务更新状态。

`accessibilityRole="none"` 和 `accessible={false}` 保留子节点的读屏资格。Web 的容器使用 presentation 语义，叶节点使用 `aria-hidden`。隐藏整棵子树时使用 `accessibilityHidden`。这些属性不改变布局或普通触摸事件。

## 点击与长按

读屏动作默认从 `onClick`、`onLongPress` 推导。需要单独声明时设置 `accessibilityInfo`。该属性不会创建业务回调，仍需绑定相应事件。

Android 和鸿蒙使用系统点击、长按动作。iOS 和 macOS 通过自定义无障碍动作提供长按。Web 支持 Enter / 空格激活，Shift+F10 触发长按。

## 播报与聚焦

```tsx
import { Button, Text, View, useRef } from 'anseronui/ui';
import type { NodeHandle } from 'anseronui/ui';

function SaveResult() {
  const result = useRef<NodeHandle | null>(null);
  return <View>
    <Text ref={result} accessibilityLabel="保存结果">保存成功</Text>
    <Button title="读取保存结果" onClick={async () => {
      await result.current?.accessibilityAnnounce('保存成功');
      await result.current?.accessibilityFocus();
    }} />
  </View>;
}
```

`accessibilityAnnounce` 接受 1–16384 个 UTF-16 代码单元。Promise 表示宿主已接受请求，不表示朗读结束。系统决定何时播报。Web 使用 polite live region，多次快速调用保留最后一条消息。

`accessibilityFocus` 请求读屏焦点，不主动弹出输入键盘。Web 使用 DOM focus，浏览器与读屏软件决定虚拟光标是否跟随。节点卸载后，保存的 handle 调用拒绝并返回 `NODE_UNMOUNTED`。

## 平台边界与验证

- iOS 的 checkbox 使用 button 和 selected traits。Android、macOS 和鸿蒙使用对应复选框语义。
- 鸿蒙的 search 映射为 TextInput。读屏词汇由系统决定。
- Web 的带标签文本使用命名 group。输入框保留原生输入语义。
- Web 用 `aria-description` 表达补充值和提示。选择状态在按钮上使用 `aria-pressed`，其他节点使用 `aria-current`。
- Android API 26–29 把补充值合并进节点描述。API 30 起使用 `stateDescription`。
- 容器分组及其子控件的朗读顺序由平台决定。需要独立操作的子控件应保留独立节点。

仓库示例的「组件」页末尾提供无障碍演示。

验收时开启目标系统的读屏服务，逐项检查名称、角色、勾选状态、禁用状态、点击、长按、子树隐藏、动态更新、播报和焦点跳转。自动回归可以验证节点属性和回调；它不能证明实际朗读顺序或语音内容。
