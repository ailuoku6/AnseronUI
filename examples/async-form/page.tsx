import { Button, Text, TextInput, View, definePage, useRouter, useServices, useEffect, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function AsyncForm(): UIElement {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [status, setStatus] = useState("idle");
  const { http, sleep } = useServices();
  const router = useRouter();
  const [routeInfo, setRouteInfo] = useState('{}');
  useEffect(() => { let active = true; void router.getParams().then(params => { if (active) setRouteInfo(JSON.stringify(params)); }).catch(error => { if (active) setRouteInfo(String(error)); }); return () => { active = false; }; }, []);

  return (
    <View style={{ flexDirection: "column", padding: 16, gap: 12, width: 320, backgroundColor: "#f5f7fb" }}>
      <Text style={{ fontSize: 20 }}>Async form</Text>
      <Text testID="form-route-params">路由参数: {routeInfo}</Text>
      <Button title="替换当前页并传参" onClick={() => { void router.replace('async-form', { source: 'replace', message: 'replace 的新参数' }); }} />
      <Button title="返回 Counter" onClick={() => { void router.back(); }} />
      <Button title="打开 Counter 后返回验证表单保留" onClick={() => { void router.push('counter', { source: 'async-form', draft: value, items: items.length }); }} />
      <TextInput testID="form-draft" value={value} placeholder="Task name" onChangeText={setValue} />
      <Button title="Add task" onClick={() => {
        if (value.trim().length === 0) return;
        setItems(previous => [...previous, value.trim()]);
        setValue("");
      }} />
      <Button title="Wait" onClick={async () => {
        setStatus("waiting");
        await sleep(20);
        setStatus("done");
      }} />
      <Button title="Load message" onClick={async () => {
        setStatus("loading");
        try { setStatus((await http.getText("/hello.txt")).trim()); }
        catch (error) { setStatus(String(error)); }
      }} />
      <Text>Status: {status}</Text>
      {items.map((item, index) => <Text key={index}>{item}</Text>)}
    </View>
  );
}

export const asyncFormPage = definePage("async-form", AsyncForm);
