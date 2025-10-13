import { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTodoStore } from "@/stores/useTodoStore";
import { TodoItem } from "@/types";
import TodoRow from "./TodoRow";
import classnames from "classnames";

interface DragItem {
  index: number;
  id: number;
  type: string;
  intent?: { toParentId: number | null; beforeId?: number; afterId?: number };
  lastAppliedKey?: string;
}

export interface SortableItemProps {
  item: TodoItem;
  selected: boolean;
  onClick: () => void;
  index: number;
  moveTask: (
    dragIndex: number,
    hoverIndex: number,
    override?: { toParentId: number | null; depth: number },
  ) => void;
  onDragEnd: () => void;
  editingItemId: number | null;
  onStartEdit: (id: number) => void;
  onFinishEdit: () => void;
  isDark?: boolean;
  depth: number;
}

const SortableItem = ({
  item,
  selected,
  onClick,
  index,
  moveTask,
  onDragEnd,
  editingItemId,
  onStartEdit,
  onFinishEdit,
  isDark = false,
  depth,
}: SortableItemProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { moveAndReorder } = useTodoStore();

  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: any; isOver: boolean }
  >({
    accept: "task",
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
        isOver: monitor.isOver(),
      };
    },
    hover(dragItem: DragItem, monitor) {
      if (!ref) return;
      const dragIndex = dragItem.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex || !ref.current) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      // 预览层级（只改 UI）：当达到缩进阈值时，临时把被拖拽项的 parentId/depth 改为目标
      const PREVIEW_INDENT_THRESHOLD = 36;
      const previewOffsetX = clientOffset.x - hoverBoundingRect.left;
      const previewAsChild = previewOffsetX >= PREVIEW_INDENT_THRESHOLD;
      if (previewAsChild) {
        const previewParentId = item.parentId == null ? item.id : item.parentId;
        const previewDepth = item.parentId == null ? depth + 1 : depth;
        moveTask(dragIndex, hoverIndex, {
          toParentId: previewParentId,
          depth: previewDepth,
        });
      } else {
        moveTask(dragIndex, hoverIndex);
      }
      dragItem.index = hoverIndex;

      // 计算实时目标并立即提交（去抖）
      const INDENT_THRESHOLD_PX = 36;
      // 计算鼠标与 hover 元素内容起点的水平距离。
      // 由于缩进改为 margin-left，元素的 left 即为视觉起点。
      const offsetX = clientOffset.x - hoverBoundingRect.left;
      const dropAsChild = offsetX >= INDENT_THRESHOLD_PX;
      const relYTop = clientOffset.y - hoverBoundingRect.top;
      const isUpperHalf = relYTop < hoverMiddleY;

      let toParentId: number | null = item.parentId ?? null;
      let beforeId: number | undefined;
      let afterId: number | undefined;

      if (dropAsChild) {
        // 缩进：成为子任务
        if (item.id === dragItem.id) return; // 自身无效
        const { activeGroupId } = useTodoStore.getState();
        const gid = activeGroupId;
        const all = gid
          ? useTodoStore.getState().itemsByGroupId[gid] || []
          : [];
        const sortedAll = [...all].sort((a, b) => a.sortIndex - b.sortIndex);

        if (item.parentId == null) {
          // 目标为父任务本身：根据上下半区决定插入到子任务“顶部/底部”
          toParentId = item.id;
          const children = sortedAll.filter(
            (x) => (x.parentId ?? null) === toParentId && x.id !== dragItem.id,
          );
          if (isUpperHalf) {
            // 顶部：beforeId 为第一个子任务
            beforeId = children.length > 0 ? children[0].id : undefined;
            afterId = undefined;
          } else {
            // 底部：beforeId 为最后一个子任务
            beforeId =
              children.length > 0
                ? children[children.length - 1].id
                : undefined;
            afterId = undefined;
          }
        } else {
          toParentId = item.parentId;
          const { activeGroupId } = useTodoStore.getState();
          const gid2 = activeGroupId;
          const all2 = gid2
            ? useTodoStore.getState().itemsByGroupId[gid2] || []
            : [];
          const siblings = all2
            .filter(
              (x) =>
                (x.parentId ?? null) === toParentId && x.id !== dragItem.id,
            )
            .sort((a, b) => a.sortIndex - b.sortIndex);
          const i = siblings.findIndex((x) => x.id === item.id);
          if (isUpperHalf) {
            // 目标区间：prevSibling .. hovered
            afterId = i > 0 ? siblings[i - 1].id : undefined;
            beforeId = item.id;
          } else {
            // 目标区间：hovered .. nextSibling
            afterId = item.id;
            beforeId =
              i >= 0 && i < siblings.length - 1
                ? siblings[i + 1].id
                : undefined;
          }
        }
      } else {
        toParentId = item.parentId ?? null;
        const { activeGroupId } = useTodoStore.getState();
        const gid3 = activeGroupId;
        const all3 = gid3
          ? useTodoStore.getState().itemsByGroupId[gid3] || []
          : [];
        const siblings2 = all3
          .filter(
            (x) => (x.parentId ?? null) === toParentId && x.id !== dragItem.id,
          )
          .sort((a, b) => a.sortIndex - b.sortIndex);
        const j = siblings2.findIndex((x) => x.id === item.id);
        if (isUpperHalf) {
          afterId = j > 0 ? siblings2[j - 1].id : undefined;
          beforeId = item.id;
        } else {
          afterId = item.id;
          beforeId =
            j >= 0 && j < siblings2.length - 1
              ? siblings2[j + 1].id
              : undefined;
        }
      }

      const { activeGroupId } = useTodoStore.getState();
      if (!activeGroupId) return;

      const key = `${activeGroupId}|${toParentId ?? "null"}|${beforeId ?? ""}|${afterId ?? ""}`;
      if (dragItem.lastAppliedKey === key) return; // 去抖：位置未变化
      dragItem.lastAppliedKey = key;

      // 防止将任务拖到其自身当父级
      if (toParentId === dragItem.id) return;

      moveAndReorder({
        id: dragItem.id,
        toGroupId: activeGroupId,
        toParentId,
        beforeId,
        afterId,
      });
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: "task",
    item: () => ({ id: item.id, index, type: "task" }),
    collect: (monitor: any) => ({ isDragging: monitor.isDragging() }),
    end: async () => {
      onDragEnd();
    },
  });

  const opacity = isDragging ? 0.4 : 1;
  drag(drop(ref));

  return (
    <div
      ref={ref}
      style={{ opacity }}
      data-handler-id={handlerId}
      onClick={onClick}
    >
      <div className={classnames("relative")}>
        <TodoRow
          id={item.id}
          title={item.title}
          isCompleted={item.isCompleted}
          selected={selected}
          depth={depth}
          dueAt={item.dueAt}
          index={index}
          isEditing={editingItemId === item.id}
          onStartEdit={() => onStartEdit(item.id)}
          onFinishEdit={onFinishEdit}
          isDark={isDark}
        />
      </div>
    </div>
  );
};

export default SortableItem;
