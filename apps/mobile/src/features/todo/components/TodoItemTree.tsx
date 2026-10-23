import { CalendarDays, Check, Clock, MoreHorizontal, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  onOpenDetail: (item: TodoItem) => void;
  onToggleComplete: (item: TodoItem, isCompleted: boolean) => void;
  onOpenActions: (item: TodoItem) => void;
  onMoveAndReorder?: (payload: MoveAndReorderTodoItemPayload) => Promise<void>;
  enableDragSort?: boolean;
};

type TodoItemRowProps = {
  item: TodoItem;
  depth: number;
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
    return <Clock size={13} className="text-tag-4 shrink-0" />;
  }
  if (type === "planned") {
    return <CalendarDays size={13} className="text-tag-2 shrink-0" />;
  }
  if (type === "recurring") {
    return <RefreshCw size={13} className="text-tag-1 shrink-0" />;
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

// 任务行：圆形勾选框 + 虚线分隔；memo 依赖的回调在 Tree 层已稳定化，
// 拖拽期间只有被拖行与落点行的 memo 失效。
const TodoItemRow = memo(function TodoItemRow({
  item,
  depth,
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
      className={`border-line-1 relative select-none border-b border-dashed ${
        isDragging ? "opacity-80" : ""
      }`}
    >
      {isDropBefore ? (
        <div className="bg-accent/80 pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 rounded-full" />
      ) : null}

      <div
        className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${
          isDragging ? "bg-accent-soft" : "active:bg-hover"
        } ${isDropChild ? "ring-accent/60 ring-2 ring-inset" : ""}`}
      >
        <button
          data-no-drag="true"
          type="button"
          role="checkbox"
          aria-checked={item.isCompleted}
          aria-label={item.isCompleted ? "标记为未完成" : "标记为已完成"}
          onClick={() => onToggleComplete(item, !item.isCompleted)}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-200 ${
            item.isCompleted
              ? "border-accent bg-accent shadow-lift rotate-[360deg]"
              : "border-ink-3/50 bg-surface"
          }`}
        >
          {item.isCompleted ? (
            <Check size={13} strokeWidth={3.4} className="text-ink-inverse" aria-hidden="true" />
          ) : null}
        </button>

        <button
          type="button"
          onClick={() => {
            if (suppressTapRef.current) {
              return;
            }
            onOpenDetail(item);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            <TypeIcon type={item.type} />
            <span
              className={`line-clamp-1 text-[14px] font-semibold ${
                item.isCompleted
                  ? "text-ink-3 decoration-tag-5 line-through decoration-2"
                  : isOverdue
                    ? "text-tag-5"
                    : "text-ink-1"
              }`}
            >
              {item.title}
            </span>
          </div>
          {item.dueAt ? (
            <div className="text-ink-3 mt-0.5 pl-[19px] text-[10.5px] tabular-nums">
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
          className="text-ink-3 active:bg-hover -mr-1 rounded-full p-2"
          aria-label="任务操作"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
      </div>

      {isDropAfter ? (
        <div className="bg-accent/80 pointer-events-none absolute inset-x-0 bottom-0 z-10 h-0.5 rounded-full" />
      ) : null}
    </div>
  );
});

export function TodoItemTree({
  items,
  allItems,
  scrollContainerRef,
  isVisible = true,
  onOpenDetail,
  onToggleComplete,
  onOpenActions,
  onMoveAndReorder,
  enableDragSort = true,
}: TodoItemTreeProps) {
  const sourceItems = allItems ?? items;

  // 上层常传内联回调：经 ref 转发为稳定引用，保证行级 memo 生效
  const onOpenDetailRef = useRef(onOpenDetail);
  onOpenDetailRef.current = onOpenDetail;
  const onToggleCompleteRef = useRef(onToggleComplete);
  onToggleCompleteRef.current = onToggleComplete;
  const onOpenActionsRef = useRef(onOpenActions);
  onOpenActionsRef.current = onOpenActions;

  const handleOpenDetail = useCallback((item: TodoItem) => {
    onOpenDetailRef.current(item);
  }, []);
  const handleToggleComplete = useCallback((item: TodoItem, isCompleted: boolean) => {
    onToggleCompleteRef.current(item, isCompleted);
  }, []);
  const handleOpenActions = useCallback((item: TodoItem) => {
    onOpenActionsRef.current(item);
  }, []);

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
  const dragEnabledRef = useRef(enableDragSort);
  dragEnabledRef.current = enableDragSort && !reordering;
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

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
    pressItemIdRef.current = null;
  }, []);

  const armTapGuard = useCallback(() => {
    suppressTapRef.current = true;
    if (suppressTapTimerRef.current != null) {
      window.clearTimeout(suppressTapTimerRef.current);
    }
    suppressTapTimerRef.current = window.setTimeout(() => {
      suppressTapRef.current = false;
      suppressTapTimerRef.current = null;
    }, TAP_GUARD_MS);
  }, []);

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
      setDropHint(prev =>
        prev?.hoverId === hint?.hoverId && prev?.placement === hint?.placement ? prev : hint
      );
    },
    [scrollContainerRef]
  );

  const onMoveAndReorderRef = useRef(onMoveAndReorder);
  onMoveAndReorderRef.current = onMoveAndReorder;
  const sourceItemsRef = useRef(sourceItems);
  sourceItemsRef.current = sourceItems;

  const commitDrop = useCallback(() => {
    const dragged = draggedIdRef.current;
    const hint = dropHintRef.current;
    draggedIdRef.current = null;
    dropHintRef.current = null;
    setDraggedId(null);
    setDropHint(null);
    activePointerIdRef.current = null;

    if (!dragged || !hint || !onMoveAndReorderRef.current) {
      armTapGuard();
      return;
    }
    const payload = buildMovePayload({
      allItems: sourceItemsRef.current,
      draggedId: dragged,
      dropHint: hint,
    });
    if (!payload) {
      armTapGuard();
      return;
    }

    setReordering(true);
    void onMoveAndReorderRef
      .current(payload)
      .catch(() => {
        // 交给上层统一错误提示
      })
      .finally(() => {
        setReordering(false);
        armTapGuard();
      });
  }, [armTapGuard]);

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

  // 行级手势 handler 一律读 ref（draggedId/reordering/dragEnabled），
  // 保证引用恒定——否则拖拽期间每次 setDropHint 都会重建全部可见行
  const handleRowTouchStart = useCallback(
    (item: TodoItem, event: ReactTouchEvent<HTMLDivElement>) => {
      if (!dragEnabledRef.current) {
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
    },
    [armTapGuard, clearLongPressTimer]
  );

  const handleRowTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (draggedIdRef.current != null) {
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
    },
    [clearLongPressTimer, updateDropHint]
  );

  const handleRowTouchEnd = useCallback(() => {
    if (draggedIdRef.current != null) {
      commitDrop();
      return;
    }
    clearLongPressTimer();
  }, [clearLongPressTimer, commitDrop]);

  const handleRowPointerDown = useCallback(
    (item: TodoItem, event: ReactPointerEvent<HTMLDivElement>) => {
      if (!supportsPointerEvents) {
        return;
      }
      if (event.pointerType === "touch") {
        return;
      }
      if (!dragEnabledRef.current) {
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
    },
    [armTapGuard, clearLongPressTimer, supportsPointerEvents]
  );

  const handleRowPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!supportsPointerEvents) {
        return;
      }
      if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
        return;
      }
      if (draggedIdRef.current != null) {
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
    },
    [clearLongPressTimer, supportsPointerEvents, updateDropHint]
  );

  const handleRowPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!supportsPointerEvents) {
        return;
      }
      if (activePointerIdRef.current == null || event.pointerId !== activePointerIdRef.current) {
        return;
      }
      activePointerIdRef.current = null;
      if (draggedIdRef.current != null) {
        commitDrop();
        return;
      }
      clearLongPressTimer();
    },
    [clearLongPressTimer, commitDrop, supportsPointerEvents]
  );

  if (visibleRows.length === 0) {
    return (
      <div className="list-group text-ink-3 px-4 py-8 text-center text-sm">
        当前分组还没有任务，先添加一条吧
      </div>
    );
  }

  return (
    <div className="pb-6">
      {!enableDragSort ? (
        <div className="bg-page text-ink-3 mb-3 rounded-full px-4 py-2 text-center text-xs font-medium">
          当前筛选条件下已禁用拖拽排序，清空筛选后可长按拖拽
        </div>
      ) : null}
      <div className="list-group relative mx-4">
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
                  isDragging={draggedId === item.id}
                  isDropBefore={dropHint?.hoverId === item.id && dropHint.placement === "before"}
                  isDropAfter={dropHint?.hoverId === item.id && dropHint.placement === "after"}
                  isDropChild={
                    dropHint?.hoverId === item.id &&
                    (dropHint.placement === "child-before" || dropHint.placement === "child-after")
                  }
                  onOpenDetail={handleOpenDetail}
                  onToggleComplete={handleToggleComplete}
                  onOpenActions={handleOpenActions}
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
    </div>
  );
}

export default TodoItemTree;
