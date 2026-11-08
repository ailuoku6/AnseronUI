import { Button, Text, TextInput, View, definePage, useRouter, useServices, useState } from "@anseronui/ui";
import type { UIElement } from "@anseronui/ui";

export function AsyncForm(): UIElement {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [status, setStatus] = useState("idle");
  const { http, sleep } = useServices();
  const router = useRouter();

  return (
    <View style={{ flexDirection: "column", padding: 16, gap: 12, width: 320, backgroundColor: "#f5f7fb" }}>
      <Text style={{ fontSize: 20 }}>Async form</Text>
      <Button title="返回 Counter" onClick={() => { void router.back(); }} />
      <TextInput value={value} placeholder="Task name" onChangeText={setValue} />
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
