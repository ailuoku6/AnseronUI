import { Button, DateTimePicker, Image, Text, TextInput, View, useServices, useState } from "@anseronui/ui";
import type { Style, UIElement } from "@anseronui/ui";

const surface: Style = { position: "absolute", top: 24, right: 201, width: 350, padding: 20, flexDirection: "column", gap: 18, borderRadius: 16, backgroundColor: "#f5f5f7", dmBackgroundColor: "#28282b", borderWidth: 0.5, borderColor: "#0000001a", dmBorderColor: "#ffffff24", shadowColor: "#000000", shadowOpacity: 0.2, shadowRadius: 18, shadowOffsetY: 6 };
const title: Style = { fontSize: 16, fontWeight: "bold", color: "#1d1d1f", dmColor: "#f5f5f7" };
const label: Style = { fontSize: 12, color: "#6e6e73", dmColor: "#a1a1a6" };
const input: Style = { alignSelf: "stretch", height: 34, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", borderRadius: 7, backgroundColor: "#ffffff", dmBackgroundColor: "#1c1c1e", borderWidth: 0.5, borderColor: "#00000026", dmBorderColor: "#ffffff29" };
const inputText: Style = { flexGrow: 1, flexShrink: 1, height: 18, fontSize: 13, color: "#1d1d1f", dmColor: "#f5f5f7", backgroundColor: "#00000000" };
const row: Style = { flexDirection: "row", alignItems: "center", gap: 8 };
const divider: Style = { height: 0.5, backgroundColor: "#0000001a", dmBackgroundColor: "#ffffff24" };
export const groupColors = ["#8e8e93", "#007aff", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#ff2d55"];
const colorNames = ["石墨灰", "蓝色", "绿色", "橙色", "红色", "紫色", "粉色"];

export function IconButton(props: { icon: string; label: string; onClick: () => void; primary?: boolean; disabled?: boolean; dark?: boolean }): UIElement {
  return <View accessibilityRole="button" accessibilityLabel={props.label} accessibilityHint={props.label} onClick={() => { if (!props.disabled) props.onClick(); }} style={{ width: props.primary ? 64 : 30, height: props.primary ? 26 : 30, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: props.primary ? 13 : 8, backgroundColor: props.primary ? "#007aff" : "#00000008", dmBackgroundColor: props.primary ? "#0a84ff" : "#ffffff0d", opacity: props.disabled ? 0.35 : 1 }}>
    <Image accessible={false} src={`asset://${props.icon}-${props.primary || props.dark ? "white" : "light"}.png`} dmSrc={`asset://${props.icon}-${props.primary ? "white" : "dark"}.png`} resizeMode="contain" style={{ width: props.primary ? 18 : 22, height: props.primary ? 18 : 22 }} />
  </View>;
}

export interface GroupEdit { name: string; color: string; priority: number }
export function GroupEditor(props: { name: string; color: string; priority: number; existing: boolean; onClose: () => void; onSave: (edit: GroupEdit) => void; onRemove: () => void }): UIElement {
  const [name, setName] = useState(props.name);
  const [color, setColor] = useState(props.color);
  const [priority, setPriority] = useState(props.priority);
  const [confirmRemove, setConfirmRemove] = useState(false);
  return <View testID="ljump-editor" style={surface}>
    <View style={row}><Text style={title}>{props.existing ? "工作组设置" : "新建工作组"}</Text><View style={{ flexGrow: 1 }} /><IconButton icon="close" label="取消编辑" onClick={props.onClose} /></View>
    <View style={{ alignSelf: "stretch", flexDirection: "column", gap: 7 }}><Text style={label}>名称</Text><View style={input}><TextInput testID="ljump-group-name" accessibilityLabel="工作组名称" value={name} onChangeText={setName} placeholder="工作组名称" style={inputText} /></View></View>
    <View style={{ alignSelf: "stretch", flexDirection: "column", gap: 10 }}><Text style={label}>标记颜色</Text><View style={{ alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      {groupColors.map((item, index) => <View key={item} testID={`ljump-color:${index}`} accessibilityRole="button" accessibilityLabel={colorNames[index]} accessibilitySelected={color === item} onClick={() => setColor(item)}
        style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 17, borderWidth: 1.5, borderColor: color === item ? item : "#00000000", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 13, backgroundColor: item, alignItems: "center", justifyContent: "center" }}>
          {color === item ? <Image accessible={false} src="asset://check-white.png" resizeMode="contain" style={{ width: 16, height: 16, flexShrink: 0 }} /> : null}
        </View>
      </View>)}
    </View></View>
    <View style={divider} />
    <View style={row}><View style={{ flexGrow: 1, flexDirection: "column", gap: 4 }}><Text style={{ color: "#1d1d1f", dmColor: "#f5f5f7", fontSize: 13 }}>优先级</Text><Text style={label}>数值越大，排序越靠前</Text></View><IconButton icon="minus" label="降低优先级" disabled={priority <= 1} onClick={() => setPriority(Math.max(1, priority - 1))} /><Text style={{ width: 26, textAlign: "center", color: "#1d1d1f", dmColor: "#f5f5f7", fontSize: 13 }}>{priority}</Text><IconButton icon="plus" label="提高优先级" onClick={() => setPriority(priority + 1)} /></View>
    <View style={divider} />
    {confirmRemove ? <View style={{ flexDirection: "column", gap: 10 }}><Text style={label}>删除工作组会取消关联提醒，应用窗口保持打开。</Text><View style={row}><Button title="保留" onClick={() => setConfirmRemove(false)} style={{ height: 30, color: "#6e6e73", dmColor: "#a1a1a6" }} /><View style={{ flexGrow: 1 }} /><Button title="删除工作组" onClick={props.onRemove} style={{ height: 30, color: "#ff3b30", fontSize: 12 }} /></View></View> : <View style={row}>
      {props.existing ? <IconButton icon="trash" label="删除工作组" onClick={() => setConfirmRemove(true)} /> : null}<View style={{ flexGrow: 1 }} /><IconButton icon="check" label="保存工作组" primary disabled={!name.trim()} onClick={() => props.onSave({ name: name.trim(), color, priority })} />
    </View>}
  </View>;
}

export function ReminderEditor(props: { id: number; pid: number; title: string; reminderTime: string; suggestedTime: string; onClose: () => void; onChanged: () => void }): UIElement {
  const services = useServices();
  const [mode, setMode] = useState(props.reminderTime ? "at" : "countdown");
  const [minutes, setMinutes] = useState("30");
  const [time, setTime] = useState(props.reminderTime || props.suggestedTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (cancel: boolean) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (cancel) await services.invoke("ljump", "cancelReminder", { id: props.id, pid: props.pid });
      else await services.invoke("ljump", "setReminder", { id: props.id, pid: props.pid, mode, minutes: minutes.trim(), time: time.trim() });
      props.onChanged(); props.onClose();
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  };
  return <View testID="ljump-window-editor" style={surface}>
    <View style={row}><Text style={title}>窗口提醒</Text><View style={{ flexGrow: 1 }} /><IconButton icon="close" label="关闭设置" onClick={props.onClose} /></View>
    <Text numberOfLines={2} style={label}>{props.title}</Text>
    <View style={{ alignSelf: "stretch", flexDirection: "column", gap: 14 }}>
      <View style={{ flexDirection: "row", padding: 3, borderRadius: 9, backgroundColor: "#0000000a", dmBackgroundColor: "#00000033" }}>
        <Button title="倒计时" disabled={busy} onClick={() => setMode("countdown")} style={{ flexGrow: 1, height: 28, borderRadius: 6, fontSize: 12, backgroundColor: mode === "countdown" ? "#ffffff" : "#00000000", dmBackgroundColor: mode === "countdown" ? "#636366" : "#00000000", color: "#1d1d1f", dmColor: "#f5f5f7" }} />
        <Button title="指定时间" disabled={busy} onClick={() => setMode("at")} style={{ flexGrow: 1, height: 28, borderRadius: 6, fontSize: 12, backgroundColor: mode === "at" ? "#ffffff" : "#00000000", dmBackgroundColor: mode === "at" ? "#636366" : "#00000000", color: "#1d1d1f", dmColor: "#f5f5f7" }} />
      </View>
      {mode === "countdown" ? <View style={{ flexDirection: "column", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}><TextInput testID="ljump-reminder-minutes" accessibilityLabel="倒计时分钟数" value={minutes} onChangeText={setMinutes} editable={!busy} style={{ width: 150, height: 52, fontSize: 32, textAlign: "right", color: "#1d1d1f", dmColor: "#f5f5f7", backgroundColor: "#00000000" }} /><Text style={label}>分钟后</Text></View>
        <View style={{ flexDirection: "row", gap: 6 }}>{[5, 15, 30, 60].map(value => <Button key={value} title={`${value} 分钟`} disabled={busy} onClick={() => setMinutes(String(value))} style={{ flexGrow: 1, height: 27, borderRadius: 6, fontSize: 11, color: "#6e6e73", dmColor: "#d1d1d6", backgroundColor: "#00000008", dmBackgroundColor: "#ffffff0d" }} />)}</View>
      </View> : <View style={{ alignSelf: "stretch", flexDirection: "column", paddingTop: 12, borderRadius: 10, backgroundColor: "#ffffff", dmBackgroundColor: "#1c1c1e", borderWidth: 0.5, borderColor: "#00000014", dmBorderColor: "#ffffff1a", overflow: "hidden" }}>
        <DateTimePicker testID="ljump-reminder-time" accessibilityLabel="提醒日期和时间" value={time} onChange={setTime} disabled={busy} style={{ alignSelf: "stretch", height: 184 }} />
        <View style={{ alignSelf: "stretch", height: 0.5, marginTop: 10, marginHorizontal: 12, backgroundColor: "#00000012", dmBackgroundColor: "#ffffff1a" }} />
        <View style={{ alignSelf: "stretch", height: 34, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 11, color: "#6e6e73", dmColor: "#a1a1a6" }}>本地时间</Text>
          <View style={{ flexGrow: 1 }} />
          <Text testID="ljump-reminder-selected-time" style={{ fontSize: 11, color: "#6e6e73", dmColor: "#a1a1a6" }}>{time}</Text>
        </View>
      </View>}
      {error ? <Text numberOfLines={4} style={{ fontSize: 12, color: "#ff3b30", dmColor: "#ff453a" }}>{error}</Text> : null}
      <View style={divider} />
      <View style={row}><Text style={label}>{busy ? "正在保存…" : props.reminderTime ? "保存后替换原提醒" : "未设置时不提醒"}</Text><View style={{ flexGrow: 1 }} /><IconButton icon="check" label="保存提醒" primary disabled={busy} onClick={() => { void save(false); }} /></View>
      {props.reminderTime ? <Button testID="ljump-cancel-reminder" title="取消提醒" accessibilityLabel="取消此窗口提醒" disabled={busy} onClick={() => { void save(true); }} style={{ height: 32, fontSize: 12, color: "#ff3b30", dmColor: "#ff453a", backgroundColor: "#ff3b300a", dmBackgroundColor: "#ff453a14", borderRadius: 7 }} /> : null}
    </View>
  </View>;
}
