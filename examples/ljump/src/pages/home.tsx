import { Button, Image, ScrollView, Text, View, definePage, useEffect, useRef, useServices, useState, useTimers } from "@anseronui/ui";
import type { NodeHandle, UIElement } from "@anseronui/ui";

import { GroupEditor, ReminderEditor, groupColors } from "../components/editors.js";
import { WindowCard, WindowPreview, ApplicationIcon, windowCardStride } from "../components/window-card.js";
import type { GroupEdit } from "../components/editors.js";

interface WindowInfo { id: number; windowId: number; title: string; app: string; pid: number; bundleId: string }
interface ReminderInfo { id: number; pid: number; time: string; label: string }
interface ReminderSnapshot { suggestedTime: string; items: ReminderInfo[] }
interface Workgroup { id: string; name: string; color: string; priority: number; windows: WindowInfo[] }
interface WindowDetail { id: number; pid: number; title: string; context: string; document: string }
interface NativeEvent { kind: string; groupId?: string; key?: string; window?: WindowInfo; windows?: WindowDetail[]; id?: number; pid?: number; create?: boolean }
const colors = groupColors;
const initialGroups: Workgroup[] = [
  { id: "focus", name: "需求", color: "#007aff", priority: 3, windows: [] },
  { id: "design", name: "bug", color: "#ff3b30", priority: 2, windows: [] },
  { id: "research", name: "学习", color: "#34c759", priority: 1, windows: [] },
];

export function Home(): UIElement {
  const services = useServices();
  const timers = useTimers();
  const [groups, setGroups] = useState(initialGroups);
  const [activeGroup, setActiveGroup] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState(0);
  const [editingGroup, setEditingGroup] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState(colors[4]);
  const [priority, setPriority] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [captureAllowed, setCaptureAllowed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draggedCard, setDraggedCard] = useState("");
  const [dropTarget, setDropTarget] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [notice, setNoticeText] = useState("");
  const [reminders, setReminders] = useState<ReminderInfo[]>([]);
  const [reminderWindow, setReminderWindow] = useState<WindowInfo | null>(null);
  const [suggestedTime, setSuggestedTime] = useState("");
  const [windowDetails, setWindowDetails] = useState<WindowDetail[]>([]);
  const noticeTimer = useRef(0);
  const activationRequest = useRef(0);
  const draggingRef = useRef(false);
  const reminderRef = useRef<WindowInfo | null>(null);
  const groupsRef = useRef(groups);
  const activeRef = useRef(activeGroup);
  const selectedRef = useRef(selectedWindow);
  const pendingRef = useRef<WindowInfo | null>(null);
  const menuRef = useRef(false);
  const expandedRef = useRef(false);
  const windowsScroll = useRef<NodeHandle | null>(null);

  const setNotice = (message: string) => {
    if (noticeTimer.current) timers.clearTimeout(noticeTimer.current);
    noticeTimer.current = 0;
    setNoticeText(message);
    if (message) noticeTimer.current = timers.setTimeout(() => {
      noticeTimer.current = 0;
      setNoticeText("");
    }, 2600);
  };
  const endDrag = () => {
    draggingRef.current = false;
    setDragging(false);
    setDraggedCard("");
    setDropTarget("");
  };

  const watch = (next: Workgroup[]) => {
    const tracked = next.flatMap(group => group.windows.map(window => ({ id: window.id, pid: window.pid, title: window.title, group: group.name })));
    const pending = pendingRef.current;
    if (pending) tracked.push({ id: pending.id, pid: pending.pid, title: pending.title, group: "" });
    void services.invoke("ljump", "watchWindows", { windows: tracked }).catch(() => setNotice("窗口清理服务不可用"));
  };
  const persist = (next: Workgroup[]) => {
    groupsRef.current = next;
    setGroups(next);
    void services.storage.set("workgroups", JSON.stringify(next), "ljump").catch(() => setNotice("保存失败"));
    watch(next);
  };
  const sorted = groups.slice().sort((a, b) => b.priority - a.priority);
  const current = groups.find(group => group.id === activeGroup) ?? null;
  const currentWindows = current?.windows ?? [];
  const showWindows = expanded && current !== null && !menuOpen && reminderWindow === null && (!dragging || !!draggedCard);
  const detailFor = (window: WindowInfo) => windowDetails.find(item => item.id === window.id && item.pid === window.pid);

  useEffect(() => {
    const windows = showWindows ? currentWindows.map(window => ({ id: window.id, pid: window.pid })) : [];
    setWindowDetails([]);
    void services.invoke("ljump", "inspectWindows", { windows }).catch(() => {});
  }, [activeGroup, showWindows, groups, previewRevision]);

  const applyReminders = (snapshot: ReminderSnapshot) => {
    setReminders(snapshot.items);
    setSuggestedTime(snapshot.suggestedTime);
  };
  const refreshReminders = async () => {
    try {
      const result = await services.invoke<ReminderSnapshot>("ljump", "reminders");
      applyReminders(result);
    } catch { setNotice("无法读取提醒设置"); }
  };
  const reminderFor = (window: WindowInfo) => reminders.find(item => item.id === window.id && item.pid === window.pid);
  const setNativeEditing = async (editing: boolean) => {
    try { await services.invoke("ljump", "setEditing", { editing }); } catch { /* Closing an unmounted panel needs no recovery. */ }
  };
  const closeReminder = () => {
    void setNativeEditing(false);
    reminderRef.current = null;
    setReminderWindow(null);
  };
  const openReminder = (window: WindowInfo) => {
    if (menuRef.current) closeEditor();
    void setNativeEditing(true);
    reminderRef.current = window;
    setReminderWindow(window);
    setNotice("");
  };
  const removeWindow = (id: number, pid: number) => {
    if (reminderRef.current?.id === id && reminderRef.current?.pid === pid) closeReminder();
    const pending = pendingRef.current;
    if (pending && pending.id === id && pending.pid === pid) pendingRef.current = null;
    const before = groupsRef.current;
    const next = before.map(group => ({ ...group, windows: group.windows.filter(item => item.id !== id || item.pid !== pid) }));
    if (next.some((group, index) => group.windows.length !== before[index].windows.length)) {
      persist(next);
      const active = next.find(group => group.id === activeRef.current);
      const index = Math.max(0, Math.min(selectedRef.current, (active?.windows.length ?? 0) - 1));
      selectedRef.current = index;
      setSelectedWindow(index);
    }
  };

  const refreshStatus = async () => {
    try {
      const result = await services.invoke<{ trusted: boolean; capture: boolean }>("ljump", "status");
      setAccessible(result.trusted);
      setCaptureAllowed(result.capture);

    } catch { setNotice("macOS 窗口服务不可用"); }
  };
  const closeEditor = () => {
    void setNativeEditing(false);
    menuRef.current = false;
    pendingRef.current = null;
    setMenuOpen(false);
    watch(groupsRef.current);
  };
  const collapse = () => {
    expandedRef.current = false;
    setExpanded(false);
  };
  const hidePanel = () => {
    collapse();
    closeEditor();
    closeReminder();
    endDrag();
    void services.invoke("ljump", "hideOverlay").catch(() => {});
  };
  const scrollWindows = async (offset: number, animated: boolean) => {
    const handle = windowsScroll.current;
    if (!handle) return;
    try { await handle.scrollTo(0, offset, animated); } catch { /* The list may have unmounted. */ }
  };
  const chooseGroup = (group: Workgroup) => {
    if (activeRef.current !== group.id || !expandedRef.current) {
      selectedRef.current = 0;
      setSelectedWindow(0);
      void scrollWindows(0, false);
    }
    activeRef.current = group.id;
    expandedRef.current = true;
    setActiveGroup(group.id);
    setExpanded(true);
  };
  const assign = (window: WindowInfo, groupId: string) => {
    const destination = groupsRef.current.find(group => group.id === groupId);
    if (!destination || destination.windows.some(item => item.id === window.id && item.pid === window.pid)) return;
    const next = groupsRef.current.map(group => group.id === groupId
      ? { ...group, windows: [window, ...group.windows] }
      : { ...group, windows: group.windows.filter(item => item.id !== window.id || item.pid !== window.pid) });
    persist(next);
    const group = next.find(item => item.id === groupId);
    if (group) chooseGroup(group);
    setNotice("");
  };
  const activate = async (window: WindowInfo, fromClick: boolean) => {
    const request = ++activationRequest.current;
    try {
      const result = await services.invoke<{ status: string; message: string }>("ljump", "activate", { id: window.id, pid: window.pid, fromClick });
      if (result.status === "closed") removeWindow(window.id, window.pid);
      if (request !== activationRequest.current || result.status === "ignored") return;
      setNotice(result.status === "closed" ? "窗口已关闭，已移出工作组" : result.message);
      if (result.status === "failed") void refreshStatus();
    } catch {
      if (request !== activationRequest.current) return;
      setNotice("暂时无法连接窗口服务");
      void refreshStatus();
    }
  };
  const openEditor = (group?: Workgroup, dropped?: WindowInfo) => {
    closeReminder();
    void setNativeEditing(true);
    menuRef.current = true;
    pendingRef.current = dropped ?? null;
    setEditingGroup(group?.id ?? "");
    setGroupName(group?.name ?? "");
    setGroupColor(group?.color ?? colors[4]);
    let nextPriority = 1;
    for (const item of groupsRef.current) nextPriority = Math.max(nextPriority, item.priority + 1);
    setPriority(group?.priority ?? nextPriority);
    setMenuOpen(true);
    if (dropped) watch(groupsRef.current);
  };

  useEffect(() => {
    let mounted = true;
    void services.storage.get("workgroups", "ljump").then(async value => {
      const version = await services.storage.get("default-groups-version", "ljump");
      if (!mounted) return;
      try {
        if (value) {
          const saved = JSON.parse(value) as Workgroup[];
          if (Array.isArray(saved)) {
            if (version !== "2") {
              const next = saved.map(group => {
                const name = group.id === "focus" && group.name === "专注" ? "需求"
                  : group.id === "design" && group.name === "设计" ? "bug"
                  : group.id === "research" && group.name === "调研" ? "学习" : group.name;
                return { ...group, name };
              });
              await services.storage.set("workgroups", JSON.stringify(next), "ljump");
              if (!mounted) return;
              groupsRef.current = next; setGroups(next); watch(next);
            } else { groupsRef.current = saved; setGroups(saved); watch(saved); }
          }
        }
        if (version !== "2") await services.storage.set("default-groups-version", "2", "ljump");
      } catch { setNotice("工作组数据无法读取"); }
    }).catch(() => { if (mounted) setNotice("无法读取已保存的工作组"); });
    void refreshStatus();
    refreshReminders();
    const stop = services.subscribe<NativeEvent>("ljump.events", event => {
      if (!mounted) return;
      if (event.kind === "show") {
        void refreshStatus();
        refreshReminders();
        setPreviewRevision(Date.now());
      } else if (event.kind === "leave") {
        activationRequest.current++;
        setNotice("");
        collapse();
        if (menuRef.current) closeEditor();
        closeReminder();
        endDrag();
      } else if (event.kind === "hoverGroup" && event.groupId) {
        setDropTarget(event.groupId);
        const group = groupsRef.current.find(item => item.id === event.groupId);
        if (group && !draggingRef.current && !menuRef.current && !reminderRef.current) chooseGroup(group);
      } else if (event.kind === "hoverWindow") {
        const group = groupsRef.current.find(item => item.id === activeRef.current);
        const index = group?.windows.findIndex(window => window.id === event.id && window.pid === event.pid) ?? -1;
        if (index >= 0) {
          selectedRef.current = index;
          setSelectedWindow(index);
        }
        setDropTarget("");
      } else if (event.kind === "hoverAdd") {
        setDropTarget("add");
        if (!draggingRef.current && !menuRef.current && !reminderRef.current) collapse();
      } else if (event.kind === "clearTarget") {
        setDropTarget("");
      } else if (event.kind === "remindersChanged") {
        refreshReminders();
      } else if (event.kind === "windowDetails" && event.windows) {
        setWindowDetails(event.windows);
      } else if (event.kind === "contextGroup" && event.groupId) {
        const group = groupsRef.current.find(item => item.id === event.groupId);
        if (group) openEditor(group);
      } else if (event.kind === "dragStart") {
        draggingRef.current = true;
        setDragging(true);
        setDraggedCard(event.id === undefined ? "" : `${event.pid}:${event.id}`);
      } else if (event.kind === "dragEnd") {
        endDrag();
      } else if (event.kind === "drop") {
        endDrag();
        const window = event.window ?? groupsRef.current.flatMap(group => group.windows).find(item => item.id === event.id && item.pid === event.pid);
        if (!window) return;
        if (event.create) openEditor(undefined, window);
        else if (event.groupId) assign(window, event.groupId);
      } else if (event.kind === "windowClosed" && event.id !== undefined && event.pid !== undefined) {
        removeWindow(event.id, event.pid);
      } else if (event.kind === "key") {
        if (event.key === "escape") {
          if (reminderRef.current) closeReminder();
          else if (menuRef.current) closeEditor();
          else hidePanel();
          return;
        }
        if (menuRef.current || reminderRef.current) return;
        const list = groupsRef.current.slice().sort((a, b) => b.priority - a.priority);
        const active = list.find(group => group.id === activeRef.current) ?? list[0];
        if (!active) return;
        if (!expandedRef.current) {
          chooseGroup(active);
          return;
        }
        if (event.key === "up" || event.key === "down") {
          const step = event.key === "down" ? 1 : -1;
          const index = Math.max(0, Math.min(active.windows.length - 1, selectedRef.current + step));
          selectedRef.current = index;
          setSelectedWindow(index);
          void scrollWindows(index * windowCardStride, true);
        } else if (event.key === "left" || event.key === "right") {
          const step = event.key === "right" ? 1 : -1;
          const index = list.findIndex(group => group.id === active.id);
          chooseGroup(list[(index + step + list.length) % list.length]);
        } else if (event.key === "return" && active.windows[selectedRef.current]) {
          void activate(active.windows[selectedRef.current], false);
        }
      }
    }, error => setNotice(String(error)));
    return () => {
      mounted = false;
      if (noticeTimer.current) timers.clearTimeout(noticeTimer.current);
      stop();
    };
  }, []);

  return <View style={{ flexGrow: 1, position: "relative", flexDirection: "row", backgroundColor: "#00000000" }}>
    <View animation={{ duration: 180, easing: "easeOut" }} style={{ position: "absolute", top: 14, bottom: 14, left: 12, right: 197, opacity: showWindows ? 1 : 0, translateX: showWindows ? 0 : 22, visibility: showWindows ? "visible" : "hidden" }}>
      {showWindows && current ? <View style={{ flexGrow: 1, flexDirection: "column", gap: 10 }}>
        <View style={{ height: 30, marginHorizontal: 6, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, backgroundBlurRadius: 8, backgroundColor: "#f5f5f7df", dmBackgroundColor: "#28282bdf" }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: current.color }} />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: "bold", color: "#1d1d1f", dmColor: "#f5f5f7" }}>{current.name}</Text>
          <View style={{ flexGrow: 1 }} /><Text style={{ fontSize: 11, color: "#6e6e73", dmColor: "#a1a1a6" }}>{currentWindows.length} 个窗口</Text>
        </View>
        <ScrollView ref={windowsScroll} testID="ljump-window-list" style={{ flexGrow: 1, flexShrink: 1, flexDirection: "column" }}>
          <View style={{ flexDirection: "column", gap: 10, paddingHorizontal: 6, paddingBottom: 6 }}>
            {currentWindows.map((window, index) => <WindowCard key={`${window.pid}:${window.id}`}
              id={window.id} pid={window.pid} windowId={window.windowId} bundleId={window.bundleId} app={window.app}
              title={detailFor(window)?.title || window.title} context={detailFor(window)?.context ?? ""} document={detailFor(window)?.document ?? ""}
              reminder={reminderFor(window)?.label ?? ""} selected={selectedWindow === index} dragged={draggedCard === `${window.pid}:${window.id}`}
              captureAllowed={captureAllowed} revision={previewRevision}
              onOpen={() => { void activate(window, true); }}
              onReminder={() => openReminder({ ...window, title: detailFor(window)?.title || window.title })}
              onRemove={() => removeWindow(window.id, window.pid)} />)}
            {!currentWindows.length ? <View style={{ padding: 24, gap: 7, alignItems: "center", borderRadius: 16, backgroundBlurRadius: 8, backgroundColor: "#f5f5f7df", dmBackgroundColor: "#28282bdf" }}><Text style={{ fontSize: 13, color: "#1d1d1f", dmColor: "#f5f5f7" }}>还没有窗口</Text><Text style={{ fontSize: 11, color: "#6e6e73", dmColor: "#a1a1a6" }}>把窗口拖到右侧工作组即可添加</Text></View> : null}
          </View>
        </ScrollView>
      </View> : null}
    </View>

    <View style={{ position: "absolute", top: 14, bottom: 14, right: 12, width: 174, justifyContent: "center", flexDirection: "column" }}>
      <View testID="ljump-workgroups" style={{ width: 174, flexShrink: 1, padding: 7, gap: 5, flexDirection: "column", borderRadius: 21, backgroundBlurRadius: 8, backgroundColor: "#f5f5f770", dmBackgroundColor: "#25252790", borderWidth: 1, borderColor: "#ffffff80", dmBorderColor: "#ffffff2b", shadowColor: "#000000", shadowOpacity: 0.16, shadowRadius: 16, shadowOffsetY: 5 }}>
        <ScrollView style={{ width: 160, height: Math.min(500, sorted.length * 98), flexShrink: 1, flexDirection: "column" }}>
          <View style={{ flexDirection: "column", gap: 4 }}>
            {sorted.map(group => <View key={group.id} testID={`ljump-group:${group.id}`} accessibilityLabel={group.name} accessibilityHint={`${group.windows.length} 个窗口`} accessibilityRole="button" accessibilitySelected={expanded && activeGroup === group.id}
              onClick={() => { if (!menuRef.current && !reminderRef.current) chooseGroup(group); }} animation={{ duration: 150, easing: "easeOut" }}
              style={{ height: 94, position: "relative", borderRadius: 14,
                backgroundColor: dragging && dropTarget === group.id ? "#007aff30" : expanded && activeGroup === group.id ? "#ffffffa6" : "#ffffff19",
                dmBackgroundColor: dragging && dropTarget === group.id ? "#0a84ff55" : expanded && activeGroup === group.id ? "#ffffff24" : "#ffffff04",
                borderWidth: 1, borderColor: dragging && dropTarget === group.id ? "#007aff" : "#00000000" }}>
              <View style={{ position: "absolute", left: 9, right: 9, top: 8, height: 52, borderRadius: 9, backgroundColor: "#0000000c", dmBackgroundColor: "#00000026", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                {group.windows.length === 0 ? <View style={{ width: 23, height: 15, borderRadius: 4, borderWidth: 1, borderColor: "#8e8e93" }}><View style={{ position: "absolute", left: 3, right: 3, top: 3, height: 1, backgroundColor: "#8e8e93" }} /></View> : null}
                {group.windows.length > 0 && !captureAllowed ? <ApplicationIcon nativeProps={{ bundleId: group.windows[0].bundleId }} style={{ width: 30, height: 30 }} /> : null}
                {captureAllowed ? group.windows.slice(0, 3).reverse().map((window, index) => <View key={`stack-${window.id}`} style={{ position: "absolute", left: 13 + index * 6, right: 13 + (2 - index) * 6, top: 2 + index * 2, height: 44, borderRadius: 6, overflow: "hidden", backgroundColor: "#e5e5ea", dmBackgroundColor: "#3a3a3c", borderWidth: 0.5, borderColor: "#3c3c432e", dmBorderColor: "#ffffff40" }}>
                  <WindowPreview nativeProps={{ windowId: window.windowId, revision: previewRevision }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
                </View>) : null}
              </View>
              <View style={{ position: "absolute", left: 11, right: 11, bottom: 7, height: 19, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: group.color }} />
                <Text numberOfLines={1} style={{ flexGrow: 1, flexShrink: 1, fontSize: 12, fontWeight: "bold", color: "#1d1d1f", dmColor: "#f5f5f7" }}>{group.name}</Text>
                <Text style={{ fontSize: 11, color: "#52525a", dmColor: "#b9b9c0" }}>{group.windows.length}</Text>
              </View>
            </View>)}
          </View>
        </ScrollView>
        <View style={{ height: 1, marginHorizontal: 5, backgroundColor: "#00000014", dmBackgroundColor: "#ffffff1f" }} />
        <View testID="ljump-add" accessibilityRole="button" accessibilityLabel="新建工作组" onClick={() => openEditor()} animation={{ duration: 150, easing: "easeOut" }}
          style={{ height: 34, flexShrink: 0, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: dragging && dropTarget === "add" ? "#007aff28" : "#ffffff28", dmBackgroundColor: dragging && dropTarget === "add" ? "#0a84ff55" : "#ffffff10" }}>
          <Image accessible={false} src="asset://plus-light.png" dmSrc="asset://plus-dark.png" style={{ width: 23, height: 23 }} />
        </View>
      </View>
    </View>

    {reminderWindow ? <ReminderEditor key={`${reminderWindow.pid}:${reminderWindow.id}`} id={reminderWindow.id} pid={reminderWindow.pid} title={reminderWindow.title}
      reminderTime={reminderFor(reminderWindow)?.time ?? ""} suggestedTime={suggestedTime}
      onClose={closeReminder} onChanged={() => { void refreshReminders(); }} /> : null}

    {menuOpen ? <GroupEditor key={editingGroup || "new"} name={groupName} color={groupColor} priority={priority} existing={!!editingGroup}
      onClose={closeEditor} onRemove={() => {
        persist(groupsRef.current.filter(group => group.id !== editingGroup));
        if (activeGroup === editingGroup) { activeRef.current = ""; setActiveGroup(""); collapse(); }
        closeEditor();
      }} onSave={(edit: GroupEdit) => {
        if (editingGroup) persist(groupsRef.current.map(group => group.id === editingGroup ? { ...group, name: edit.name, color: edit.color, priority: edit.priority } : group));
        else {
          const id = `group-${Date.now()}`;
          const pending = pendingRef.current;
          const next = groupsRef.current.map(group => ({ ...group, windows: group.windows.filter(window => !pending || window.id !== pending.id || window.pid !== pending.pid) }));
          next.push({ id, name: edit.name, color: edit.color, priority: edit.priority, windows: pending ? [pending] : [] });
          persist(next); collapse();
        }
        closeEditor();
      }} /> : null}
    {showWindows && currentWindows.length > 0 && (!accessible || !captureAllowed) ? <View testID="ljump-permissions" style={{ position: "absolute", right: 198, bottom: 10, flexDirection: "row", gap: 6 }}>
      {!accessible ? <Button title="允许切换窗口" onClick={() => { void services.invoke("ljump", "requestAccessibility").then(() => refreshStatus()).catch(() => {}); }} style={{ fontSize: 10, color: "#ffffff", backgroundColor: "#202733ed", borderRadius: 7 }} /> : null}
      {!captureAllowed ? <Button title="启用窗口缩略图" onClick={() => { void services.invoke("ljump", "requestCapture").then(() => refreshStatus()).catch(() => {}); }} style={{ fontSize: 10, color: "#ffffff", backgroundColor: "#202733ed", borderRadius: 7 }} /> : null}
    </View> : null}
    {notice ? <View testID="ljump-notice" style={{ position: "absolute", right: 201, bottom: 44, maxWidth: 338, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 13, backgroundBlurRadius: 8, backgroundColor: "#f5f5f7df", dmBackgroundColor: "#28282be6", borderWidth: 0.5, borderColor: "#00000021", dmBorderColor: "#ffffff26", shadowColor: "#000000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffsetY: 3 }}>
      <Text numberOfLines={3} style={{ fontSize: 12, color: "#1d1d1f", dmColor: "#f5f5f7" }}>{notice}</Text>
    </View> : null}
  </View>;
}

export const homePage = definePage("home", Home);
