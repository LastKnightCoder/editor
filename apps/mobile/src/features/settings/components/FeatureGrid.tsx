// 「我的」功能宫格：最多两行，超出时最后一格换成「更多」。
// 长按任一格进入编辑并直接拖动，松手即保存顺序；这份顺序同时决定平板左导航条自选段露出哪几个。

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { cn } from "@tau/ui";
import { ActionSheet } from "../../../components/ActionSheet";
import { PageHeaderTextButton } from "../../../components/PageHeader";
import { useSheetBackDismiss } from "../../../router/useSheetBackDismiss";
import { useWindowClass } from "../../../router/windowClass";
import type { FeatureEntry } from "../../featureEntries/useFeatureEntries";
import { useFeatureOrder } from "../../featureEntries/featureOrder";

/** 宫格最多两行：手机一行 4 个，中等与宽档一行 8 个 */
const GRID_LIMIT = 8;
const WIDE_GRID_LIMIT = 16;
const LONG_PRESS_MS = 420;
const PRESS_SLOP_PX = 8;

type Point = { x: number; y: number };
type Drag = { from: number; to: number; pointerId: number; start: Point; delta: Point };

/** 被拖格的中心落在哪一格的中心最近，就插到哪一格 */
function nearestSlot(centers: readonly Point[], point: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  centers.forEach((center, index) => {
    const distance = Math.hypot(center.x - point.x, center.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function FeatureGrid({ items }: { items: readonly FeatureEntry[] }) {
  const compact = useWindowClass() === "compact";
  const save = useFeatureOrder(state => state.save);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const centersRef = useRef<Point[]>([]);
  const pressRef = useRef<{ timer: number; pointerId: number; start: Point; index: number } | null>(
    null
  );
  const suppressClickRef = useRef(false);

  useSheetBackDismiss(editing, () => setEditing(false));

  const limit = compact ? GRID_LIMIT : WIDE_GRID_LIMIT;
  const overflow = !editing && items.length > limit;
  const visible = overflow ? items.slice(0, limit - 1) : items;
  const shown = drag ? move(visible, drag.from, drag.to) : visible;

  const beginDrag = (index: number, pointerId: number, start: Point) => {
    centersRef.current = tileRefs.current.slice(0, visible.length).map(tile => {
      const rect = tile?.getBoundingClientRect();
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : start;
    });
    setEditing(true);
    setDrag({ from: index, to: index, pointerId, start, delta: { x: 0, y: 0 } });
    navigator.vibrate?.(10);
  };

  // 拖动期间在 window 上跟踪同一根手指；非被动 touchmove 阻止长按后滚动接管手势
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const delta = { x: event.clientX - current.start.x, y: event.clientY - current.start.y };
      const origin = centersRef.current[current.from];
      const to = origin
        ? nearestSlot(centersRef.current, { x: origin.x + delta.x, y: origin.y + delta.y })
        : current.to;
      setDrag({ ...current, delta, to });
    };
    const onEnd = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (event.type === "pointerup" && current.to !== current.from) {
        save(move(visibleRef.current, current.from, current.to).map(item => item.key));
      }
      setDrag(null);
    };
    const blockScroll = (event: TouchEvent) => event.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    window.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      window.removeEventListener("touchmove", blockScroll);
    };
  }, [dragging, save]);

  const clearPress = () => {
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    pressRef.current = null;
  };
  useEffect(() => clearPress, []);

  const onPointerDown = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    clearPress();
    suppressClickRef.current = false;
    const start = { x: event.clientX, y: event.clientY };
    if (editing) {
      event.preventDefault();
      suppressClickRef.current = true;
      beginDrag(index, event.pointerId, start);
      return;
    }
    const timer = window.setTimeout(() => {
      pressRef.current = null;
      suppressClickRef.current = true;
      beginDrag(index, event.pointerId, start);
    }, LONG_PRESS_MS);
    pressRef.current = { timer, pointerId: event.pointerId, start, index };
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y) > PRESS_SLOP_PX) {
      clearPress();
    }
  };

  const onClick = (item: FeatureEntry) => {
    clearPress();
    if (suppressClickRef.current || editing) {
      suppressClickRef.current = false;
      return;
    }
    item.open();
  };

  return (
    <>
      {editing ? (
        <div className="flex items-center gap-2 px-1 pb-2">
          <p className="text-ink-3 min-w-0 flex-1 text-[12.5px]">
            {compact ? "拖动调整顺序" : "拖动调整顺序，排在前面的会显示在左侧导航条"}
          </p>
          <PageHeaderTextButton
            onClick={() => {
              setDrag(null);
              setEditing(false);
            }}
          >
            完成
          </PageHeaderTextButton>
        </div>
      ) : null}
      <div
        data-no-edge-back={editing || undefined}
        data-no-tab-swipe={editing || undefined}
        className="rounded-card bg-surface shadow-card medium:grid-cols-8 grid grid-cols-4 gap-2.5 px-2.5 py-4"
      >
        {shown.map((item, slot) => {
          const dragged = drag !== null && slot === drag.to;
          const origin = drag ? centersRef.current[drag.from] : undefined;
          const target = drag ? centersRef.current[drag.to] : undefined;
          // 被拖格画在它的新位置上，再平移回手指下方
          const offset =
            dragged && origin && target
              ? {
                  x: origin.x + drag.delta.x - target.x,
                  y: origin.y + drag.delta.y - target.y,
                }
              : null;
          return (
            <FeatureButton
              key={item.key}
              item={item}
              editing={editing}
              dragged={dragged}
              offset={offset}
              buttonRef={element => {
                // 拖动中格子按预览顺序重排，测量只在开始时做，这里按原顺序记录
                if (!drag) tileRefs.current[slot] = element;
              }}
              onPointerDown={event => onPointerDown(slot, event)}
              onPointerMove={onPointerMove}
              onPointerUp={clearPress}
              onPointerCancel={clearPress}
              onClick={() => onClick(item)}
            />
          );
        })}
        {overflow ? (
          <FeatureButton
            item={{
              key: "more",
              label: "更多",
              open: () => setMoreOpen(true),
              tile: (
                <span className="bg-hover text-ink-2 grid h-[46px] w-[46px] place-items-center rounded-[17px]">
                  <DotsThree size={26} weight="bold" aria-hidden="true" />
                </span>
              ),
            }}
            onClick={() => setMoreOpen(true)}
          />
        ) : null}
      </div>
      {overflow ? (
        <ActionSheet
          open={moreOpen}
          title="全部功能"
          onClose={() => setMoreOpen(false)}
          items={items.slice(limit - 1).map(item => ({
            key: item.key,
            label: item.label,
            icon: <span className="scale-[0.6]">{item.tile}</span>,
            onClick: item.open,
          }))}
        />
      ) : null}
    </>
  );
}

function FeatureButton(props: {
  item: Pick<FeatureEntry, "key" | "label" | "tile" | "open">;
  editing?: boolean;
  dragged?: boolean;
  offset?: Point | null;
  buttonRef?: (element: HTMLButtonElement | null) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
  onClick: () => void;
}) {
  return (
    <button
      ref={props.buttonRef}
      type="button"
      onClick={props.onClick}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onContextMenu={event => event.preventDefault()}
      className={cn(
        "relative flex min-w-0 flex-col items-center gap-[7px] py-2 select-none",
        props.dragged ? "z-10 scale-110" : "transition-transform duration-200 active:scale-90",
        props.editing && "touch-none"
      )}
      style={{
        WebkitTouchCallout: "none",
        transform: props.offset
          ? `translate(${props.offset.x}px, ${props.offset.y}px) scale(1.1)`
          : undefined,
      }}
    >
      <span
        className={cn(
          "rounded-[17px] transition-shadow duration-200",
          props.dragged && "shadow-float",
          props.editing && !props.dragged && "feature-wiggle"
        )}
      >
        {props.item.tile}
      </span>
      <span className="text-ink-2 max-w-full truncate px-0.5 text-[11px] font-semibold">
        {props.item.label}
      </span>
    </button>
  );
}
