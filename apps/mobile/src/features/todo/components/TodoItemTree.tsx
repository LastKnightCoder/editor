import { CalendarDays, Clock, MoreHorizontal, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
} from "react";
import type { MoveAndReorderTodoItemPayload, TodoItem } from "../../../types";

const LONG_PRESS_MS = 320;
const TAP_GUARD_MS = 120;
const DRAG_START_DISTANCE_PX = 8;
const DROP_EDGE_ZONE_PX = 10;
const ROW_ESTIMATE_PX = 74;
const OVERSCAN_COUNT = 8;
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_STEP_PX = 18;

type TodoItemTreeProps = {
  items: TodoItem[];
  allItems?: TodoItem[];
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  isVisible?: boolean;
  activeTodoId: number | null;
  onOpenDetail: (item: TodoItem) => void;
  onToggleComplete: (item: TodoItem, isCompleted: boolean) => void;
  onOpenActions: (item: TodoItem) => void;
  onMoveAndReorder?: (payload: MoveAndReorderTodoItemPayload) => Promise<void>;
  enableDragSort?: boolean;
};

type TodoItemRowProps = {
  item: TodoItem;
  depth: number;
  isActive: boolean;
  isDragging: boolean;
  isDropBefore: boolean;
  isDropAfter: boolean;
  isDropChild: boolean;
  onOpenDetail: (item: TodoItem) => void;
  onToggleComplete: (item: TodoItem, isCompleted: boolean) => void;
  onOpenActions: (item: TodoItem) => void;
  onRowTouchStart: (item: TodoItem, event: ReactTouchEvent<HTMLDivElement>) => void;
  onRowTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onRowTouchEnd: () => void;
  onRowPointerDown: (item: TodoItem, event: ReactPointerEvent<HTMLDivElement>) => void;
  onRowPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRowPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  suppressTapRef: React.RefObject<boolean>;
};

type TreeRow = {
  item: TodoItem;
  depth: number;
};

type DropPlacement = "before" | "after" | "child-before" | "child-after";

type DropHint = {
  hoverId: number;
  placement: DropPlacement;
};

function sortByOrder(a: TodoItem, b: TodoItem): number {
  if (a.sortIndex !== b.sortIndex) {
    return a.sortIndex - b.sortIndex;
  }
  return a.createTime - b.createTime;
}

function TypeIcon({ type }: { type: TodoItem["type"] }) {
  if (type === "deadline") {
    return <Clock size={13} className="shrink-0 text-amber-500" />;
  }
  if (type === "planned") {
    return <CalendarDays size={13} className="shrink-0 text-blue-500" />;
  }
  if (type === "recurring") {
    return <RefreshCw size={13} className="shrink-0 text-emerald-500" />;
  }
  return null;
}

function buildTreeRows(items: TodoItem[]): TreeRow[] {
  const childrenMap = new Map<number | null, TodoItem[]>();
  items.forEach(item => {
    const parentKey = item.parentId ?? null;
    const list = childrenMap.get(parentKey);
    if (list) {
      list.push(item);
    } else {
      childrenMap.set(parentKey, [item]);
    }
  });
  for (const [, list] of childrenMap) {
    list.sort(sortByOrder);
  }

  const rows: TreeRow[] = [];
  const visit = (parentId: number | null, depth: number) => {
    const children = childrenMap.get(parentId) ?? [];
    children.forEach(child => {
      rows.push({ item: child, depth });
      visit(child.id, depth + 1);
    });
  };
  visit(null, 0);
  return rows;
}

function buildMovePayload(args: {
  allItems: TodoItem[];
  draggedId: number;
  dropHint: DropHint;
}): MoveAndReorderTodoItemPayload | null {
  const { allItems, draggedId, dropHint } = args;
  const itemById = new Map<number, TodoItem>();
  allItems.forEach(item => {
    itemById.set(item.id, item);
  });

  const draggedItem = itemById.get(draggedId);
  const hoverItem = itemById.get(dropHint.hoverId);
  if (!draggedItem || !hoverItem || draggedItem.id === hoverItem.id) {
    return null;
  }

  const wouldCreateCycle = (parentId: number | null): boolean => {
    let currentId = parentId;
    while (currentId != null) {
      if (currentId === draggedItem.id) {
        return true;
      }
      currentId = itemById.get(currentId)?.parentId ?? null;
    }
    return false;
  };

  let toParentId: number | null = hoverItem.parentId ?? null;
  let toGroupId = hoverItem.groupId;
  let beforeId: number | undefined;
  let afterId: number | undefined;

  if (dropHint.placement === "child-before" || dropHint.placement === "child-after") {
    toParentId = hoverItem.id;
    if (wouldCreateCycle(toParentId)) {
      return null;
    }
    toGroupId = hoverItem.groupId;
    const children = allItems
      .filter(
        item =>
          item.groupId === toGroupId &&
          (item.parentId ?? null) === toParentId &&
          item.id !== draggedItem.id
      )
      .sort(sortByOrder);

    if (dropHint.placement === "child-before") {
      beforeId = children[0]?.id;
    } else {
      afterId = children.length > 0 ? children[children.length - 1].id : undefined;
    }
  } else {
    if (toParentId != null && wouldCreateCycle(toParentId)) {
      return null;
    }
    toGroupId =
      toParentId != null
        ? (itemById.get(toParentId)?.groupId ?? hoverItem.groupId)
        : hoverItem.groupId;
    const siblings = allItems
      .filter(
        item =>
          item.groupId === toGroupId &&
          (item.parentId ?? null) === toParentId &&
          item.id !== draggedItem.id
      )
      .sort(sortByOrder);
    const hoverIndex = siblings.findIndex(item => item.id === hoverItem.id);
    if (hoverIndex < 0) {
      return null;
    }

    if (dropHint.placement === "before") {
      beforeId = hoverItem.id;
      afterId = hoverIndex > 0 ? siblings[hoverIndex - 1].id : undefined;
    } else {
      afterId = hoverItem.id;
      beforeId =
        hoverIndex >= 0 && hoverIndex < siblings.length - 1
          ? siblings[hoverIndex + 1].id
          : undefined;
    }
  }

  return {
    id: draggedItem.id,
    toGroupId,
    toParentId,
    beforeId,
    afterId,
  };
}

function resolveDropHint(args: {
  clientX: number;
  clientY: number;
  draggedId: number;
}): DropHint | null {
  const { clientX, clientY, draggedId } = args;
  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!element) {
    return null;
  }
  const rowElement = element.closest("[data-todo-row-id]") as HTMLElement | null;
  if (!rowElement) {
    return null;
  }
  const rowIdRaw = rowElement.dataset.todoRowId;
  const hoverId = Number(rowIdRaw);
  if (!Number.isFinite(hoverId) || hoverId <= 0 || hoverId === draggedId) {
    return null;
  }
  const rect = rowElement.getBoundingClientRect();
  const isUpperHalf = clientY < rect.top + rect.height / 2;
  const edgeZone = Math.min(DROP_EDGE_ZONE_PX, Math.max(4, Math.floor(rect.height / 3)));

  if (clientY <= rect.top + edgeZone) {
    return {
      hoverId,
      placement: "before",
    };
  }
  if (clientY >= rect.bottom - edgeZone) {
    return {
      hoverId,
      placement: "after",
    };
  }

  return {
    hoverId,
    placement: isUpperHalf ? "child-before" : "child-after",
  };
}

function performAutoScroll(scrollElement: HTMLElement | null, clientY: number): void {
  if (!scrollElement) {
    return;
  }
  const rect = scrollElement.getBoundingClientRect();
  const canScrollUp = scrollElement.scrollTop > 0;
  const canScrollDown =
    scrollElement.scrollTop < scrollElement.scrollHeight - scrollElement.clientHeight;

  if (clientY < rect.top + AUTO_SCROLL_EDGE_PX && canScrollUp) {
    scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop - AUTO_SCROLL_STEP_PX);
    return;
  }

  if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX && canScrollDown) {
    const maxScrollTop = scrollElement.scrollHeight - scrollElement.clientHeight;
    scrollElement.scrollTop = Math.min(maxScrollTop, scrollElement.scrollTop + AUTO_SCROLL_STEP_PX);
  }
}

function TodoItemRow({
  item,
  depth,
  isActive,
  isDragging,
  isDropBefore,
  isDropAfter,
  isDropChild,
  onOpenDetail,
  onToggleComplete,
  onOpenActions,
  onRowTouchStart,
  onRowTouchMove,
  onRowTouchEnd,
  onRowPointerDown,
  onRowPointerMove,
  onRowPointerUp,
  suppressTapRef,
}: TodoItemRowProps) {
  const isOverdue =
    !item.isCompleted &&
    item.dueAt != null &&
    Number.isFinite(item.dueAt) &&
    item.dueAt < Date.now();

  return (
    <div
      data-todo-row-id={item.id}
      style={{ marginLeft: `${depth * 14}px` }}
      onTouchStart={event => onRowTouchStart(item, event)}
      onTouchMove={onRowTouchMove}
      onTouchEnd={onRowTouchEnd}
      onTouchCancel={onRowTouchEnd}
      onPointerDown={event => onRowPointerDown(item, event)}
      onPointerMove={onRowPointerMove}
      onPointerUp={onRowPointerUp}
      onPointerCancel={onRowPointerUp}
      className="relative select-none"
    >
      {isDropBefore ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 rounded-full bg-blue-500/80" />
      ) : null}

      <div
        className={`rounded-xl px-3 py-2 transition ${
          isDragging
            ? "bg-blue-100/80 opacity-80 dark:bg-blue-900/30"
            : isActive
              ? "bg-blue-50 dark:bg-blue-900/20"
              : "bg-white dark:bg-neutral-900"
        } ${isDropChild ? "ring-2 ring-blue-400/70" : ""}`}
      >
        <div className="flex items-center gap-2">
          <input
            data-no-drag="true"
            type="checkbox"
            checked={item.isCompleted}
            onChange={event => onToggleComplete(item, event.target.checked)}
            className="h-4 w-4 shrink-0"
          />
          <button
            type="button"
            onClick={() => {
              if (suppressTapRef.current) {
                return;
              }
              onOpenDetail(item);
            }}
            className="flex-1 text-left"
          >
            <div className="flex items-center gap-1.5">
              <TypeIcon type={item.type} />
              <span
                className={`line-clamp-1 text-sm ${
                  item.isCompleted
                    ? "text-gray-400 line-through dark:text-neutral-500"
                    : isOverdue
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-900 dark:text-gray-100"
                }`}
              >
                {item.title}
              </span>
            </div>
            {item.dueAt ? (
              <div className="mt-0.5 pl-[18px] text-[11px] text-gray-400 dark:text-neutral-500">
                {new Date(item.dueAt).toLocaleString()}
              </div>
            ) : null}
          </button>
          <button
            data-no-drag="true"
            type="button"
            onClick={() => {
              if (suppressTapRef.current) {
                return;
              }
              onOpenActions(item);
            }}
            className="rounded-full p-2 text-gray-400 active:bg-gray-100 dark:text-neutral-500 dark:active:bg-neutral-800"
            aria-label="任务操作"
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isDropAfter ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 rounded-full bg-blue-500/80" />
      ) : null}
    </div>
  );
}

export function TodoItemTree({
  items,
  allItems,
  scrollContainerRef,
  isVisible = true,
  activeTodoId,
  onOpenDetail,
  onToggleComplete,
  onOpenActions,
  onMoveAndReorder,
  enableDragSort = true,
}: TodoItemTreeProps) {
  const sourceItems = allItems ?? items;

  const allRows = useMemo(() => buildTreeRows(sourceItems), [sourceItems]);
  const visibleIdSet = useMemo(() => {
    return new Set(items.map(item => item.id));
  }, [items]);
  const visibleRows = useMemo(() => {
    return allRows.filter(row => visibleIdSet.has(row.item.id));
  }, [allRows, visibleIdSet]);
  const rowVirtualizer = useVirtualizer({
    enabled: isVisible,
    count: visibleRows.length,
    getScrollElement: () => scrollContainerRef?.current ?? null,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: OVERSCAN_COUNT,
    getItemKey: index => visibleRows[index]?.item.id ?? index,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [reordering, setReordering] = useState(false);
  const supportsPointerEvents = typeof window !== "undefined" && "PointerEvent" in window;

  const longPressTimerRef = useRef<number | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressItemIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dropHintRef = useRef<DropHint | null>(null);
  const draggedIdRef = useRef<number | null>(null);
  const suppressTapRef = useRef(false);
  const suppressTapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const scrollElement = scrollContainerRef?.current ?? null;
    const rafId = window.requestAnimationFrame(() => {
      rowVirtualizer.measure();
      if (scrollElement) {
        rowVirtualizer.scrollToOffset(scrollElement.scrollTop);
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isVisible, rowVirtualizer, scrollContainerRef, visibleRows.length]);

  useEffect(() => {
    dropHintRef.current = dropHint;
  }, [dropHint]);

  useEffect(() => {
    draggedIdRef.current = draggedId;
  }, [draggedId]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (suppressTapTimerRef.current != null) {
        window.clearTimeout(suppressTapTimerRef.current);
      }
      activePointerIdRef.current = null;
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
    pressItemIdRef.current = null;
  };

  const armTapGuard = () => {
    suppressTapRef.current = true;
    if (suppressTapTimerRef.current != null) {
      window.clearTimeout(suppressTapTimerRef.current);
    }
    suppressTapTimerRef.current = window.setTimeout(() => {
      suppressTapRef.current = false;
      suppressTapTimerRef.current = null;
    }, TAP_GUARD_MS);
  };

  const updateDropHint = useCallback(
    (clientX: number, clientY: number) => {
      const currentDraggedId = draggedIdRef.current;
      if (!currentDraggedId) {
        return;
      }
      performAutoScroll(scrollContainerRef?.current ?? null, clientY);
      const hint = resolveDropHint({
        clientX,
        clientY,
        draggedId: currentDraggedId,
      });
      setDropHint(hint);
    },
    [scrollContainerRef]
  );

  const commitDrop = useCallback(() => {
    const dragged = draggedIdRef.current;
    const hint = dropHintRef.current;
    draggedIdRef.current = null;
    dropHintRef.current = null;
    setDraggedId(null);
    setDropHint(null);
    activePointerIdRef.current = null;

    if (!dragged || !hint || !onMoveAndReorder) {
      armTapGuard();
      return;
    }
    const payload = buildMovePayload({
      allItems: sourceItems,
      draggedId: dragged,
      dropHint: hint,
    });
    if (!payload) {
      armTapGuard();
      return;
    }

    setReordering(true);
    void onMoveAndReorder(payload)
      .catch(() => {
        // 交给上层统一错误提示
      })
      .finally(() => {
        setReordering(false);
        armTapGuard();
      });
  }, [onMoveAndReorder, sourceItems]);

  useEffect(() => {
    if (draggedId == null) {
      return;
    }

    const handleMove = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        return;
      }
      const touch = event.touches[0];
      event.preventDefault();
      updateDropHint(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      commitDrop();
    };

    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);

    return () => {
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
    };
  }, [commitDrop, draggedId, updateDropHint]);

  useEffect(() => {
    if (draggedId == null || !supportsPointerEvents) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
        return;
      }
      event.preventDefault();
      updateDropHint(event.clientX, event.clientY);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
        return;
      }
      commitDrop();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [commitDrop, draggedId, supportsPointerEvents, updateDropHint]);

  const handleRowTouchStart = (item: TodoItem, event: ReactTouchEvent<HTMLDivElement>) => {
    if (!enableDragSort || reordering) {
      return;
    }
    if (event.touches.length !== 1) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-drag='true']")) {
      return;
    }
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const touch = event.touches[0];
    pressStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
    pressItemIdRef.current = item.id;
    longPressTimerRef.current = window.setTimeout(() => {
      const nextDraggedId = pressItemIdRef.current;
      if (nextDraggedId != null) {
        setDraggedId(nextDraggedId);
        armTapGuard();
      }
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleRowTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (draggedId != null) {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        event.preventDefault();
        updateDropHint(touch.clientX, touch.clientY);
      }
      return;
    }
    if (longPressTimerRef.current == null || event.touches.length !== 1) {
      return;
    }
    const start = pressStartRef.current;
    if (!start) {
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > DRAG_START_DISTANCE_PX) {
      clearLongPressTimer();
    }
  };

  const handleRowTouchEnd = () => {
    if (draggedId != null) {
      commitDrop();
      return;
    }
    if (draggedId == null) {
      clearLongPressTimer();
    }
  };

  const handleRowPointerDown = (item: TodoItem, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!supportsPointerEvents) {
      return;
    }
    if (event.pointerType === "touch") {
      return;
    }
    if (!enableDragSort || reordering) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-drag='true']")) {
      return;
    }
    activePointerIdRef.current = event.pointerId;
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    pressItemIdRef.current = item.id;
    longPressTimerRef.current = window.setTimeout(() => {
      const nextDraggedId = pressItemIdRef.current;
      if (nextDraggedId != null) {
        setDraggedId(nextDraggedId);
        armTapGuard();
      }
      clearLongPressTimer();
    }, LONG_PRESS_MS);
  };

  const handleRowPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!supportsPointerEvents) {
      return;
    }
    if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
      return;
    }
    if (draggedId != null) {
      event.preventDefault();
      updateDropHint(event.clientX, event.clientY);
      return;
    }
    if (longPressTimerRef.current == null) {
      return;
    }
    const start = pressStartRef.current;
    if (!start) {
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > DRAG_START_DISTANCE_PX) {
      clearLongPressTimer();
    }
  };

  const handleRowPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!supportsPointerEvents) {
      return;
    }
    if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
      return;
    }
    activePointerIdRef.current = null;
    if (draggedId != null) {
      commitDrop();
      return;
    }
    clearLongPressTimer();
  };

  if (visibleRows.length === 0) {
    return (
      <div className="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-500 dark:bg-neutral-900 dark:text-neutral-400">
        当前分组还没有任务，先添加一条吧
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      {!enableDragSort ? (
        <div className="mb-2 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
          当前筛选条件下已禁用拖拽排序，清空筛选后可长按拖拽
        </div>
      ) : null}
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {virtualRows.map(virtualRow => {
          const row = visibleRows[virtualRow.index];
          if (!row) {
            return null;
          }
          const { item, depth } = row;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="pb-2"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                boxSizing: "border-box",
              }}
            >
              <TodoItemRow
                item={item}
                depth={depth}
                isActive={activeTodoId === item.id}
                isDragging={draggedId === item.id}
                isDropBefore={dropHint?.hoverId === item.id && dropHint.placement === "before"}
                isDropAfter={dropHint?.hoverId === item.id && dropHint.placement === "after"}
                isDropChild={
                  dropHint?.hoverId === item.id &&
                  (dropHint.placement === "child-before" || dropHint.placement === "child-after")
                }
                onOpenDetail={onOpenDetail}
                onToggleComplete={onToggleComplete}
                onOpenActions={onOpenActions}
                onRowTouchStart={handleRowTouchStart}
                onRowTouchMove={handleRowTouchMove}
                onRowTouchEnd={handleRowTouchEnd}
                onRowPointerDown={handleRowPointerDown}
                onRowPointerMove={handleRowPointerMove}
                onRowPointerUp={handleRowPointerUp}
                suppressTapRef={suppressTapRef}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TodoItemTree;
