# 决策

## 2026-11-21

- 保留现有 accessibilityLabel 命名，对应 Kuikly accessibility(text)，不增加重复别名。
- 六角色与 Kuikly 对齐；iOS checkbox 用 button+selected，鸿蒙 search 降级 TextInput。
- 增加可区分当前节点与整棵子树的控制，避免用 none 隐藏业务子控件。
- accessibilityInfo 采用类型化对象，协议展平布尔值；省略时从事件推导，仍需真实绑定处理器。
- Web 使用合法的角色对应 ARIA 状态：补充值放 description，按钮选择用 pressed，其他用 current。
- 不以编译成功声明实际读屏体验已验收。
