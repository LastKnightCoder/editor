import React, { memo, useState, useCallback, useMemo } from "react";
import { Dropdown, Modal, Input } from "antd";
import type { MenuProps } from "antd";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import { PlusOutlined } from "@ant-design/icons";
import { useDrop, useDrag } from "react-dnd";
import { motion, AnimatePresence } from "framer-motion";

import useTabStore from "@/stores/useTabStore";

import DraggableTab from "./DraggableTab";

import { ITab, ITabGroup, TabType, PaneDirection } from "@/types/tab";
import useTheme from "@/hooks/useTheme";
import {
  PROJECT_COLORS,
  getProjectColorValue,
  type ProjectColorName,
} from "@/constants/project-colors";
import ColorPicker from "@/components/Todo/Sidebar/components/ColorPicker";

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

type TabGroupHeaderDropItem = TabDragItem | TabGroupDragItem;

type MenuItemType = NonNullable<MenuProps["items"]>[number];
type MenuClickEvent = Parameters<NonNullable<MenuProps["onClick"]>>[0];

type TabDropResult = {
  paneId: string;
  dropZone?: "left" | "right" | "top" | "bottom" | "group";
};

interface TitlebarWithTabsProps {
  paneId: string;
  className?: string;
  showRightControls?: boolean;
}

interface TabGroupHeaderProps {
  group: ITabGroup;
  paneId: string;
  colorValue?: string;
  isActive: boolean;
  onToggleCollapse: () => void;
  onMoveGroup: (
    dragGroupId: string,
    hoverGroupId: string,
    position: "before" | "after",
  ) => void;
  onDropTabToGroup: (tab: ITab, sourcePaneId: string) => void;
  onDragEndGroup: (
    groupId: string,
    sourcePaneId: string,
    dropZone?: "left" | "right" | "top" | "bottom",
  ) => void;
}

const TabGroupHeader = memo((props: TabGroupHeaderProps) => {
  const {
    group,
    paneId,
    colorValue,
    isActive,
    onToggleCollapse,
    onMoveGroup,
    onDropTabToGroup,
    onDragEndGroup,
  } = props;

  const ref = React.useRef<HTMLDivElement | null>(null);

  const [{ handlerId }, drop] = useDrop<
    TabGroupHeaderDropItem,
    TabDropResult,
    { handlerId: string | symbol | null }
  >({
    accept: ["TAB", "TAB_GROUP"],
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
    hover: () => {
      if (!ref.current) return;
    },
    drop: (item: TabGroupHeaderDropItem, monitor) => {
      if (monitor.didDrop()) {
        return;
      }
      if (item.type === "TAB") {
        // 直接在分组头上完成分组逻辑
        onDropTabToGroup(item.tab as ITab, item.paneId as string);
        return { paneId, dropZone: "group" };
      }

      if (item.type === "TAB_GROUP") {
        if (item.groupId === group.id) {
          return undefined;
        }

        if (!ref.current) return undefined;
        const hoverBoundingRect = ref.current.getBoundingClientRect();
        const hoverMiddleX =
          (hoverBoundingRect.right - hoverBoundingRect.left) / 2;
        const clientOffset = monitor.getClientOffset();
        if (!clientOffset) return undefined;
        const hoverClientX = clientOffset.x - hoverBoundingRect.left;
        const position: "before" | "after" =
          hoverClientX < hoverMiddleX ? "before" : "after";

        onMoveGroup(item.groupId as string, group.id, position);
        return { paneId };
      }

      return undefined;
    },
  });

  const [{ isDragging }, drag] = useDrag<
    TabGroupDragItem,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: "TAB_GROUP",
      item: () => {
        return {
          type: "TAB_GROUP",
          groupId: group.id,
          paneId,
          originalPaneId: paneId, // 记录原始 paneId
        };
      },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
      end: (item, monitor) => {
        const didDrop = monitor.didDrop();
        const dropResult = monitor.getDropResult() as {
          paneId: string;
          dropZone?: "left" | "right" | "top" | "bottom";
        } | null;

        if (!didDrop || !dropResult) {
          return;
        }

        const { paneId: targetPaneId, dropZone } = dropResult;

        // 分屏逻辑
        if (dropZone) {
          onDragEndGroup(item.groupId, item.paneId, dropZone);
          return;
        }

        // 如果在 hover 中已经处理过跨 pane 移动，就不再处理
        if (item.originalPaneId && item.originalPaneId !== item.paneId) {
          return;
        }

        // 跨 pane 移动（通过 drop 到标题栏空白处）
        if (item.paneId !== targetPaneId) {
          onDragEndGroup(item.groupId, item.paneId, undefined);
        }
      },
    }),
    [group.id, paneId, onDragEndGroup],
  );

  const backgroundStyle = colorValue
    ? {
        backgroundColor: `${colorValue}20`,
        borderColor: colorValue,
      }
    : undefined;

  drag(drop(ref));

  return (
    <div
      ref={ref}
      data-handler-id={handlerId}
      className={classnames(
        "flex items-center h-7 px-2 mr-1 rounded-full text-xs cursor-pointer select-none app-region-no-drag border border-transparent",
        {
          "opacity-60": isDragging,
          "bg-[var(--common-hover-bg)]": !colorValue,
          "font-semibold": isActive,
        },
      )}
      style={backgroundStyle}
      onClick={(e) => {
        e.stopPropagation();
        onToggleCollapse();
      }}
    >
      {colorValue && (
        <span
          className="w-2 h-2 rounded-full mr-1"
          style={{ backgroundColor: colorValue }}
        />
      )}
      <span className="max-w-[120px] truncate">{group.title}</span>
    </div>
  );
});

const TitlebarWithTabs = memo((props: TitlebarWithTabsProps) => {
  const { paneId, className } = props;

  const panes = useTabStore((state) => state.panes);
  const createTab = useTabStore((state) => state.createTab);
  const closeTab = useTabStore((state) => state.closeTab);
  const switchTab = useTabStore((state) => state.switchTab);
  const reorderTab = useTabStore((state) => state.reorderTab);
  const moveTabToPane = useTabStore((state) => state.moveTabToPane);
  const moveTabToPaneAndSetGroup = useTabStore(
    (state) => state.moveTabToPaneAndSetGroup,
  );
  const createPaneWithTab = useTabStore((state) => state.createPaneWithTab);
  const createPaneWithTabGroup = useTabStore(
    (state) => state.createPaneWithTabGroup,
  );
  const moveTabGroupToPane = useTabStore((state) => state.moveTabGroupToPane);
  const createTabGroup = useTabStore((state) => state.createTabGroup);
  const updateTabGroup = useTabStore((state) => state.updateTabGroup);
  const removeTabGroup = useTabStore((state) => state.removeTabGroup);
  const setTabGroup = useTabStore((state) => state.setTabGroup);
  const reorderTabGroup = useTabStore((state) => state.reorderTabGroup);

  const { theme } = useTheme();

  const pane = panes.find((p) => p.id === paneId);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalTabId, setGroupModalTabId] = useState<string | null>(null);
  const [groupModalGroupId, setGroupModalGroupId] = useState<string | null>(
    null,
  );
  const [groupModalName, setGroupModalName] = useState("");
  const [groupModalColor, setGroupModalColor] =
    useState<ProjectColorName | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const groups = useMemo(
    () => (pane?.groups ? pane.groups : []),
    [pane?.groups],
  );

  const groupMap = useMemo(() => {
    const map = new Map<string, ITabGroup>();
    groups.forEach((g) => {
      map.set(g.id, g);
    });
    return map;
  }, [groups]);

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

  const handleDragEndGroup = useCallback(
    (
      groupId: string,
      sourcePaneId: string,
      dropZone?: "left" | "right" | "top" | "bottom",
    ) => {
      // 如果有 dropZone，说明要分屏
      if (dropZone) {
        const direction =
          dropZone === "left" || dropZone === "right"
            ? PaneDirection.Horizontal
            : PaneDirection.Vertical;

        // 创建新 pane 并移动整个分组（原子操作）
        createPaneWithTabGroup(sourcePaneId, groupId, direction, 0.5);
      } else if (sourcePaneId !== paneId) {
        // 拖到另一个 pane（非边缘区域）
        moveTabGroupToPane(sourcePaneId, paneId, groupId);
      }
    },
    [paneId, createPaneWithTabGroup, moveTabGroupToPane],
  );

  // 接收拖拽的 Drop Zone
  const [, drop] = useDrop<
    TabDragItem | TabGroupDragItem,
    TabDropResult,
    { isOver: boolean }
  >({
    accept: ["TAB", "TAB_GROUP"],
    drop: (_item, monitor) => {
      // 如果子级已经处理了 drop（例如 TabGroupHeader），则不再处理
      if (monitor.didDrop()) return undefined;
      // 标题栏 drop 返回 paneId，不带 dropZone（表示直接移动，不分屏）
      return { paneId, dropZone: undefined };
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  if (!pane) return null;

  const groupFirstIndex: Record<string, number> = {};
  const groupLastIndex: Record<string, number> = {};

  pane.tabs.forEach((t, index) => {
    if (!t.groupId) return;
    if (groupFirstIndex[t.groupId] === undefined) {
      groupFirstIndex[t.groupId] = index;
    }
    groupLastIndex[t.groupId] = index;
  });

  const buildTabContextMenuItems = (tab: ITab): MenuProps["items"] => {
    const items: MenuProps["items"] = [];

    const moveMenuChildren: MenuProps["items"] = [];
    if (groups.length > 0) {
      moveMenuChildren.push({
        key: "move-none",
        label: "无分组",
        onClick: (e: MenuClickEvent) => {
          e.domEvent.stopPropagation();
          setTabGroup(paneId, tab.id, undefined);
        },
      } as MenuItemType);

      groups.forEach((group) => {
        const color = group.color
          ? getProjectColorValue(group.color as ProjectColorName, theme)
          : undefined;
        moveMenuChildren.push({
          key: group.id,
          label: (
            <div className="flex items-center gap-2">
              {color && (
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              <span>{group.title}</span>
            </div>
          ),
          onClick: (e: MenuClickEvent) => {
            e.domEvent.stopPropagation();
            setTabGroup(paneId, tab.id, group.id);
          },
        } as MenuItemType);
      });

      items.push({
        key: "move-to-group",
        label: "移动到分组",
        children: moveMenuChildren,
      } as MenuItemType);
    }

    items.push({
      key: "new-group",
      label: "新建分组",
      onClick: (e: MenuClickEvent) => {
        e.domEvent.stopPropagation();
        setIsEditMode(false);
        setGroupModalTabId(tab.id);
        setGroupModalName(`分组 ${groups.length + 1}`);
        const defaultColor =
          (PROJECT_COLORS[0]?.name as ProjectColorName | undefined) ??
          ("purple" as ProjectColorName);
        setGroupModalColor(defaultColor);
        setGroupModalOpen(true);
      },
    } as MenuItemType);

    items.push({
      key: "move-to-panel",
      label: "移动至 Panel",
      onClick: (e: MenuClickEvent) => {
        e.domEvent.stopPropagation();
        if (panes.length === 1) {
          // 只有一个 pane，创建新的 pane
          createPaneWithTab(paneId, tab.id, PaneDirection.Horizontal, 0.5);
        } else {
          // 有多个 pane，移动到另一个 pane
          const otherPane = panes.find((p) => p.id !== paneId);
          if (otherPane) {
            moveTabToPane(paneId, otherPane.id, tab.id);
          }
        }
      },
    } as MenuItemType);

    return items;
  };

  const buildGroupContextMenuItems = (group: ITabGroup): MenuProps["items"] => {
    const items: MenuProps["items"] = [
      {
        key: "edit",
        label: "编辑分组",
        onClick: (e: MenuClickEvent) => {
          e.domEvent.stopPropagation();
          setIsEditMode(true);
          setGroupModalGroupId(group.id);
          setGroupModalName(group.title);
          setGroupModalColor(
            (group.color as ProjectColorName) ||
              (PROJECT_COLORS[0]?.name as ProjectColorName) ||
              ("purple" as ProjectColorName),
          );
          setGroupModalOpen(true);
        },
      } as MenuItemType,
      {
        key: "toggle-collapse",
        label: group.collapsed ? "展开分组" : "收起分组",
        onClick: (e: MenuClickEvent) => {
          e.domEvent.stopPropagation();
          updateTabGroup(paneId, group.id, { collapsed: !group.collapsed });
        },
      } as MenuItemType,
      {
        key: "move-to-panel",
        label: "移动至 Panel",
        onClick: (e: MenuClickEvent) => {
          e.domEvent.stopPropagation();
          if (panes.length === 1) {
            // 只有一个 pane，创建新的 pane
            createPaneWithTabGroup(
              paneId,
              group.id,
              PaneDirection.Horizontal,
              0.5,
            );
          } else {
            // 有多个 pane，移动到另一个 pane
            const otherPane = panes.find((p) => p.id !== paneId);
            if (otherPane) {
              moveTabGroupToPane(paneId, otherPane.id, group.id);
            }
          }
        },
      } as MenuItemType,
      {
        key: "remove-group",
        label: "取消分组",
        danger: true,
        onClick: (e: MenuClickEvent) => {
          e.domEvent.stopPropagation();
          removeTabGroup(paneId, group.id);
        },
      } as MenuItemType,
    ];

    return items;
  };

  const tabNodes: React.ReactNode[] = [];

  for (let index = 0; index < pane.tabs.length; index += 1) {
    const tab = pane.tabs[index];
    const groupId = tab.groupId;
    const group = groupId ? groupMap.get(groupId) : undefined;

    if (group && groupFirstIndex[group.id] === index) {
      const firstIndex = groupFirstIndex[group.id];
      const lastIndex = groupLastIndex[group.id] ?? firstIndex;

      const colorValue = group.color
        ? getProjectColorValue(group.color as ProjectColorName, theme)
        : undefined;

      const groupTabs: { tab: ITab; index: number }[] = [];
      for (let i = firstIndex; i <= lastIndex; i += 1) {
        const t = pane.tabs[i];
        if (t.groupId === group.id) {
          groupTabs.push({ tab: t, index: i });
        }
      }

      const isActiveGroup = groupTabs.some(
        ({ tab: t }) => t.id === pane.activeTabId,
      );

      const isCollapsed = group.collapsed;

      tabNodes.push(
        <motion.div
          key={`group-wrap-${group.id}`}
          layout
          className="flex items-center gap-1 mr-1"
          transition={{
            duration: 0.2,
            ease: "easeInOut",
          }}
        >
          <Dropdown
            menu={{ items: buildGroupContextMenuItems(group) }}
            trigger={["contextMenu"]}
          >
            <div>
              <TabGroupHeader
                group={group}
                paneId={paneId}
                colorValue={colorValue}
                isActive={isActiveGroup}
                onToggleCollapse={() => {
                  updateTabGroup(paneId, group.id, {
                    collapsed: !group.collapsed,
                  });
                }}
                onMoveGroup={(dragGroupId, hoverGroupId, position) => {
                  reorderTabGroup(paneId, dragGroupId, hoverGroupId, position);
                }}
                onDropTabToGroup={(droppedTab, sourcePaneId) => {
                  if (sourcePaneId !== paneId) {
                    // 跨 pane 移动：使用原子化方法一次性完成移动和设置分组
                    moveTabToPaneAndSetGroup(
                      sourcePaneId,
                      paneId,
                      droppedTab.id,
                      group.id,
                    );
                  } else {
                    // 同一 pane 内移动：只需设置分组
                    setTabGroup(paneId, droppedTab.id, group.id);
                  }
                }}
                onDragEndGroup={handleDragEndGroup}
              />
            </div>
          </Dropdown>

          <div className="relative flex items-center gap-1 pb-[2px]">
            {colorValue && groupTabs.length > 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 bottom-0 h-0.5 rounded-full"
                style={{ backgroundColor: colorValue }}
              />
            )}

            <AnimatePresence initial={false}>
              {!isCollapsed &&
                groupTabs.map(({ tab: groupTab, index: tabIndex }) => (
                  <motion.div
                    key={groupTab.id}
                    layout
                    initial={{ opacity: 0, width: 0, scale: 0.8 }}
                    animate={{ opacity: 1, width: "auto", scale: 1 }}
                    exit={{ opacity: 0, width: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.2,
                      ease: "easeInOut",
                      layout: { duration: 0.2, ease: "easeInOut" },
                    }}
                  >
                    <Dropdown
                      menu={{ items: buildTabContextMenuItems(groupTab) }}
                      trigger={["contextMenu"]}
                    >
                      <div>
                        <DraggableTab
                          tab={groupTab}
                          paneId={paneId}
                          index={tabIndex}
                          isActive={groupTab.id === pane.activeTabId}
                          onClose={(e) => handleCloseTab(groupTab.id, e)}
                          onSwitch={() => handleSwitchTab(groupTab.id)}
                          onMove={handleMoveTab}
                          onDragEnd={handleDragEnd}
                        />
                      </div>
                    </Dropdown>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </motion.div>,
      );

      index = lastIndex;
      continue;
    }

    if (!group || !group.collapsed) {
      tabNodes.push(
        <motion.div
          key={tab.id}
          layout
          transition={{
            duration: 0.2,
            ease: "easeInOut",
          }}
        >
          <Dropdown
            menu={{ items: buildTabContextMenuItems(tab) }}
            trigger={["contextMenu"]}
          >
            <div>
              <DraggableTab
                tab={tab}
                paneId={paneId}
                index={index}
                isActive={tab.id === pane.activeTabId}
                onClose={(e) => handleCloseTab(tab.id, e)}
                onSwitch={() => handleSwitchTab(tab.id)}
                onMove={handleMoveTab}
                onDragEnd={handleDragEnd}
              />
            </div>
          </Dropdown>
        </motion.div>,
      );
    }
  }

  const handleConfirmCreateGroup = () => {
    const fallbackColor =
      (PROJECT_COLORS[0]?.name as ProjectColorName | undefined) ||
      ("purple" as ProjectColorName);

    const color: ProjectColorName = groupModalColor ?? fallbackColor;
    const title = groupModalName.trim() || `分组 ${groups.length + 1}`;

    if (isEditMode && groupModalGroupId) {
      // 编辑模式
      updateTabGroup(paneId, groupModalGroupId, {
        title,
        color,
      });
    } else if (groupModalTabId) {
      // 创建模式
      createTabGroup(paneId, {
        tabId: groupModalTabId,
        title,
        color,
      });
    }

    setGroupModalOpen(false);
    setGroupModalTabId(null);
    setGroupModalGroupId(null);
    setIsEditMode(false);
  };

  const handleCancelCreateGroup = () => {
    setGroupModalOpen(false);
    setGroupModalTabId(null);
    setGroupModalGroupId(null);
    setIsEditMode(false);
  };

  return (
    <>
      <div
        ref={drop}
        className={classnames(
          "w-full h-[60px] box-border flex items-center justify-between bg-[var(--main-bg-color)] flex-shrink-0 border-b border-[#f0f0f0] dark:border-[#2a2a2a] relative app-region-drag",
          className,
        )}
      >
        <div
          className={classnames(
            "flex-1 min-w-0 flex items-center gap-1 overflow-x-auto overflow-y-hidden px-2 [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-[var(--border-color)] [&::-webkit-scrollbar-thumb]:rounded-sm transition-all",
          )}
        >
          {tabNodes}
          <button
            className="flex items-center justify-center w-7 h-7 border-none bg-transparent cursor-pointer rounded text-[var(--text-color)] text-sm transition-colors hover:bg-[var(--common-hover-bg)] app-region-no-drag"
            onClick={handleNewTab}
          >
            <PlusOutlined />
          </button>
        </div>
      </div>

      <Modal
        title={isEditMode ? "编辑分组" : "新建分组"}
        open={groupModalOpen}
        onOk={handleConfirmCreateGroup}
        onCancel={handleCancelCreateGroup}
        okText="确定"
        cancelText="取消"
        getContainer={false}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="mb-1 text-sm">名称</div>
            <Input
              className="h-10"
              value={groupModalName}
              onChange={(e) => setGroupModalName(e.target.value)}
              placeholder="分组名称"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="mb-1 text-sm">颜色</div>
            <ColorPicker
              value={
                (groupModalColor ??
                  PROJECT_COLORS[0]?.name ??
                  "purple") as ProjectColorName
              }
              onChange={(color) => setGroupModalColor(color)}
              theme={theme}
            />
          </div>
        </div>
      </Modal>
    </>
  );
});

export default TitlebarWithTabs;
