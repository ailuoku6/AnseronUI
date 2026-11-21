# 契约

- 角色：button/text/image/checkbox/search/none。
- 字符串：accessibilityLabel/Hint/Value。
- 布尔：accessible、accessibilityHidden、accessibilityChecked/Selected、accessibilityClickable/LongClickable。
- public accessibilityInfo = {clickable:boolean,longClickable:boolean}。Core 展平后透传协议并验证。
- `accessibilityAnnounce({message})`、`accessibilityFocus(null)` 为 `__view` 方法。公共 ref 封装前者参数，消息 1–16384 UTF-16 单元。
- none/accessible=false 仅排除当前节点；hidden=true 隐藏子树。Web 容器 presentation、叶节点 aria-hidden。
- Promise 表示接受请求而非朗读完成；Web 快速连续播报合并为最后一次。
- Web 补充值与提示合并 aria-description；selected 用按钮 aria-pressed/其他 aria-current。
- 不改变已有消息结构和事件类型。

- Web 带标签的文本/容器采用可命名 group；原生输入控件保留本来的输入语义。
