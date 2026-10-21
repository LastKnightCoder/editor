import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn";

/** 移动超过这个距离才算拖动，避免点击被当成拖拽 */
const DRAG_THRESHOLD = 4;

export interface SortableHandleProps {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
  tabIndex: number;
  "aria-roledescription": string;
}

export interface SortableItemState {
  index: number;
  /** 正在被拖动的那一项 */
  dragging: boolean;
  /** 拖动经过、松手后会放到这里 */
  over: boolean;
  /** 展开到拖动手柄上；也可以展开到整项上，整项都能拖 */
  handleProps: SortableHandleProps;
}

export interface SortableProps<T> {
  items: readonly T[];
  getKey(item: T): string;
  /** 把 from 位置的项移到 to 位置 */
  onMove(from: number, to: number): void;
  renderItem(item: T, state: SortableItemState): ReactNode;
  className?: string;
  /** 每一项外层容器的类名 */
  itemClassName?: string;
  disabled?: boolean;
}

interface DragState {
  from: number;
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * 列表与网格排序：按住手柄拖到另一项上松手即移到那里；手柄获得焦点时方向键前后移动一位，Esc 取消拖动。
 * 用指针事件实现，不依赖拖放 API，任何容器（含编辑器里的块）都能用。
 */
export function Sortable<T>({
  items,
  getKey,
  onMove,
  renderItem,
  className,
  itemClassName,
  disabled = false,
}: SortableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const overRef = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const detachRef = useRef<(() => void) | null>(null);
  useEffect(() => () => detachRef.current?.(), []);

  const reset = () => {
    dragRef.current = null;
    overRef.current = null;
    setDragging(null);
    setOver(null);
  };

  useEffect(() => {
    if (dragging === null) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      reset();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  const targetIndex = (x: number, y: number): number | null => {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-sortable-index]");
    if (!target || !containerRef.current?.contains(target)) return null;
    const index = Number(target.dataset.sortableIndex);
    return Number.isInteger(index) ? index : null;
  };

  const startDrag = (index: number, event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      from: index,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    const move = (next: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || next.pointerId !== drag.pointerId) return;
      if (!drag.moved) {
        if (Math.hypot(next.clientX - drag.x, next.clientY - drag.y) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setDragging(drag.from);
      }
      const target = targetIndex(next.clientX, next.clientY);
      overRef.current = target;
      setOver(target);
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      detachRef.current = null;
    };
    const end = (next: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (drag && next.pointerId !== drag.pointerId) return;
      detach();
      const to = overRef.current;
      if (drag?.moved && next.type === "pointerup" && to !== null && to !== drag.from)
        onMoveRef.current(drag.from, to);
      reset();
    };
    detachRef.current?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    detachRef.current = detach;
  };

  const moveByKey = (index: number, event: KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const step =
      event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : 0;
    const to = index + step;
    if (!step || to < 0 || to >= items.length) return;
    event.preventDefault();
    event.stopPropagation();
    onMoveRef.current(index, to);
  };

  return (
    <div ref={containerRef} className={className}>
      {items.map((item, index) => (
        <div
          key={getKey(item)}
          data-sortable-index={index}
          className={cn(
            "transition-opacity duration-150",
            itemClassName,
            dragging === index && "opacity-40",
            over === index &&
              dragging !== null &&
              dragging !== index &&
              "rounded-tau-sm outline-solid outline-2 outline-offset-2 outline-[var(--tau-accent)]"
          )}
        >
          {renderItem(item, {
            index,
            dragging: dragging === index,
            over: over === index && dragging !== null && dragging !== index,
            handleProps: {
              onPointerDown: event => startDrag(index, event),
              onKeyDown: event => moveByKey(index, event),
              tabIndex: disabled ? -1 : 0,
              "aria-roledescription": "可拖动排序",
            },
          })}
        </div>
      ))}
    </div>
  );
}
