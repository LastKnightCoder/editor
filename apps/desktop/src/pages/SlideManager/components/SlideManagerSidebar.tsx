import { memo, useMemo, useState, useCallback } from "react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import classNames from "classnames";
import {
  Search,
  FolderOpen,
  Folder,
  Plus,
  MoreHorizontal,
  Presentation,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import SVG from "react-inlinesvg";
import leftSidebarIcon from "@/assets/icons/sidebar-left.svg";
import useSlideStore from "@/stores/useSlideStore";
import useThemeColors from "@/hooks/useThemeColors";
import CustomModal from "@/components/CustomModal";

interface SlideManagerSidebarProps {
  onFoldSidebar?: () => void;
}

type MenuClickInfo = Parameters<NonNullable<MenuProps["onClick"]>>[0];

const SlideManagerSidebar = memo(
  ({ onFoldSidebar }: SlideManagerSidebarProps) => {
    const { message } = App.useApp();
    const themeColors = useThemeColors();

    const {
      decks,
      groups,
      selectedGroupId,
      expandedGroups,
      searchKeyword,
      setSelectedGroup,
      toggleGroupExpand,
      createGroup,
      updateGroup,
      removeGroup,
      setSearchKeyword,
      moveDeckToGroup,
    } = useSlideStore(
      useShallow((state) => ({
        decks: state.decks,
        groups: state.groups,
        selectedGroupId: state.selectedGroupId,
        expandedGroups: state.expandedGroups,
        searchKeyword: state.searchKeyword,
        setSelectedGroup: state.setSelectedGroup,
        toggleGroupExpand: state.toggleGroupExpand,
        createGroup: state.createGroup,
        updateGroup: state.updateGroup,
        removeGroup: state.removeGroup,
        setSearchKeyword: state.setSearchKeyword,
        moveDeckToGroup: state.moveDeckToGroup,
      })),
    );

    // 分组对话框状态
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [groupModalMode, setGroupModalMode] = useState<"create" | "edit">(
      "create",
    );
    const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
    const [editingParentId, setEditingParentId] = useState<number | null>(null);
    const [groupName, setGroupName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 拖拽状态
    const [dragOverTarget, setDragOverTarget] = useState<
      number | null | "ungrouped"
    >(null);

    // 计算每个分组的 deck 数量
    const deckCountByGroup = useMemo(() => {
      const counts: Record<number | "ungrouped", number> = { ungrouped: 0 };
      decks.forEach((deck) => {
        if (deck.groupId) {
          counts[deck.groupId] = (counts[deck.groupId] || 0) + 1;
        } else {
          counts.ungrouped += 1;
        }
      });
      return counts;
    }, [decks]);

    // 递归计算分组及其子分组的 deck 总数
    const getTotalDeckCount = useCallback(
      (groupId: number): number => {
        let count = deckCountByGroup[groupId] || 0;
        const children = groups.filter((g) => g.parentId === groupId);
        children.forEach((child) => {
          count += getTotalDeckCount(child.id);
        });
        return count;
      },
      [groups, deckCountByGroup],
    );

    // 打开新建分组对话框
    const handleCreateGroup = (parentId?: number | null) => {
      setGroupModalMode("create");
      setEditingGroupId(null);
      setEditingParentId(parentId ?? null);
      setGroupName("");
      setGroupModalOpen(true);
    };

    // 打开编辑分组对话框
    const handleEditGroup = (groupId: number) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      setGroupModalMode("edit");
      setEditingGroupId(groupId);
      setEditingParentId(group.parentId);
      setGroupName(group.name);
      setGroupModalOpen(true);
    };

    // 删除分组
    const handleDeleteGroup = async (groupId: number) => {
      const childCount = groups.filter((g) => g.parentId === groupId).length;
      if (childCount > 0) {
        message.warning("请先删除子分组");
        return;
      }
      try {
        await removeGroup(groupId);
        message.success("已删除分组");
      } catch (error) {
        message.error("删除失败");
      }
    };

    // 提交分组对话框
    const handleGroupModalOk = async () => {
      if (!groupName.trim()) {
        message.warning("请输入分组名称");
        return;
      }
      try {
        setIsSubmitting(true);
        if (groupModalMode === "create") {
          await createGroup({
            name: groupName.trim(),
            parentId: editingParentId,
          });
          message.success("已创建分组");
        } else if (editingGroupId) {
          await updateGroup({
            id: editingGroupId,
            name: groupName.trim(),
          });
          message.success("已更新分组");
        }
        setGroupModalOpen(false);
      } catch (error) {
        message.error("操作失败");
      } finally {
        setIsSubmitting(false);
      }
    };

    // 分组右键菜单
    const getGroupContextMenu = (groupId: number) => {
      return [
        {
          key: "add-subgroup",
          label: "添加子分组",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleCreateGroup(groupId);
          },
        },
        {
          key: "edit",
          label: "重命名",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleEditGroup(groupId);
          },
        },
        {
          key: "delete",
          label: "删除分组",
          danger: true,
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleDeleteGroup(groupId);
          },
        },
      ];
    };

    // 拖拽处理
    const handleDragOver = (
      e: React.DragEvent,
      target: number | null | "ungrouped",
    ) => {
      e.preventDefault();
      setDragOverTarget(target);
    };

    const handleDragLeave = () => {
      setDragOverTarget(null);
    };

    const handleDrop = async (
      e: React.DragEvent,
      targetGroupId: number | null,
    ) => {
      e.preventDefault();
      setDragOverTarget(null);
      const deckId = e.dataTransfer.getData("deck-id");
      if (deckId) {
        try {
          await moveDeckToGroup(Number(deckId), targetGroupId);
          message.success(targetGroupId ? "已移动到分组" : "已移到未分组");
        } catch (error) {
          message.error("移动失败");
        }
      }
    };

    // 递归渲染分组树
    const renderGroupTree = (parentId: number | null, level: number) => {
      const childGroups = groups.filter((g) => g.parentId === parentId);
      return childGroups.map((group) => {
        const isExpanded = expandedGroups.includes(group.id);
        const isSelected = selectedGroupId === group.id;
        const isDragOver = dragOverTarget === group.id;
        const totalCount = getTotalDeckCount(group.id);
        const hasChildren = groups.some((g) => g.parentId === group.id);

        return (
          <div key={group.id}>
            <Dropdown
              menu={{ items: getGroupContextMenu(group.id) }}
              trigger={["contextMenu"]}
            >
              <div
                className={classNames(
                  "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                  isDragOver && "bg-blue-500/10",
                  isSelected
                    ? themeColors.activeClass
                    : !isDragOver && themeColors.hoverClass,
                )}
                style={{ paddingLeft: `${level * 16 + 12}px` }}
                onClick={() => setSelectedGroup(group.id)}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.id)}
              >
                <div
                  className={classNames(
                    "shrink-0 mr-2 text-base",
                    themeColors.secondaryTextClass,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren) {
                      toggleGroupExpand(group.id);
                    }
                  }}
                >
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4" />
                  ) : (
                    <Folder className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 flex justify-between items-center min-w-0">
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    {group.name}
                  </span>
                  <span
                    className={classNames(
                      "text-xs ml-2",
                      themeColors.secondaryTextClass,
                    )}
                  >
                    ({totalCount})
                  </span>
                </div>
              </div>
            </Dropdown>
            {isExpanded && renderGroupTree(group.id, level + 1)}
          </div>
        );
      });
    };

    // 统计
    const totalCount = decks.length;
    const ungroupedCount = deckCountByGroup.ungrouped;

    // More 菜单
    const moreMenuItems: MenuProps["items"] = [
      {
        key: "add-group",
        label: "新建分组",
        icon: <Plus className="w-4 h-4" />,
        onClick: () => handleCreateGroup(),
      },
    ];

    return (
      <div
        className={classNames(
          "h-full flex flex-col border-r",
          themeColors.borderClass,
        )}
      >
        {/* 搜索框 */}
        <div
          className={classNames("px-4 py-3 border-b", themeColors.borderClass)}
        >
          <div className="relative">
            <Search
              className={classNames(
                "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                themeColors.secondaryTextClass,
              )}
            />
            <input
              placeholder="搜索幻灯片..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className={classNames(
                "w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all",
                "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
                "text-gray-800 dark:text-white",
                "placeholder:text-gray-400 dark:placeholder:text-slate-500",
                "focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]",
                "dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
              )}
            />
          </div>
        </div>

        {/* 标题行 */}
        <div
          className={classNames(
            "px-4 py-3 flex justify-between items-center border-b",
            themeColors.borderClass,
          )}
        >
          <div className="flex items-center gap-2">
            <h3
              className={classNames(
                "m-0 text-base font-semibold",
                themeColors.activeTextClass,
              )}
            >
              幻灯片
            </h3>
            <span
              className={classNames("text-xs", themeColors.secondaryTextClass)}
            >
              {totalCount}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SVG
              className="cursor-pointer"
              src={leftSidebarIcon}
              onClick={onFoldSidebar}
            />
            <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
              <div
                className={classNames(
                  "w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors",
                  themeColors.hoverClass,
                  themeColors.textClass,
                )}
              >
                <MoreHorizontal className="w-4 h-4" />
              </div>
            </Dropdown>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          {/* 全部 */}
          <div
            className={classNames(
              "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
              selectedGroupId === "all"
                ? themeColors.activeClass
                : themeColors.hoverClass,
            )}
            onClick={() => setSelectedGroup("all")}
          >
            <Presentation
              className={classNames(
                "shrink-0 mr-2 w-4 h-4",
                themeColors.secondaryTextClass,
              )}
            />
            <div className="flex-1 flex justify-between items-center min-w-0">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                全部幻灯片
              </span>
              <span
                className={classNames(
                  "text-xs ml-2",
                  themeColors.secondaryTextClass,
                )}
              >
                ({totalCount})
              </span>
            </div>
          </div>

          {/* 分组标题 */}
          {groups.length > 0 && (
            <div
              className={classNames(
                "px-3 py-2 pt-4 text-xs font-semibold",
                themeColors.secondaryTextClass,
              )}
            >
              分组
            </div>
          )}

          {/* 分组树 */}
          {renderGroupTree(null, 0)}

          {/* 未分组 */}
          <div
            className={classNames(
              "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
              dragOverTarget === "ungrouped" && "bg-blue-500/10",
              selectedGroupId === null
                ? themeColors.activeClass
                : dragOverTarget !== "ungrouped" && themeColors.hoverClass,
            )}
            onClick={() => setSelectedGroup(null)}
            onDragOver={(e) => handleDragOver(e, "ungrouped")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, null)}
          >
            <Folder
              className={classNames(
                "shrink-0 mr-2 w-4 h-4",
                themeColors.secondaryTextClass,
              )}
            />
            <div className="flex-1 flex justify-between items-center min-w-0">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                未分组
              </span>
              <span
                className={classNames(
                  "text-xs ml-2",
                  themeColors.secondaryTextClass,
                )}
              >
                ({ungroupedCount})
              </span>
            </div>
          </div>
        </div>

        {/* 分组对话框 */}
        <CustomModal
          title={groupModalMode === "create" ? "新建分组" : "编辑分组"}
          open={groupModalOpen}
          onOk={handleGroupModalOk}
          onCancel={() => setGroupModalOpen(false)}
          okText="确定"
          cancelText="取消"
          confirmLoading={isSubmitting}
        >
          <input
            placeholder="请输入分组名称"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGroupModalOk()}
            autoFocus
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
          />
        </CustomModal>
      </div>
    );
  },
);

SlideManagerSidebar.displayName = "SlideManagerSidebar";

export default SlideManagerSidebar;
