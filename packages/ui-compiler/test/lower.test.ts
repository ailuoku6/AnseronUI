import { describe, expect, it } from "vitest";
import { lowerTSX } from "../src/index.js";

describe("TSX lowering", () => {
  it("preserves TypeScript annotations and expands children/key", () => {
    const result = lowerTSX('function Row(props: { id: string }): UIElement { return <View><Text>{props.id}</Text><Button key={props.id} title="go" /></View>; }');
    expect(result.diagnostics).toEqual([]);
    expect(result.source).toContain("id: string;");
    expect(result.source).toContain("__anseronuiJSX(Button");
    expect(result.source).toContain("props.id");
    expect(result.source).not.toContain("<View>");
  });
  it("rejects conditional Hooks and runtime props spreads", () => {
    const result = lowerTSX('function Bad(p: any) { if (p.ok) useState(0); return <View {...p} />; }');
    expect(result.diagnostics.map(item => item.code)).toEqual(["HOOK_NOT_TOP_LEVEL", "DYNAMIC_SPREAD"]);
  });
});
