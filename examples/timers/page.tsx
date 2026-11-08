import { Button, Text, View, definePage, useEffect, useRef, useState, useTimers } from "@anseronui/ui";

function TimersPage() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("空闲");
  const handle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useTimers();
  useEffect(() => () => { if (handle.current !== null) clearTimeout(handle.current); }, []);
  return <View style={{ flexDirection: "column", padding: 24, gap: 16 }}>
    <Text style={{ fontSize: 22 }}>跨端计时器</Text>
    <Text testID="timer-count">计时次数: {count}</Text>
    <Text testID="timer-status">状态: {status}</Text>
    <Button title="1 秒后计数" testID="timer-start" onClick={() => {
      if (handle.current !== null) clearTimeout(handle.current);
      setStatus("等待中");
      handle.current = setTimeout(() => {
        handle.current = null;
        setCount(value => value + 1);
        setStatus("已触发");
      }, 1000);
    }} />
    <Button title="取消计时" testID="timer-cancel" onClick={() => {
      if (handle.current !== null) clearTimeout(handle.current);
      handle.current = null;
      setStatus("已取消");
    }} />
    <Button title="await 后计时" testID="timer-await" onClick={async () => {
      await Promise.resolve();
      timers.setTimeout(() => { setCount(value => value + 1); setStatus("异步后触发"); }, 20);
    }} />
    <Text>退出页面时，框架会取消该页面尚未触发的计时器。</Text>
  </View>;
}
export const timersPage = definePage("timers", TimersPage);
