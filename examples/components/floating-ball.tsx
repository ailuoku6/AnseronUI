import { View, Text, useEffect, useRef, useState } from "@anseronui/ui";
import type { TouchEvent, UIElement } from "@anseronui/ui";

const SIZE = 56;
const INSET = 8;
function clamp(value: number, extent: number): number {
  return Math.max(INSET, Math.min(value, Math.max(INSET, extent - SIZE - INSET)));
}

/** A business component built entirely from shared View + touch callbacks. */
export function FloatingBall(props: { width: number; height: number }): UIElement {
  const position = useRef({ x: 248, y: 150 });
  const gesture = useRef<{ pointer: number; pageX: number; pageY: number; x: number; y: number } | null>(null);
  const [x, setX] = useState(248);
  const [y, setY] = useState(150);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    gesture.current = null;
    setDragging(false);
    const nextX = clamp(position.current.x, props.width);
    const nextY = clamp(position.current.y, props.height);
    position.current = { x: nextX, y: nextY }; setX(nextX); setY(nextY);
  }, [props.width, props.height]);
  const move = (event: TouchEvent): void => {
    event.stopPropagation();
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    // page coordinates remain stable as the hit view moves underneath the finger.
    const nextX = clamp(start.x + event.pageX - start.pageX, props.width);
    const nextY = clamp(start.y + event.pageY - start.pageY, props.height);
    position.current = { x: nextX, y: nextY }; setX(nextX); setY(nextY);
  };
  const finish = (event: TouchEvent): void => {
    event.stopPropagation();
    if (gesture.current?.pointer !== event.pointerId) return;
    gesture.current = null; setDragging(false);
  };
  return <View testID="floating-ball" accessibilityLabel="可拖动悬浮球" touchAction="none"
    style={{ position: "absolute", left: clamp(x, props.width), top: clamp(y, props.height), width: SIZE, height: SIZE,
      borderRadius: SIZE / 2, borderWidth: 2, borderColor: dragging ? "#ffd899" : "#b7c9ff",
      backgroundColor: dragging ? "#d77926" : "#275de5", alignItems: "center", justifyContent: "center" }}
    onTouchDown={(event: TouchEvent) => {
      event.stopPropagation();
      if (gesture.current) return;
      gesture.current = { pointer: event.pointerId, pageX: event.pageX, pageY: event.pageY, x: clamp(position.current.x, props.width), y: clamp(position.current.y, props.height) };
      setDragging(true);
    }}
    onTouchMove={move} onTouchUp={(event: TouchEvent) => { move(event); finish(event); }} onTouchCancel={finish}>
    <Text testID="floating-ball-label" style={{ fontSize: 13, color: "#ffffff", fontWeight: "bold" }}>{dragging ? "松手" : "拖动"}</Text>
  </View>;
}
