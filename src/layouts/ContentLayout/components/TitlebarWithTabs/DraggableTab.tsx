import { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { CloseOutlined } from "@ant-design/icons";
import { ITab } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";
import useThemeColors from "@/hooks/useThemeColors";

interface DraggableTabProps {
  tab: ITab;
  paneId: string;
  index: number;
  isActive: boolean;
  onClose: (e: React.MouseEvent) => void;
  onSwitch: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: (
    tab: ITab,
    paneId: string,
    dropZone?: "left" | "right" | "top" | "bottom",
  ) => void;
  groupColor?: string;
}

type TabDragItem = {
  type: "TAB";
  tab: ITab;
  paneId: string;
  index: number;
  lastMoveKey?: string;
  originalPaneId?: string;
};

type TabGroupDragItem = {
  type: "TAB_GROUP";
  groupId: string;
  paneId: string;
  lastMoveKey?: string;
  originalPaneId?: string;
};

type DragItem = TabDragItem | TabGroupDragItem;

const DraggableTab = memo((props: DraggableTabProps) => {
  const {
    tab,
    paneId,
    index,
    isActive,
    onClose,
    onSwitch,
    onMove,
    onDragEnd,
    groupColor,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const reorderTabGroup = useTabStore((state) => state.reorderTabGroup);
  const moveTabGroupToTab = useTabStore((state) => state.moveTabGroupToTab);
  const { hoverClass, activeClass } = useThemeColors();

  const [{ isDragging }, drag] = useDrag<
    TabDragItem,
    void,
    { isDragging: boolean }
  >({
    type: "TAB",
    item: () => ({
      type: "TAB",
      tab,
      paneId,
      index,
      originalPaneId: paneId, // 记录原始 paneId
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop();
      const dropResult = monitor.getDropResult() as {
        paneId: string;
        dropZone?: "left" | "right" | "top" | "bottom" | "group";
      } | null;

      if (!didDrop || !dropResult) {
        return;
      }

      const { dropZone } = dropResult;

      // 分屏逻辑仍然交给上层 Titlebar 处理
      if (dropZone && dropZone !== "group") {
        onDragEnd(item.tab, item.paneId, dropZone);
        return;
      }

      // dropZone 为 "group" 时，分组逻辑已经在 TabGroupHeader.onDropTabToGroup 中完成
      if (dropZone === "group") {
        return;
      }

      // 如果在 hover 中已经处理过跨 pane 移动，就不再处理
      if (item.originalPaneId && item.originalPaneId !== item.paneId) {
        return;
      }

      // 其他情况（同 pane 普通移动）交给上层处理
      onDragEnd(item.tab, item.paneId, undefined);
    },
  });

  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: ["TAB", "TAB_GROUP"],
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
    hover: (item: DragItem, monitor) => {
      if (!ref.current) {
        return;
      }

      if (item.type === "TAB") {
        // 跨 pane 拖拽
        if (item.paneId !== paneId) {
          // 使用防抖标记避免重复触发
          const moveKey = `${item.tab.id}-${paneId}-${index}`;
          if (item.lastMoveKey === moveKey) {
            return;
          }
          item.lastMoveKey = moveKey;

          // 记录原始 paneId（只记录第一次）
          if (!item.originalPaneId) {
            item.originalPaneId = item.paneId;
          }

          // 跨 pane 移动 tab 到指定位置
          const moveTabToPane = useTabStore.getState().moveTabToPane;
          moveTabToPane(item.paneId, paneId, item.tab.id, index);

          // 更新 item 的 paneId，因为 tab 已经在新 pane 中了
          item.paneId = paneId;
          item.index = index;

          // 处理分组变化
          if (item.tab.groupId !== tab.groupId) {
            if (tab.groupId) {
              // 目标 tab 在分组中，将拖动的 tab 加入该分组
              useTabStore
                .getState()
                .setTabGroup(paneId, item.tab.id, tab.groupId);
              item.tab.groupId = tab.groupId;
            }
            // 如果目标 tab 不在分组中，groupId 已经在 moveTabToPane 中被清除了
          }

          return;
        }

        // 同一 pane 内排序
        const dragIndex = item.index;
        const hoverIndex = index;

        // 不替换自己
        if (dragIndex === hoverIndex) {
          return;
        }

        // 确定鼠标位置
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleX =
          (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientX = clientOffset.x - hoverBoundingRect.left;

        // 拖拽向右时,只在鼠标超过50%时才交换
        if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) {
          return;
        }

        // 拖拽向左时,只在鼠标超过50%时才交换
        if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) {
          return;
        }

        // 处理分组变化
        if (item.tab.groupId !== tab.groupId) {
          // 如果拖动的 tab 和目标 tab 的分组不同，需要更新分组
          if (tab.groupId) {
            // 目标 tab 在分组中，将拖动的 tab 加入该分组
            useTabStore
              .getState()
              .setTabGroup(paneId, item.tab.id, tab.groupId);
            item.tab.groupId = tab.groupId;
          } else if (item.tab.groupId) {
            // 目标 tab 不在分组中，取消拖动 tab 的分组
            useTabStore.getState().setTabGroup(paneId, item.tab.id, undefined);
            item.tab.groupId = undefined;
          }
        }

        // 执行交换
        onMove(dragIndex, hoverIndex);

        // 更新索引以避免重复触发
        item.index = hoverIndex;
        return;
      }

      if (item.type === "TAB_GROUP") {
        // 不允许拖到自己分组内的 tab 上
        if (item.groupId === tab.groupId) {
          return;
        }

        // 跨 pane 拖拽分组
        if (item.paneId !== paneId) {
          // 使用防抖标记避免重复触发
          const moveKey = `${item.groupId}-${paneId}-${tab.id}`;
          if (item.lastMoveKey === moveKey) {
            return;
          }
          item.lastMoveKey = moveKey;

          // 记录原始 paneId（只记录第一次）
          if (!item.originalPaneId) {
            item.originalPaneId = item.paneId;
          }

          // 跨 pane 移动整个分组
          const moveTabGroupToPane = useTabStore.getState().moveTabGroupToPane;
          moveTabGroupToPane(item.paneId, paneId, item.groupId);

          // 更新 item 的 paneId
          item.paneId = paneId;

          return;
        }

        // 同一 pane 内的分组拖拽
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleX =
          (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return;
        const hoverClientX = clientOffset.x - hoverBoundingRect.left;
        const position: "before" | "after" =
          hoverClientX < hoverMiddleX ? "before" : "after";

        if (tab.groupId) {
          // 当前 tab 在分组中，分组和分组之间排序
          reorderTabGroup(paneId, item.groupId, tab.groupId, position);
        } else {
          // 当前 tab 不在分组中，分组拖到普通 tab 的位置
          moveTabGroupToTab(paneId, item.groupId, tab.id, position);
        }
      }
    },
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={classnames(
        "flex items-center gap-2 px-3 h-8 rounded-md cursor-pointer select-none max-w-[200px] group transition-all app-region-no-drag border-b-2 border-transparent",
        hoverClass,
        {
          [activeClass]: isActive,
          "opacity-40": isDragging,
        },
      )}
      style={
        groupColor
          ? {
              borderBottomColor: groupColor,
            }
          : undefined
      }
      onClick={onSwitch}
    >
      <span className="flex-1 text-sm truncate text-(--text-color)">
        {tab.title}
      </span>
      {tab.closable && (
        <button
          className={classnames(
            "flex items-center justify-center w-3 h-3 border-none cursor-pointer text-sm rounded-full text-(--text-secondary-color) transition-all",
            hoverClass,
          )}
          onClick={onClose}
        >
          <CloseOutlined className="text-[10px]" />
        </button>
      )}
    </div>
  );
});

export default DraggableTab;
