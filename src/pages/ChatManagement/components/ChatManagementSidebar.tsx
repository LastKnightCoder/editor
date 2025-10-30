import { memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { App, Dropdown, Input, Modal } from "antd";
import {
  PlusOutlined,
  FolderOutlined,
  MessageOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  FolderAddOutlined,
  RightOutlined,
  DownOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import classnames from "classnames";
import useChatMessageStore from "@/stores/useChatMessageStore";
import type { ChatMessage, ChatGroup } from "@/types";

const ChatManagementSidebar = memo(() => {
  const { message: messageApi, modal } = App.useApp();

  const {
    chats,
    groups,
    createChatGroup,
    updateChatGroup,
    deleteChatGroup,
    deleteChatMessage,
    archiveChatMessage,
    moveChatToGroup,
  } = useChatMessageStore(
    useShallow((state) => ({
      chats: state.chats,
      groups: state.groups,
      createChatGroup: state.createChatGroup,
      updateChatGroup: state.updateChatGroup,
      deleteChatGroup: state.deleteChatGroup,
      deleteChatMessage: state.deleteChatMessage,
      archiveChatMessage: state.archiveChatMessage,
      moveChatToGroup: state.moveChatToGroup,
    })),
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [expandedArchived, setExpandedArchived] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [groupDialogVisible, setGroupDialogVisible] = useState(false);
  const [draggedChatId, setDraggedChatId] = useState<number | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | null | "root">(
    null,
  );
  const [groupDialogMode, setGroupDialogMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupParentId, setEditingGroupParentId] = useState<
    number | null
  >(null);
  const [groupName, setGroupName] = useState("");

  const toggleGroup = useMemoizedFn((groupId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  });

  const handleChatSelect = useMemoizedFn((chatId: number) => {
    setSelectedChatId(chatId);
    useChatMessageStore.setState({ currentChatId: chatId });
  });

  const handleCreateGroup = useMemoizedFn((parentId?: number | null) => {
    setGroupDialogMode("create");
    setEditingGroupParentId(parentId ?? null);
    setGroupName("");
    setGroupDialogVisible(true);
  });

  const handleEditGroup = useMemoizedFn((groupId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setGroupDialogMode("edit");
      setEditingGroupId(groupId);
      setGroupName(group.name);
      setGroupDialogVisible(true);
    }
  });

  const handleDeleteGroup = useMemoizedFn((groupId: number) => {
    modal.confirm({
      title: "删除分组",
      content: "确定要删除这个分组吗？分组下的对话将移到未分组。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteChatGroup(groupId);
          messageApi.success("分组已删除");
        } catch (error) {
          const err = error as Error;
          messageApi.error(err.message || "删除失败");
        }
      },
    });
  });

  const handleDeleteChat = useMemoizedFn((chatId: number) => {
    modal.confirm({
      title: "删除对话",
      content: "确定要删除这个对话吗？此操作不可恢复。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteChatMessage(chatId);
          messageApi.success("对话已删除");
        } catch (error) {
          messageApi.error("删除失败");
        }
      },
    });
  });

  const handleArchiveChat = useMemoizedFn(
    async (chatId: number, archived: boolean) => {
      try {
        await archiveChatMessage(chatId, archived);
        messageApi.success(archived ? "已归档" : "已取消归档");
      } catch (error) {
        messageApi.error("操作失败");
      }
    },
  );

  const handleGroupDialogOk = useMemoizedFn(async () => {
    if (!groupName.trim()) {
      messageApi.warning("请输入分组名称");
      return;
    }

    try {
      if (groupDialogMode === "create") {
        await createChatGroup(groupName, editingGroupParentId);
        messageApi.success("分组已创建");
      } else if (editingGroupId) {
        await updateChatGroup(editingGroupId, groupName);
        messageApi.success("分组已更新");
      }
      setGroupDialogVisible(false);
      setGroupName("");
      setEditingGroupId(null);
      setEditingGroupParentId(null);
    } catch (error) {
      const err = error as Error;
      messageApi.error(err.message || "操作失败");
    }
  });

  // 渲染分组的右键菜单
  const getGroupContextMenu = useMemoizedFn((groupId: number) => {
    return [
      {
        key: "add-subgroup",
        label: "添加子分组",
        icon: <FolderAddOutlined />,
        onClick: () => handleCreateGroup(groupId),
      },
      {
        key: "edit",
        label: "重命名",
        icon: <EditOutlined />,
        onClick: () => handleEditGroup(groupId),
      },
      {
        key: "delete",
        label: "删除分组",
        icon: <DeleteOutlined />,
        danger: true,
        onClick: () => handleDeleteGroup(groupId),
      },
    ];
  });

  // 处理移动对话到分组
  const handleMoveToGroup = useMemoizedFn(
    async (chatId: number, targetGroupId: number | null) => {
      const chat = chats.find((c) => c.id === chatId);
      if (!chat) return;

      // 如果分组未发生改变，则不进行操作
      if (chat.groupId === targetGroupId) {
        return;
      }

      try {
        await moveChatToGroup(chatId, targetGroupId);
        messageApi.success(targetGroupId ? "已移动到分组" : "已移到未分组");
      } catch (error) {
        messageApi.error("移动失败");
      }
    },
  );

  // 递归构建分组菜单
  const buildGroupMenu = useMemoizedFn(
    (
      parentId: number | null,
      chatId: number,
    ): Array<{
      key: string;
      label: string;
      onClick: () => void;
      children?: Array<{
        key: string;
        label: string;
        onClick: () => void;
        children?: unknown;
      }>;
    }> => {
      const childGroups = groups.filter((g) => g.parentId === parentId);
      const menu: Array<{
        key: string;
        label: string;
        onClick: () => void;
        children?: Array<{
          key: string;
          label: string;
          onClick: () => void;
          children?: unknown;
        }>;
      }> = [];

      childGroups.forEach((group) => {
        const subMenu = buildGroupMenu(group.id, chatId);
        const item: {
          key: string;
          label: string;
          onClick: () => void;
          children?: Array<{
            key: string;
            label: string;
            onClick: () => void;
            children?: unknown;
          }>;
        } = {
          key: `group-${group.id}`,
          label: group.name,
          onClick: () => handleMoveToGroup(chatId, group.id),
        };

        if (subMenu.length > 0) {
          item.children = subMenu;
        }

        menu.push(item);
      });

      return menu;
    },
  );

  // 渲染对话的右键菜单
  const getChatContextMenu = useMemoizedFn(
    (chatId: number, isArchived: boolean) => {
      const items: Array<{
        key: string;
        label: string;
        onClick?: () => void;
        danger?: boolean;
        children?: Array<{
          key: string;
          label: string;
          onClick: () => void;
          children?: unknown;
        }>;
      }> = [];

      if (!isArchived) {
        // 添加移动至分组菜单
        const groupMenuItems = buildGroupMenu(null, chatId);
        if (groupMenuItems.length > 0) {
          items.push({
            key: "move-to-group",
            label: "移动至分组",
            children: [
              {
                key: "ungrouped",
                label: "未分组",
                onClick: () => handleMoveToGroup(chatId, null),
              },
              ...groupMenuItems,
            ],
          });
        } else {
          // 如果没有分组，只显示移动到未分组
          items.push({
            key: "move-to-ungrouped",
            label: "移到未分组",
            onClick: () => handleMoveToGroup(chatId, null),
          });
        }

        items.push({
          key: "archive",
          label: "归档",
          onClick: () => handleArchiveChat(chatId, true),
        });
      } else {
        items.push({
          key: "unarchive",
          label: "取消归档",
          onClick: () => handleArchiveChat(chatId, false),
        });
      }

      items.push({
        key: "delete",
        label: "删除",
        danger: true,
        onClick: () => handleDeleteChat(chatId),
      });

      return items;
    },
  );

  // 处理拖拽开始
  const handleDragStart = useMemoizedFn(
    (e: React.DragEvent, chatId: number) => {
      setDraggedChatId(chatId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", chatId.toString());
    },
  );

  // 处理拖拽结束
  const handleDragEnd = useMemoizedFn(() => {
    setDraggedChatId(null);
    setDragOverTarget(null);
  });

  // 处理拖拽到分组上
  const handleDragOver = useMemoizedFn(
    (e: React.DragEvent, targetGroupId: number | null | "root") => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDragOverTarget(targetGroupId);
    },
  );

  // 处理拖拽离开
  const handleDragLeave = useMemoizedFn((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开的目标不是子元素时才清除
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setDragOverTarget(null);
    }
  });

  // 处理放置到分组
  const handleDrop = useMemoizedFn(
    async (e: React.DragEvent, targetGroupId: number | null) => {
      e.preventDefault();
      e.stopPropagation();

      if (!draggedChatId) return;

      const chat = chats.find((c) => c.id === draggedChatId);
      if (!chat) {
        setDraggedChatId(null);
        setDragOverTarget(null);
        return;
      }

      // 如果分组未发生改变，则不进行操作
      if (chat.groupId === targetGroupId) {
        setDraggedChatId(null);
        setDragOverTarget(null);
        return;
      }

      try {
        await moveChatToGroup(draggedChatId, targetGroupId);
        messageApi.success(targetGroupId ? "已移动到分组" : "已移到未分组");
      } catch (error) {
        messageApi.error("移动失败");
      } finally {
        setDraggedChatId(null);
        setDragOverTarget(null);
      }
    },
  );

  // 渲染对话项
  const renderChatItem = (chat: ChatMessage, isArchived = false) => {
    const isSelected = selectedChatId === chat.id;
    const isDragging = draggedChatId === chat.id;

    return (
      <Dropdown
        key={chat.id}
        menu={{ items: getChatContextMenu(chat.id, isArchived) }}
        trigger={["contextMenu"]}
      >
        <div
          className={classnames(
            "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-all duration-200",
            {
              "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                isSelected,
              "hover:bg-blue-50 dark:hover:bg-blue-900/20": !isSelected,
              "opacity-50 cursor-grabbing": isDragging,
            },
          )}
          onClick={() => handleChatSelect(chat.id)}
          draggable={!isArchived}
          onDragStart={(e) => handleDragStart(e, chat.id)}
          onDragEnd={handleDragEnd}
        >
          <MessageOutlined
            className={classnames("text-base mr-2 flex-shrink-0", {
              "text-white": isSelected,
              "text-text-secondary": !isSelected,
            })}
          />
          <div className="flex-1 flex justify-between items-center min-w-0">
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {chat.title}
            </span>
            <span className={classnames("text-xs ml-2 flex-shrink-0")}>
              {dayjs(chat.updateTime).format("MM-DD HH:mm")}
            </span>
          </div>
        </div>
      </Dropdown>
    );
  };

  // 递归渲染分组
  const renderGroup = (group: ChatGroup, level = 0) => {
    const isExpanded = expandedGroups.has(group.id);
    const groupChats = chats
      .filter((c) => c.groupId === group.id && !c.archived)
      .sort((a, b) => b.updateTime - a.updateTime); // 按更新时间倒序
    const childGroups = groups.filter((g) => g.parentId === group.id);
    const isDragOver = dragOverTarget === group.id;

    return (
      <div key={group.id} className="my-1">
        <Dropdown
          menu={{ items: getGroupContextMenu(group.id) }}
          trigger={["contextMenu"]}
        >
          <div
            className={classnames(
              "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-all duration-200",
              {
                "bg-blue-500/10": isDragOver,
                "hover:bg-hover": !isDragOver,
              },
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => toggleGroup(group.id)}
            onDragOver={(e) => handleDragOver(e, group.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group.id)}
          >
            {isExpanded ? (
              <FolderOpenOutlined className="text-base mr-2 text-text-secondary" />
            ) : (
              <FolderOutlined className="text-base mr-2 text-text-secondary" />
            )}
            <div className="flex-1 flex justify-between items-center min-w-0">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {group.name}
              </span>
              <span className="text-xs text-text-secondary ml-2">
                ({groupChats.length + childGroups.length})
              </span>
            </div>
          </div>
        </Dropdown>

        {isExpanded && (
          <div className="ml-0">
            {childGroups.map((childGroup) =>
              renderGroup(childGroup, level + 1),
            )}
            {groupChats.map((chat) => (
              <div
                key={chat.id}
                style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
              >
                {renderChatItem(chat)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 获取未分组的对话（按更新时间倒序）
  const ungroupedChats = chats
    .filter((c) => !c.groupId && !c.archived)
    .sort((a, b) => b.updateTime - a.updateTime);

  // 获取根级别的分组
  const rootGroups = groups.filter((g) => g.parentId === null);

  // 获取归档的对话（按更新时间倒序）
  const archivedChats = chats
    .filter((c) => c.archived)
    .sort((a, b) => b.updateTime - a.updateTime);

  return (
    <div className="w-80 h-full  flex flex-col bg-primary-bg">
      <div className="px-4 py-4 flex justify-between items-center">
        <h3 className="m-0 text-base font-semibold">对话管理</h3>
        <PlusOutlined
          className="cursor-pointer hover:text-blue-500 transition-colors"
          onClick={() => handleCreateGroup()}
        />
      </div>

      <div
        className={classnames(
          "flex-1 overflow-y-auto py-2 transition-colors duration-200",
          {
            "bg-blue-500/5": dragOverTarget === "root",
          },
        )}
        onDragOver={(e) => handleDragOver(e, "root")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
      >
        {/* 分组 */}
        {rootGroups.map((group) => renderGroup(group))}

        {/* 未分组的对话 - 直接平铺 */}
        {ungroupedChats.map((chat) => renderChatItem(chat))}

        {/* 归档 */}
        {archivedChats.length > 0 && (
          <div className="my-1 mt-4 pt-2">
            <div
              className="flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-all duration-200 hover:bg-hover"
              onClick={() => setExpandedArchived(!expandedArchived)}
            >
              <InboxOutlined className="text-base mr-2 text-text-secondary" />
              <span className="flex-1 text-sm font-semibold text-text-primary">
                归档
              </span>
              <span className="text-xs text-text-secondary ml-2">
                ({archivedChats.length})
              </span>
            </div>

            {expandedArchived && (
              <div className="ml-4">
                {archivedChats.map((chat) => renderChatItem(chat, true))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        title={groupDialogMode === "create" ? "新建分组" : "编辑分组"}
        open={groupDialogVisible}
        onOk={handleGroupDialogOk}
        onCancel={() => {
          setGroupDialogVisible(false);
          setGroupName("");
          setEditingGroupId(null);
          setEditingGroupParentId(null);
        }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="请输入分组名称"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onPressEnter={handleGroupDialogOk}
        />
      </Modal>
    </div>
  );
});

export default ChatManagementSidebar;
