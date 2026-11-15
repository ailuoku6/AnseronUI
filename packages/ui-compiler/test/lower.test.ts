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
  it("preserves explicit generic JSX component instantiations for AOT", () => {
    const result = lowerTSX('function Page(): UIElement { return <List<Item> data={items}><Row<Item> value={items[0]} /></List>; }');
    expect(result.diagnostics).toEqual([]);
    expect(result.source).toContain('__anseronuiJSX((List<Item>)');
    expect(result.source).toContain('__anseronuiJSX((Row<Item>)');
  });
  it("rejects conditional Hooks and runtime props spreads", () => {
    const result = lowerTSX('function Bad(p: any) { if (p.ok) useState(0); return <View {...p} />; }');
    expect(result.diagnostics.map(item => item.code)).toEqual(["HOOK_NOT_TOP_LEVEL", "DYNAMIC_SPREAD"]);
  });
  it("gives factory-returned named components and custom Hooks their own Hook scope", () => {
    const result = lowerTSX(`function withCard(Body: Component<Props>) {
      return function Card(props: Props) {
        const [value] = useState(0);
        return <Body value={value} />;
      };
    }
    function useCounter() { return useState(0); }
    function Slot(props: Props) { return <props.Content header={<Text>title</Text>} />; }`);
    expect(result.diagnostics).toEqual([]);
    expect(result.source).toContain('__anseronuiJSX(props.Content');
    expect(result.source).toContain('__anseronuiJSX(Text');
  });
  it("still rejects Hooks in event/effect callbacks and conditional returned components", () => {
    const result = lowerTSX(`function withCard() {
      return function Card(props: Props) {
        if (props.enabled) useState(0);
        useEffect(() => { useState(1); }, []);
        return <Button onClick={() => useState(2)} />;
      };
    }`);
    expect(result.diagnostics.map(item => item.code)).toEqual(['HOOK_NOT_TOP_LEVEL', 'HOOK_NOT_TOP_LEVEL', 'HOOK_NOT_TOP_LEVEL']);
  });
});
