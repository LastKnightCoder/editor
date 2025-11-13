import { memo, useState, useCallback } from "react";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import SVG from "react-inlinesvg";
import { PlusOutlined } from "@ant-design/icons";
import { PushpinOutlined } from "@ant-design/icons";
import { useDrop } from "react-dnd";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useSmallComponentSidebarStore from "@/stores/useSmallComponentSidebar";
import useTabStore from "@/stores/useTabStore";

import TitlebarIcon from "@/components/TitlebarIcon";
import { setAlwaysOnTop as setTop } from "@/commands";
import DraggableTab from "./DraggableTab";

import sidebarRightIcon from "@/assets/icons/sidebar-right.svg";
import chatIcon from "@/assets/icons/chat.svg";
import smallComponentIcon from "@/assets/icons/small-components.svg";
import { ITab, TabType, PaneDirection } from "@/types/tab";

interface TitlebarWithTabsProps {
  paneId: string;
  className?: string;
  showRightControls?: boolean;
}

const TitlebarWithTabs = memo((props: TitlebarWithTabsProps) => {
  const { paneId, className, showRightControls = true } = props;
  const chatSidebarOpen = useChatMessageStore((state) => state.open);
  const rightSidebarOpen = useRightSidebarStore((state) => state.open);
  const smallComponentSidebarOpen = useSmallComponentSidebarStore(
    (state) => state.open,
  );

  const panes = useTabStore((state) => state.panes);
  const createTab = useTabStore((state) => state.createTab);
  const closeTab = useTabStore((state) => state.closeTab);
  const switchTab = useTabStore((state) => state.switchTab);
  const reorderTab = useTabStore((state) => state.reorderTab);
  const moveTabToPane = useTabStore((state) => state.moveTabToPane);
  const createPaneWithTab = useTabStore((state) => state.createPaneWithTab);

  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);

  const pane = panes.find((p) => p.id === paneId);

  const toggleAlwaysOnTop = async () => {
    setAlwaysOnTop(!alwaysOnTop);
    await setTop(!alwaysOnTop);
  };

  const handleOpenChatSidebar = useMemoizedFn(() => {
    if (chatSidebarOpen) {
      useChatMessageStore.setState({
        open: false,
      });
      return;
    }
    useRightSidebarStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: false,
    });
    useChatMessageStore.setState({
      open: true,
    });
  });

  const handleOpenRightSidebar = useMemoizedFn(() => {
    if (rightSidebarOpen) {
      useRightSidebarStore.setState({
        open: false,
      });
      return;
    }
    useChatMessageStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: false,
    });
    useRightSidebarStore.setState({
      open: true,
    });
  });

  const handleOpenSmallComponentSidebar = useMemoizedFn(() => {
    if (smallComponentSidebarOpen) {
      useSmallComponentSidebarStore.setState({
        open: false,
      });
      return;
    }
    useChatMessageStore.setState({
      open: false,
    });
    useRightSidebarStore.setState({
      open: false,
    });
    useSmallComponentSidebarStore.setState({
      open: true,
    });
  });

  const handleNewTab = useMemoizedFn(() => {
    createTab(TabType.Home, undefined, paneId);
  });

  const handleCloseTab = useMemoizedFn((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(paneId, tabId);
  });

  const handleSwitchTab = useMemoizedFn((tabId: string) => {
    switchTab(paneId, tabId);
  });

  const handleMoveTab = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      reorderTab(paneId, dragIndex, hoverIndex);
    },
    [paneId, reorderTab],
  );

  const handleDragEnd = useCallback(
    (
      tab: ITab,
      sourcePaneId: string,
      dropZone?: "left" | "right" | "top" | "bottom",
    ) => {
      // 如果有 dropZone，说明要分屏
      if (dropZone) {
        const direction =
          dropZone === "left" || dropZone === "right"
            ? PaneDirection.Horizontal
            : PaneDirection.Vertical;

        // 创建新 pane 并移动 tab（原子操作）
        createPaneWithTab(sourcePaneId, tab.id, direction, 0.5);
      } else if (sourcePaneId !== paneId) {
        // 拖到另一个 pane（非边缘区域）
        moveTabToPane(sourcePaneId, paneId, tab.id);
      }
    },
    [paneId, createPaneWithTab, moveTabToPane],
  );

  // 接收拖拽的 Drop Zone
  const [, drop] = useDrop({
    accept: "TAB",
    drop: () => {
      // 标题栏 drop 返回 paneId，不带 dropZone（表示直接移动，不分屏）
      return { paneId, dropZone: undefined };
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  if (!pane) return null;

  return (
    <div
      ref={drop}
      className={classnames(
        "w-full h-[60px] box-border flex items-center justify-between bg-[var(--main-bg-color)] flex-shrink-0 border-b border-[#f0f0f0] dark:border-[#2a2a2a] relative",
        className,
      )}
      style={{ "--webkit-app-region": "drag" } as React.CSSProperties}
    >
      <div
        className={classnames(
          "flex-1 min-w-0 flex items-center gap-1 overflow-x-auto overflow-y-hidden px-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-[var(--border-color)] [&::-webkit-scrollbar-thumb]:rounded-sm transition-all",
        )}
        style={{ "--webkit-app-region": "no-drag" } as React.CSSProperties}
      >
        {pane.tabs.map((tab, index) => (
          <DraggableTab
            key={tab.id}
            tab={tab}
            paneId={paneId}
            index={index}
            isActive={tab.id === pane.activeTabId}
            onClose={(e) => handleCloseTab(tab.id, e)}
            onSwitch={() => handleSwitchTab(tab.id)}
            onMove={handleMoveTab}
            onDragEnd={handleDragEnd}
          />
        ))}
        <button
          className="flex items-center justify-center w-7 h-7 border-none bg-transparent cursor-pointer rounded text-[var(--text-color)] text-sm transition-colors hover:bg-[var(--common-hover-bg)]"
          onClick={handleNewTab}
        >
          <PlusOutlined />
        </button>
      </div>

      {showRightControls && (
        <div
          className="flex gap-3 items-center ml-auto pr-3"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <TitlebarIcon
            tip={alwaysOnTop ? "取消置顶" : "置顶"}
            onClick={toggleAlwaysOnTop}
          >
            <PushpinOutlined
              className={classnames("transform rotate-0 transition-transform", {
                "-rotate-45": alwaysOnTop,
              })}
            />
          </TitlebarIcon>
          <TitlebarIcon
            tip="小组件"
            onClick={handleOpenSmallComponentSidebar}
            active={smallComponentSidebarOpen}
          >
            <SVG src={smallComponentIcon} />
          </TitlebarIcon>
          <TitlebarIcon
            tip="聊天"
            onClick={handleOpenChatSidebar}
            active={chatSidebarOpen}
          >
            <SVG src={chatIcon} />
          </TitlebarIcon>
          <TitlebarIcon
            tip="右侧栏"
            onClick={handleOpenRightSidebar}
            active={rightSidebarOpen}
            placement="left"
          >
            <SVG src={sidebarRightIcon} />
          </TitlebarIcon>
        </div>
      )}
    </div>
  );
});

export default TitlebarWithTabs;
