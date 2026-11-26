# AnseronUI App Instructions

Read the relevant project skill before editing shared UI or debugging a running page:

- Shared TSX, hooks, TypeScript and cross-platform APIs: [AnseronUI development](.agents/skills/anseronui-development/SKILL.md)
- Running pages, DevTools and `anseronui inspect`: [AnseronUI debugging](.agents/skills/anseronui-debugging/SKILL.md)

Use the generated app's `anseronui.config.json` and scripts as the source of truth for pages, build targets and run commands. Shared UI uses AnseronUI's component runtime. Native targets use AOT; Web compiles to JavaScript. Verify changes with the target build and runtime. Web success does not prove native AOT compatibility.
