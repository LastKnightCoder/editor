/**
 * 时间网格里拖动日程块（周视图）：块体拖动 = 平移（可跨日列），下边缘热区拖动 = 改时长。
 *
 * - pointer 事件 + 指针捕获；按下后移动 ≥ DRAG_THRESHOLD 才算拖拽，否则仍是点击（consumeClick 判别）；
 * - 15 分钟吸附，最短 15 分钟，不越过当天 23:59；
 * - 拖拽中按 Esc 取消并回到原位：capture 阶段消费这次按键，不让它再去关抽屉（进行中手势的局部消费，
 *   不进页面浮层仲裁）；
 * - 松手才回调 onCommit，拖动中只更新 draft 供渲染。
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export const DRAG_THRESHOLD = 4;
const DAY_END = 24 * 60 - 1;
const MIN_MINUTES = 15;

export type EventDragMode = "move" | "resize";

export interface EventDragDraft {
  eventId: number;
  dayIndex: number;
  start: number;
  end: number;
}

interface Origin {
  eventId: number;
  mode: EventDragMode;
  dayIndex: number;
  start: number;
  end: number;
  x: number;
  y: number;
  pointerId: number;
  target: Element;
}

/** 纯换算：给定原位与指针位移，得到吸附后的新位置（导出供单测） */
export function dragTarget(
  origin: { mode: EventDragMode; dayIndex: number; start: number; end: number },
  deltaY: number,
  dayIndex: number,
  cellHeight: number
): { dayIndex: number; start: number; end: number } {
  const delta = Math.round(deltaY / cellHeight) * 15;
  if (origin.mode === "resize") {
    const end = Math.min(Math.max(origin.end + delta, origin.start + MIN_MINUTES), DAY_END);
    return { dayIndex: origin.dayIndex, start: origin.start, end };
  }
  const length = origin.end - origin.start;
  const start = Math.min(Math.max(origin.start + delta, 0), DAY_END - length);
  return { dayIndex, start, end: start + length };
}

export function useEventDrag({
  cellHeight,
  dayIndexAt,
  onCommit,
}: {
  cellHeight: number;
  /** 指针横坐标落在第几列（越界时取最近的列） */
  dayIndexAt(clientX: number): number;
  onCommit(eventId: number, next: { dayIndex: number; start: number; end: number }): void;
}) {
  const [draft, setDraft] = useState<EventDragDraft | null>(null);
  const origin = useRef<Origin | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const latest = useRef({ cellHeight, dayIndexAt, onCommit });
  latest.current = { cellHeight, dayIndexAt, onCommit };
  const draftRef = useRef<EventDragDraft | null>(null);

  const finish = useCallback((commit: boolean) => {
    const o = origin.current;
    const d = draftRef.current;
    if (o?.target.hasPointerCapture?.(o.pointerId)) o.target.releasePointerCapture(o.pointerId);
    origin.current = null;
    draftRef.current = null;
    setDraft(null);
    if (dragging.current) suppressClick.current = true;
    dragging.current = false;
    if (commit && o && d && (d.dayIndex !== o.dayIndex || d.start !== o.start || d.end !== o.end)) {
      latest.current.onCommit(o.eventId, { dayIndex: d.dayIndex, start: d.start, end: d.end });
    }
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const o = origin.current;
      if (!o || e.pointerId !== o.pointerId) return;
      if (!dragging.current) {
        if (Math.hypot(e.clientX - o.x, e.clientY - o.y) < DRAG_THRESHOLD) return;
        dragging.current = true;
      }
      const { cellHeight, dayIndexAt } = latest.current;
      const next = dragTarget(o, e.clientY - o.y, dayIndexAt(e.clientX), cellHeight);
      const d = { eventId: o.eventId, ...next };
      draftRef.current = d;
      setDraft(prev =>
        prev && prev.dayIndex === d.dayIndex && prev.start === d.start && prev.end === d.end
          ? prev
          : d
      );
    };
    const onUp = (e: PointerEvent) => {
      if (origin.current && e.pointerId === origin.current.pointerId) finish(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (origin.current && e.pointerId === origin.current.pointerId) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !dragging.current) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [finish]);

  /** 绑在日程块（mode=move）或其下边缘热区（mode=resize）上 */
  const start = useCallback(
    (
      e: ReactPointerEvent,
      item: { eventId: number; dayIndex: number; start: number; end: number },
      mode: EventDragMode
    ) => {
      if (e.button !== 0) return;
      // 不让底下的网格开始框选新建
      e.stopPropagation();
      const target = e.currentTarget;
      target.setPointerCapture?.(e.pointerId);
      origin.current = {
        ...item,
        mode,
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        target,
      };
      dragging.current = false;
    },
    []
  );

  /** 点击回调里先问一下：刚结束的是拖拽就吞掉这次点击 */
  const consumeClick = useCallback(() => {
    const was = suppressClick.current;
    suppressClick.current = false;
    return was;
  }, []);

  return { draft, start, consumeClick };
}
