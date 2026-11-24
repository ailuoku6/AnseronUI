# AnseronUI App Instructions

Read the relevant project skill before editing shared UI or debugging a running page:

- Shared TSX, hooks, TypeScript and cross-platform APIs: [AnseronUI development](.agents/skills/anseronui-development/SKILL.md)
- Running pages, DevTools and `anseronui inspect`: [AnseronUI debugging](.agents/skills/anseronui-debugging/SKILL.md)

Use the generated app's `anseronui.config.json` and scripts as the source of truth for pages, build targets and run commands. Shared UI runs in AnseronUI's AOT runtime, not in React or a browser DOM. Verify changes with the target AOT build and runtime.
