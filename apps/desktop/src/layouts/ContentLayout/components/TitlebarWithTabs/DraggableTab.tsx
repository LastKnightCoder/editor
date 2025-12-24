import { memo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import classnames from "classnames";
import { CloseOutlined } from "@ant-design/icons";
import { ITab } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";
import useThemeColors from "@/hooks/useThemeColors";
import useBackgroundMode from "@/hooks/useBackgroundMode";
import useSettingStore from "@/stores/useSettingStore";

interface DraggableTabProps {
  tab: ITab;
  paneId: string;
  index: number;
  isActive: boolean;
  isFirst: boolean;
  isPrevActive: boolean;
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
    isFirst,
    isPrevActive,
    onClose,
    onSwitch,
    onMove,
    onDragEnd,
    groupColor,
  } = props;
  const ref = useRef<HTMLDivElement>(null);
  const reorderTabGroup = useTabStore((state) => state.reorderTabGroup);
  const moveTabGroupToTab = useTabStore((state) => state.moveTabGroupToTab);
  const { hoverClass, divideCalass } = useThemeColors();
  const { backgroundType } = useBackgroundMode();
  const isDarkMode = useSettingStore((state) => state.setting.darkMode);

  // 获取 active 状态的背景色类（纯色，类似 hover 但稍深）
  const getActiveClass = () => {
    if (backgroundType === "solid") {
      return "bg-gray-100 dark:bg-gray-800";
    }
    const themeMap: Record<string, string> = {
      gradient1: "bg-purple-500/[0.18] dark:bg-purple-400/[0.22]",
      gradient2: "bg-blue-500/[0.18] dark:bg-blue-400/[0.22]",
      gradient3: "bg-orange-500/[0.18] dark:bg-orange-400/[0.22]",
      gradient4: "bg-green-500/[0.18] dark:bg-green-400/[0.22]",
      gradient5: "bg-pink-500/[0.18] dark:bg-pink-400/[0.22]",
      gradient6: "bg-gray-500/[0.18] dark:bg-gray-400/[0.22]",
      gradient7: "bg-cyan-500/[0.18] dark:bg-cyan-400/[0.22]",
      gradient8: "bg-amber-500/[0.18] dark:bg-amber-400/[0.22]",
      gradient9: "bg-red-500/[0.18] dark:bg-red-400/[0.22]",
    };
    return themeMap[backgroundType] || themeMap.gradient1;
  };

  // 根据主题获取激活 tab 的背景色（用于圆弧）
  const getActiveTabBgColor = () => {
    if (backgroundType === "solid") {
      return isDarkMode ? "rgba(31, 41, 55, 1)" : "rgba(243, 244, 246, 1)"; // gray-800 : gray-100
    }
    // 使用和 active 背景一致的颜色（xxx-500/18% 或 xxx-400/22%）
    const themeColors: Record<string, { light: string; dark: string }> = {
      gradient1: {
        light: "rgba(168, 85, 247, 0.18)",
        dark: "rgba(192, 132, 252, 0.22)",
      },
      gradient2: {
        light: "rgba(59, 130, 246, 0.18)",
        dark: "rgba(96, 165, 250, 0.22)",
      },
      gradient3: {
        light: "rgba(249, 115, 22, 0.18)",
        dark: "rgba(251, 146, 60, 0.22)",
      },
      gradient4: {
        light: "rgba(34, 197, 94, 0.18)",
        dark: "rgba(74, 222, 128, 0.22)",
      },
      gradient5: {
        light: "rgba(236, 72, 153, 0.18)",
        dark: "rgba(244, 114, 182, 0.22)",
      },
      gradient6: {
        light: "rgba(107, 114, 128, 0.18)",
        dark: "rgba(156, 163, 175, 0.22)",
      },
      gradient7: {
        light: "rgba(6, 182, 212, 0.18)",
        dark: "rgba(34, 211, 238, 0.22)",
      },
      gradient8: {
        light: "rgba(245, 158, 11, 0.18)",
        dark: "rgba(251, 191, 36, 0.22)",
      },
      gradient9: {
        light: "rgba(239, 68, 68, 0.18)",
        dark: "rgba(248, 113, 113, 0.22)",
      },
    };
    const theme = themeColors[backgroundType] || themeColors.gradient1;
    return isDarkMode ? theme.dark : theme.light;
  };

  const activeTabBgColor = getActiveTabBgColor();

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

  // 是否显示左侧分隔线：不是第一个 tab、当前 tab 和前一个 tab 都不是激活状态
  const showDivider = !isFirst && !isActive && !isPrevActive;

  return (
    <div className="flex items-center h-8 group">
      <div
        className={classnames(
          "w-0.5 h-3 shrink-0 mr-1 rounded-full transition-opacity group-hover:opacity-0",
          divideCalass,
          {
            "opacity-0": !showDivider,
            "opacity-100": showDivider,
          },
        )}
      />
      <div
        ref={ref}
        data-handler-id={handlerId}
        className={classnames(
          "flex w-full min-w-[72px] items-center gap-2 px-3 cursor-pointer select-none max-w-[200px] transition-colors duration-150 app-region-no-drag border-b-2 border-transparent relative",
          isActive ? getActiveClass() : "",
          isActive ? "rounded-t-lg h-8 my-0" : "h-7 my-0.5 rounded-lg",
          !isActive ? hoverClass : "",
          {
            "opacity-40": isDragging,
          },
        )}
        style={
          isActive
            ? {
                borderRadius: "8px 8px 0 0",
                ...(groupColor ? { borderBottomColor: groupColor } : {}),
              }
            : groupColor
              ? { borderBottomColor: groupColor }
              : undefined
        }
        onClick={onSwitch}
      >
        {isActive && (
          <>
            <div
              className="absolute bottom-[-2px] left-[-12px] w-3 h-3 pointer-events-none will-change-auto"
              style={{
                background: `radial-gradient(circle at top left, transparent 12px, ${activeTabBgColor} 12px)`,
                transition: "none",
              }}
            />
            <div
              className="absolute bottom-[-2px] right-[-12px] w-3 h-3 pointer-events-none will-change-auto"
              style={{
                background: `radial-gradient(circle at top right, transparent 12px, ${activeTabBgColor} 12px)`,
                transition: "none",
              }}
            />
          </>
        )}
        <span className="flex-1 min-w-0 text-sm truncate text-(--text-color)">
          {tab.title}
        </span>
        <button
          className={classnames(
            "flex items-center justify-center w-4 h-4 border-none cursor-pointer text-sm rounded-full text-(--text-secondary-color) transition-all opacity-0 group-hover:opacity-100",
            hoverClass,
            {
              "opacity-100": isActive,
            },
          )}
          onClick={onClose}
          type="button"
          aria-label="关闭标签页"
        >
          <CloseOutlined className="text-[10px]" />
        </button>
      </div>
    </div>
  );
});

export default DraggableTab;
