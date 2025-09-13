import { useState, useEffect, useMemo } from "react";
import { useTodoStore } from "@/stores/todo";
import { TodoItem } from "@/types";
import SortableItem from "./SortableItem";
import classnames from "classnames";

const DEFAULT_ITEMS = [] as TodoItem[];

export interface TodoTreeProps {
  isDark?: boolean;
}

const TodoTree = ({ isDark = false }: TodoTreeProps = {}) => {
  const {
    activeGroupId,
    itemsByGroupId,
    setActiveTodo,
    activeTodoId,
    filters,
  } = useTodoStore();
  const items = itemsByGroupId[activeGroupId || -1] || DEFAULT_ITEMS;

  // 编辑状态管理
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  // 构建父子层级并扁平化（父节点在前，随后紧跟所有子节点）
  const displayList = useMemo(() => {
    const byParent = new Map<number | null, TodoItem[]>();
    const sorted = [...items].sort((a, b) => a.sortIndex - b.sortIndex);
    sorted.forEach((it) => {
      const key = it.parentId ?? null;
      const arr = byParent.get(key) || [];
      arr.push(it);
      byParent.set(key, arr);
    });

    const result: Array<{
      item: TodoItem;
      depth: number;
      hasChildren: boolean;
    }> = [];
    const walk = (parentId: number | null, depth: number) => {
      const list = byParent.get(parentId) || [];
      for (const it of list) {
        const children = byParent.get(it.id) || [];
        result.push({ item: it, depth, hasChildren: children.length > 0 });
        walk(it.id, depth + 1);
      }
    };
    walk(null, 0);

    // 过滤
    const now = Date.now();
    const filtered = result.filter(({ item }) => {
      if (filters.completed === true && !item.isCompleted) return false;
      if (filters.completed === false && item.isCompleted) return false;
      if (
        filters.overdue &&
        !(!item.isCompleted && item.dueAt && item.dueAt < now)
      )
        return false;
      return true;
    });
    return filtered;
  }, [items, filters.completed, filters.overdue]);

  // 用于拖拽时的临时状态
  const [localList, setLocalList] = useState(displayList);
  const [isDragging, setIsDragging] = useState(false);

  // 当不在拖拽时，同步显示列表
  useEffect(() => {
    if (!isDragging) {
      setLocalList(displayList);
    }
  }, [displayList, isDragging]);

  const moveTask = (
    dragIndex: number,
    hoverIndex: number,
    override?: { toParentId: number | null; depth: number },
  ) => {
    setIsDragging(true);
    const newList = [...localList];
    const [removed] = newList.splice(dragIndex, 1);
    const adjusted = override
      ? {
          item: { ...removed.item, parentId: override.toParentId },
          depth: override.depth,
          hasChildren: removed.hasChildren,
        }
      : removed;
    newList.splice(hoverIndex, 0, adjusted);
    setLocalList(newList);
  };

  const handleDragEnd = () => {
    // 实时模式：不做任何数据操作，立即结束拖拽态
    setIsDragging(false);
  };

  const handleStartEdit = (id: number) => {
    setEditingItemId(id);
  };

  const handleFinishEdit = () => {
    setEditingItemId(null);
  };

  return (
    <div className={classnames("h-full flex flex-col gap-2 overflow-auto")}>
      {localList.map(({ item: it, depth }, index) => (
        <SortableItem
          key={it.id}
          item={it}
          index={index}
          selected={activeTodoId === it.id}
          onClick={() => setActiveTodo(it.id)}
          moveTask={moveTask}
          onDragEnd={handleDragEnd}
          editingItemId={editingItemId}
          onStartEdit={handleStartEdit}
          onFinishEdit={handleFinishEdit}
          isDark={isDark}
          depth={depth}
        />
      ))}
      {localList.length === 0 && (
        <div
          className={classnames(
            "text-center py-8 text-sm",
            isDark ? "text-gray-400" : "text-gray-500",
          )}
        >
          暂无任务
        </div>
      )}
    </div>
  );
};

export default TodoTree;
