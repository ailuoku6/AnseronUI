import { DeviceShowcase } from './device-showcase.js';
import { NativeShowcase } from "./native-showcase.js";
import { ScrollView, View, Text, Button, TextInput, createNativeComponent, definePage, useRef, useState, useServices, useImperativeHandle } from "@anseronui/ui";
import type { NodeHandle, RefTarget, UIElement, NativeComponentEvent } from "@anseronui/ui";

const PlatformSwitch = createNativeComponent<{ value: boolean }>("DemoSwitch");
interface EditorHandle { focus(): Promise<void> }
function Editor(props: { ref?: RefTarget<EditorHandle> }): UIElement {
  const input = useRef<NodeHandle | null>(null);
  const [value, setValue] = useState("");
  useImperativeHandle(props.ref, () => ({ focus: async () => { await input.current?.focus(); } }), []);
  return <TextInput ref={input} testID="extension-input" value={value} onChangeText={setValue} placeholder="通过组件 ref 聚焦" style={{ height: 44 }} />;
}
export function Extensions(): UIElement {
  const services = useServices();
  const native = useRef<NodeHandle | null>(null);
  const editor = useRef<EditorHandle | null>(null);
  const saved = useRef<NodeHandle | null>(null);
  const [mounted, setMounted] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("等待调用");
  const [platform, setPlatform] = useState("unknown");
  return <ScrollView testID="extensions-scroll" style={{ flexGrow: 1, flexDirection: "column" }}><View style={{ flexDirection: "column", padding: 20, gap: 14, flexShrink: 0, backgroundColor: "#f3f5fa" }}>
    <Text style={{ fontSize: 22, fontWeight: "bold" }}>原生扩展实验室</Text>
    <Text style={{ fontSize: 14 }}>Module · 原生组件 · 节点 / 组件 ref</Text>
    <Button title="读取平台信息" onClick={async () => {
      try { const result = await services.invoke<{ platform: string }>("device", "info", { source: "tsx" }); setPlatform(result.platform); }
      catch (error) { setStatus(String(error)); }
    }} />
    <Text testID="extension-platform">平台: {platform}</Text>
    {mounted ? <PlatformSwitch ref={native} testID="extension-switch" nativeProps={{ value: enabled }} style={{ width: 100, height: 44 }}
      onNativeEvent={(event: NativeComponentEvent) => { if (event.name === "change") { setEnabled((event.data as { value: boolean }).value); setStatus("native change"); } }} /> : null}
    <Text testID="extension-value">开关: {enabled ? "on" : "off"}</Text>
    <View style={{ flexDirection: "row", gap: 16, height: 40 }}>
      <Button title="更新原生属性" onClick={() => setEnabled(previous => !previous)} />
      <Button title="调用原生方法" onClick={async () => {
        try { const result = await native.current?.invoke<{ value: boolean }>("toggle"); if (result) { setEnabled(result.value); setStatus("ref toggle"); } }
        catch (error) { setStatus(String(error)); }
      }} />
    </View>
    <Button title="测量原生节点" onClick={async () => {
      try { const frame = await native.current?.measure(); if (frame) setStatus("measure " + Math.round(frame.width)); }
      catch (error) { setStatus(String(error)); }
    }} />
    <Editor ref={editor} />
    <Button title="组件 ref 聚焦" onClick={async () => { await editor.current?.focus(); setStatus("component focus"); }} />
    <Button title={mounted ? "卸载原生组件" : "重新挂载"} onClick={() => { if (mounted) { saved.current = native.current; } setMounted(previous => !previous); }} />
    <Button title="检查卸载 ref" onClick={async () => {
      if (!mounted && native.current === null) {
        try {
          const previous = saved.current;
          if (!previous) { setStatus("missing saved ref"); return; }
          await previous.invoke("toggle"); setStatus("unexpected live ref");
        }
        catch { setStatus("ref cleared / stale rejected"); }
      }
    }} />
    <Text testID="extension-status" style={{ fontSize: 14, color: "#275de5" }}>状态: {status}</Text>
    <NativeShowcase />
    <DeviceShowcase />
  </View></ScrollView>;
}
export const extensionsPage = definePage("extensions", Extensions);
