import { memo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  GitBranch,
  GripVertical,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import dayjs from "dayjs";
import {
  Button,
  ConfirmDialog,
  ContextMenu,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Menu,
  Tooltip,
  cn,
  toast,
} from "@tau/ui";
import useChatMessageStore from "@/stores/useChatMessageStore";
import type { ChatMessage, ChatGroup, ResponseMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";

interface ChatManagementSidebarProps {
  selectedChatId: number | null;
  onChatSelect?: (chatId: number) => void;
}

const ICON = { size: 14, strokeWidth: 1.75 } as const;
/** 缩进：每层 16px，行内左内边距 8px */
const indent = (depth: number) => ({ paddingLeft: `${depth * 16 + 8}px` });

/** 置顶（orderNum）在前按顺序，其余按更新时间倒序 */
const sortByPinThenTime = (a: ChatMessage, b: ChatMessage) => {
  if (a.orderNum !== null && b.orderNum !== null) return (a.orderNum || 0) - (b.orderNum || 0);
  if (a.orderNum !== null) return -1;
  if (b.orderNum !== null) return 1;
  return b.updateTime - a.updateTime;
};

/** 行内操作槽位：固定尺寸，悬停 / 聚焦 / 菜单展开时淡入，不改变行宽 */
const hoverSlot =
  "size-6 shrink-0 rounded-[6px] text-ink-3 hover:text-ink-1 opacity-0 ease-tau-out transition-opacity duration-[160ms] group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100";

type GroupDialogState = {
  mode: "create" | "edit";
  groupId: number | null;
  parentId: number | null;
} | null;

/**
 * 「全部会话」管理面板（D-048 tau 化）：分组 / 子分组树、未分组、已归档折叠、置顶、
 * 拖入分组、归档、移动、分支、分组重命名 / 删除。放在 ChatLibraryDialog 里，也作 legacy
 * 对话管理页左栏（撑满高度、内部滚动）。
 */
const ChatManagementSidebar = memo(
  ({ selectedChatId, onChatSelect }: ChatManagementSidebarProps) => {
    const {
      chats,
      groups,
      createChatMessage,
      createChatGroup,
      updateChatGroup,
      deleteChatGroup,
      deleteChatMessage,
      archiveChatMessage,
      moveChatToGroup,
      createChatBranch,
      pinChatMessage,
      unpinChatMessage,
      getChildBranchesCount,
    } = useChatMessageStore(
      useShallow(state => ({
        chats: state.chats,
        groups: state.groups,
        createChatMessage: state.createChatMessage,
        createChatGroup: state.createChatGroup,
        updateChatGroup: state.updateChatGroup,
        deleteChatGroup: state.deleteChatGroup,
        deleteChatMessage: state.deleteChatMessage,
        archiveChatMessage: state.archiveChatMessage,
        moveChatToGroup: state.moveChatToGroup,
        createChatBranch: state.createChatBranch,
        pinChatMessage: state.pinChatMessage,
        unpinChatMessage: state.unpinChatMessage,
        getChildBranchesCount: state.getChildBranchesCount,
      }))
    );

    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [expandedArchived, setExpandedArchived] = useState(false);
    const [draggedChatId, setDraggedChatId] = useState<number | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<number | null | "root">(null);
    const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
    const [groupName, setGroupName] = useState("");
    const [pendingDeleteGroup, setPendingDeleteGroup] = useState<number | null>(null);
    const [pendingDeleteChat, setPendingDeleteChat] = useState<{
      id: number;
      branches: number;
    } | null>(null);

    const toggleGroup = useMemoizedFn((groupId: number) => {
      setExpandedGroups(prev => {
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
      onChatSelect?.(chatId);
    });

    const createChatIn = useMemoizedFn(async (groupId: number | null) => {
      const messages: ResponseMessage[] = [{ role: Role.System, content: DEFAULT_SYSTEM_PROMPT }];
      try {
        const newChat = await createChatMessage(messages, "新对话", groupId, false);
        onChatSelect?.(newChat.id);
      } catch (error) {
        toast.error("创建失败");
        console.error(error);
      }
    });

    const handleCreateGroup = useMemoizedFn((parentId?: number | null) => {
      setGroupName("");
      setGroupDialog({ mode: "create", groupId: null, parentId: parentId ?? null });
    });

    const handleEditGroup = useMemoizedFn((groupId: number) => {
      const group = groups.find(g => g.id === groupId);
      if (!group) return;
      setGroupName(group.name);
      setGroupDialog({ mode: "edit", groupId, parentId: null });
    });

    const closeGroupDialog = useMemoizedFn(() => {
      setGroupDialog(null);
      setGroupName("");
    });

    const handleGroupDialogOk = useMemoizedFn(async () => {
      if (!groupDialog) return;
      const name = groupName.trim();
      if (!name) {
        toast.warning("请输入分组名称");
        return;
      }
      try {
        if (groupDialog.mode === "create") {
          await createChatGroup(name, groupDialog.parentId);
        } else if (groupDialog.groupId) {
          await updateChatGroup(groupDialog.groupId, name);
        }
        closeGroupDialog();
      } catch (error) {
        const err = error as Error;
        toast.error(err.message || "操作失败");
      }
    });

    const confirmDeleteGroup = useMemoizedFn(async () => {
      if (pendingDeleteGroup === null) return;
      try {
        await deleteChatGroup(pendingDeleteGroup);
      } catch (error) {
        const err = error as Error;
        toast.error(err.message || "删除失败");
      }
    });

    const askDeleteChat = useMemoizedFn(async (chatId: number) => {
      let branches = 0;
      try {
        branches = await getChildBranchesCount(chatId);
      } catch (error) {
        console.error("Failed to get child branches count:", error);
      }
      setPendingDeleteChat({ id: chatId, branches });
    });

    const confirmDeleteChat = useMemoizedFn(async () => {
      if (!pendingDeleteChat) return;
      try {
        await deleteChatMessage(pendingDeleteChat.id);
      } catch (error) {
        toast.error("删除失败");
      }
    });

    const handleArchiveChat = useMemoizedFn(async (chatId: number, archived: boolean) => {
      try {
        await archiveChatMessage(chatId, archived);
      } catch (error) {
        toast.error("操作失败");
      }
    });

    const handleTogglePin = useMemoizedFn(async (chatId: number, pinned: boolean) => {
      try {
        if (pinned) {
          await unpinChatMessage(chatId);
        } else {
          await pinChatMessage(chatId);
        }
      } catch (error) {
        toast.error(pinned ? "取消置顶失败" : "置顶失败");
      }
    });

    // 创建分支（基于当前对话的所有消息，新分支是当前对话的子级）
    const handleCreateBranchFromChat = useMemoizedFn(async (chatId: number) => {
      const chat = chats.find(c => c.id === chatId);
      if (!chat) {
        toast.error("对话不存在");
        return;
      }
      if (chat.messages.length <= 1) {
        toast.warning("对话没有足够的消息来创建分支");
        return;
      }
      try {
        await createChatBranch(chat.id, chat.messages);
      } catch (error) {
        toast.error("创建分支失败");
        console.error("Create branch error:", error);
      }
    });

    const handleMoveToGroup = useMemoizedFn(
      async (chatId: number, targetGroupId: number | null) => {
        const chat = chats.find(c => c.id === chatId);
        // 分组未发生改变则不操作
        if (!chat || chat.groupId === targetGroupId) return;
        try {
          await moveChatToGroup(chatId, targetGroupId);
        } catch (error) {
          toast.error("移动失败");
        }
      }
    );

    /* ───────── 菜单（右键与 ⋯ 共用同一份内容） ───────── */

    const renderGroupMenuItems = (groupId: number) => (
      <>
        <Menu.Item icon={<MessageSquarePlus {...ICON} />} onSelect={() => createChatIn(groupId)}>
          添加对话
        </Menu.Item>
        <Menu.Item icon={<FolderPlus {...ICON} />} onSelect={() => handleCreateGroup(groupId)}>
          添加子分组
        </Menu.Item>
        <Menu.Item icon={<Pencil {...ICON} />} onSelect={() => handleEditGroup(groupId)}>
          重命名
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 {...ICON} />}
          onSelect={() => setPendingDeleteGroup(groupId)}
        >
          删除分组
        </Menu.Item>
      </>
    );

    // 递归构建「移动至分组」子菜单：有子分组的分组本身也可选（子菜单首项）
    const renderMoveTargets = (parentId: number | null, chatId: number): ReactNode =>
      groups
        .filter(g => g.parentId === parentId)
        .map(group => {
          const hasChildren = groups.some(g => g.parentId === group.id);
          if (!hasChildren) {
            return (
              <Menu.Item
                key={group.id}
                icon={<Folder {...ICON} />}
                onSelect={() => handleMoveToGroup(chatId, group.id)}
              >
                {group.name}
              </Menu.Item>
            );
          }
          return (
            <Menu.Submenu key={group.id} icon={<Folder {...ICON} />} label={group.name}>
              <Menu.Item onSelect={() => handleMoveToGroup(chatId, group.id)}>
                {group.name}
              </Menu.Item>
              <Menu.Separator />
              {renderMoveTargets(group.id, chatId)}
            </Menu.Submenu>
          );
        });

    const renderChatMenuItems = (chat: ChatMessage, isArchived: boolean, isBranch: boolean) => {
      const isPinned = chat.orderNum !== null;
      return (
        <>
          {/* 分支不能置顶 */}
          {!isBranch && (
            <Menu.Item
              icon={isPinned ? <PinOff {...ICON} /> : <Pin {...ICON} />}
              onSelect={() => handleTogglePin(chat.id, isPinned)}
            >
              {isPinned ? "取消置顶" : "置顶"}
            </Menu.Item>
          )}
          {/* 分支不能移动到分组或归档 */}
          {!isArchived &&
            !isBranch &&
            (groups.length > 0 ? (
              <Menu.Submenu icon={<FolderInput {...ICON} />} label="移动至分组">
                <Menu.Item onSelect={() => handleMoveToGroup(chat.id, null)}>未分组</Menu.Item>
                <Menu.Separator />
                {renderMoveTargets(null, chat.id)}
              </Menu.Submenu>
            ) : (
              <Menu.Item
                icon={<FolderInput {...ICON} />}
                onSelect={() => handleMoveToGroup(chat.id, null)}
              >
                移到未分组
              </Menu.Item>
            ))}
          {!isArchived && !isBranch && (
            <Menu.Item
              icon={<Archive {...ICON} />}
              onSelect={() => handleArchiveChat(chat.id, true)}
            >
              归档
            </Menu.Item>
          )}
          {isArchived && !isBranch && (
            <Menu.Item
              icon={<ArchiveRestore {...ICON} />}
              onSelect={() => handleArchiveChat(chat.id, false)}
            >
              取消归档
            </Menu.Item>
          )}
          {/* 所有对话（包括分支）都可以创建分支 */}
          {!isArchived && (
            <Menu.Item
              icon={<GitBranch {...ICON} />}
              onSelect={() => handleCreateBranchFromChat(chat.id)}
            >
              创建分支
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item danger icon={<Trash2 {...ICON} />} onSelect={() => askDeleteChat(chat.id)}>
            删除
          </Menu.Item>
        </>
      );
    };

    /* ───────── 拖拽（拖入分组 / 根区域 = 未分组） ───────── */

    const handleDragStart = useMemoizedFn((e: React.DragEvent, chatId: number) => {
      setDraggedChatId(chatId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", chatId.toString());
    });

    const handleDragEnd = useMemoizedFn(() => {
      setDraggedChatId(null);
      setDragOverTarget(null);
    });

    const handleDragOver = useMemoizedFn(
      (e: React.DragEvent, targetGroupId: number | null | "root") => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDragOverTarget(targetGroupId);
      }
    );

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

    const handleDrop = useMemoizedFn(async (e: React.DragEvent, targetGroupId: number | null) => {
      e.preventDefault();
      e.stopPropagation();
      if (!draggedChatId) return;

      const chat = chats.find(c => c.id === draggedChatId);
      if (!chat || chat.groupId === targetGroupId) {
        setDraggedChatId(null);
        setDragOverTarget(null);
        return;
      }

      try {
        await moveChatToGroup(draggedChatId, targetGroupId);
      } catch (error) {
        toast.error("移动失败");
      } finally {
        setDraggedChatId(null);
        setDragOverTarget(null);
      }
    });

    /* ───────── 渲染 ───────── */

    const renderChatItem = (chat: ChatMessage, isArchived: boolean, depth: number) => {
      const isSelected = selectedChatId === chat.id;
      const isDragging = draggedChatId === chat.id;
      const isBranch = chat.parentChatId != null;
      const isPinned = chat.orderNum !== null;
      const canDrag = !isArchived && !isBranch;
      const menuItems = renderChatMenuItems(chat, isArchived, isBranch);

      return (
        <ContextMenu key={chat.id} content={menuItems}>
          <div
            role="button"
            tabIndex={0}
            aria-current={isSelected || undefined}
            className={cn(
              "group/row rounded-tau-sm text-tau-body relative flex h-8 cursor-pointer select-none items-center gap-2 pr-1 outline-none",
              "ease-tau-out transition-[background-color,opacity] duration-[160ms]",
              "focus-visible:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]",
              isSelected
                ? "bg-selected text-ink-1 font-medium"
                : "text-ink-2 hover:bg-hover hover:text-ink-1",
              isDragging && "cursor-grabbing opacity-50"
            )}
            style={indent(depth)}
            onClick={() => handleChatSelect(chat.id)}
            onKeyDown={e => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleChatSelect(chat.id);
              }
            }}
            draggable={canDrag}
            onDragStart={e => handleDragStart(e, chat.id)}
            onDragEnd={handleDragEnd}
          >
            {/* 拖拽手柄：落在左内边距里，悬停淡入，不挤占行宽 */}
            {canDrag && (
              <GripVertical
                size={12}
                strokeWidth={1.75}
                aria-hidden
                className="text-ink-3 ease-tau-out pointer-events-none absolute top-1/2 -translate-x-[11px] -translate-y-1/2 opacity-0 transition-opacity duration-[160ms] group-hover/row:opacity-100"
              />
            )}
            {isBranch ? (
              <GitBranch {...ICON} className="text-ink-3 shrink-0" />
            ) : (
              <MessageSquare {...ICON} className="text-ink-3 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{chat.title || "新对话"}</span>
            <span className="text-tau-sm text-ink-3 shrink-0 font-normal tabular-nums">
              {dayjs(chat.updateTime).format("MM-DD HH:mm")}
            </span>
            {/* 置顶槽：已置顶常显，未置顶悬停淡入；分支不可置顶，留等宽空位 */}
            {isBranch ? (
              <span className="size-6 shrink-0" />
            ) : (
              <Tooltip content={isPinned ? "取消置顶" : "置顶"}>
                <IconButton
                  aria-label={isPinned ? "取消置顶" : "置顶"}
                  className={cn(hoverSlot, isPinned && "text-ink-2 opacity-100")}
                  onClick={e => {
                    e.stopPropagation();
                    void handleTogglePin(chat.id, isPinned);
                  }}
                >
                  <Pin size={13} strokeWidth={1.75} className={cn(isPinned && "fill-current")} />
                </IconButton>
              </Tooltip>
            )}
            <Menu
              align="end"
              trigger={
                <IconButton
                  aria-label="更多操作"
                  className={hoverSlot}
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal {...ICON} />
                </IconButton>
              }
            >
              {menuItems}
            </Menu>
          </div>
        </ContextMenu>
      );
    };

    // 递归渲染对话及其分支
    const renderChatWithBranches = (
      chat: ChatMessage,
      isArchived = false,
      depth = 0
    ): ReactNode => {
      const branches = chats
        .filter(c => c.parentChatId === chat.id && !c.archived)
        .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));

      return (
        <div key={chat.id} className="flex flex-col gap-px">
          {renderChatItem(chat, isArchived, depth)}
          {branches.map(branch => renderChatWithBranches(branch, isArchived, depth + 1))}
        </div>
      );
    };

    /** 分组 / 已归档的标题行：小字 + 折叠箭头 + 计数 */
    const renderSectionHeader = ({
      label,
      icon,
      count,
      expanded,
      depth,
      onToggle,
      actions,
      className,
    }: {
      label: string;
      icon: ReactNode;
      count: number;
      expanded: boolean;
      depth: number;
      onToggle: () => void;
      actions?: ReactNode;
      className?: string;
    }) => (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className={cn(
          "group/row rounded-tau-sm text-tau-tiny text-ink-3 flex h-7 cursor-pointer select-none items-center gap-1.5 pr-1 outline-none",
          "ease-tau-out hover:bg-hover hover:text-ink-2 transition-[background-color,box-shadow,color] duration-[160ms]",
          "focus-visible:shadow-[inset_0_0_0_1.5px_var(--tau-accent)]",
          className
        )}
        style={indent(depth)}
        onClick={onToggle}
        onKeyDown={e => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          className={cn(
            "ease-tau-out shrink-0 transition-transform duration-[160ms]",
            expanded && "rotate-90"
          )}
        />
        {icon}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums">{count}</span>
        {actions ?? <span className="size-6 shrink-0" />}
      </div>
    );

    // 递归渲染分组
    const renderGroup = (group: ChatGroup, level = 0): ReactNode => {
      const isExpanded = expandedGroups.has(group.id);
      // 只获取根对话（不包含分支），置顶在前
      const groupChats = chats
        .filter(c => c.groupId === group.id && !c.archived && !c.parentChatId)
        .sort(sortByPinThenTime);
      const childGroups = groups.filter(g => g.parentId === group.id);
      const isDragOver = dragOverTarget === group.id;
      const menuItems = renderGroupMenuItems(group.id);

      return (
        <div key={group.id} className="flex flex-col gap-px">
          <ContextMenu content={menuItems}>
            <div
              onDragOver={e => handleDragOver(e, group.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, group.id)}
            >
              {renderSectionHeader({
                label: group.name,
                icon: <Folder size={13} strokeWidth={1.75} className="shrink-0" />,
                count: groupChats.length + childGroups.length,
                expanded: isExpanded,
                depth: level,
                onToggle: () => toggleGroup(group.id),
                className: isDragOver
                  ? "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
                  : undefined,
                actions: (
                  <Menu
                    align="end"
                    trigger={
                      <IconButton
                        aria-label="分组操作"
                        className={hoverSlot}
                        onClick={e => e.stopPropagation()}
                      >
                        <MoreHorizontal {...ICON} />
                      </IconButton>
                    }
                  >
                    {menuItems}
                  </Menu>
                ),
              })}
            </div>
          </ContextMenu>

          {isExpanded && (
            <>
              {childGroups.map(childGroup => renderGroup(childGroup, level + 1))}
              {groupChats.map(chat => renderChatWithBranches(chat, false, level + 1))}
            </>
          )}
        </div>
      );
    };

    // 未分组的根对话（置顶在前，不包含分支）
    const ungroupedChats = chats
      .filter(c => !c.groupId && !c.archived && !c.parentChatId)
      .sort(sortByPinThenTime);
    const rootGroups = groups.filter(g => g.parentId === null);
    // 归档的根对话（按更新时间倒序，不包含分支）
    const archivedChats = chats
      .filter(c => c.archived && !c.parentChatId)
      .sort((a, b) => b.updateTime - a.updateTime);
    const isEmpty =
      rootGroups.length === 0 && ungroupedChats.length === 0 && archivedChats.length === 0;

    const deletingBranches = pendingDeleteChat?.branches ?? 0;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 px-1 pb-2 pt-1">
          <Button size="sm" variant="ghost" icon={SquarePen} onClick={() => createChatIn(null)}>
            新建对话
          </Button>
          <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => handleCreateGroup()}>
            新建分组
          </Button>
        </div>

        <div
          className={cn(
            "rounded-tau-md min-h-0 flex-1 overflow-y-auto px-1 pb-3",
            "ease-tau-out transition-[box-shadow] duration-[160ms]",
            dragOverTarget === "root" && "shadow-[inset_0_0_0_1.5px_var(--tau-accent)]"
          )}
          onDragOver={e => handleDragOver(e, "root")}
          onDragLeave={handleDragLeave}
          onDrop={e => handleDrop(e, null)}
        >
          {isEmpty && <p className="text-tau-sm text-ink-3 px-2 py-6 text-center">还没有对话</p>}

          {rootGroups.length > 0 && (
            <div className="flex flex-col gap-px">
              {rootGroups.map(group => renderGroup(group))}
            </div>
          )}

          {ungroupedChats.length > 0 && (
            <div className={cn("flex flex-col gap-px", rootGroups.length > 0 && "mt-3")}>
              {rootGroups.length > 0 && (
                <div className="text-tau-tiny text-ink-3 flex h-6 items-center px-2 font-medium">
                  未分组
                </div>
              )}
              {ungroupedChats.map(chat => renderChatWithBranches(chat))}
            </div>
          )}

          {archivedChats.length > 0 && (
            <div className="mt-3 flex flex-col gap-px">
              {renderSectionHeader({
                label: "已归档",
                icon: <Archive size={13} strokeWidth={1.75} className="shrink-0" />,
                count: archivedChats.length,
                expanded: expandedArchived,
                depth: 0,
                onToggle: () => setExpandedArchived(v => !v),
              })}
              {expandedArchived && archivedChats.map(chat => renderChatWithBranches(chat, true, 1))}
            </div>
          )}
        </div>

        <Dialog
          open={groupDialog !== null}
          onOpenChange={open => {
            if (!open) closeGroupDialog();
          }}
          title={
            groupDialog?.mode === "edit"
              ? "重命名分组"
              : groupDialog?.parentId != null
                ? "新建子分组"
                : "新建分组"
          }
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={closeGroupDialog}>
                取消
              </Button>
              <Button variant="primary" onClick={() => void handleGroupDialogOk()}>
                确定
              </Button>
            </>
          }
        >
          <DialogBody>
            <Input
              data-autofocus
              placeholder="请输入分组名称"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleGroupDialogOk();
                }
              }}
            />
          </DialogBody>
        </Dialog>

        <ConfirmDialog
          open={pendingDeleteGroup !== null}
          onOpenChange={open => {
            if (!open) setPendingDeleteGroup(null);
          }}
          title="删除分组"
          description="确定要删除这个分组吗？分组下的对话将移到未分组。"
          confirmText="删除"
          danger
          onConfirm={confirmDeleteGroup}
        />

        <ConfirmDialog
          open={pendingDeleteChat !== null}
          onOpenChange={open => {
            if (!open) setPendingDeleteChat(null);
          }}
          title="删除对话"
          description={
            deletingBranches > 0
              ? `此对话包含 ${deletingBranches} 个子分支，删除后将同时删除所有子分支。此操作不可恢复。`
              : "确定要删除这个对话吗？此操作不可恢复。"
          }
          confirmText="删除"
          danger
          onConfirm={confirmDeleteChat}
        />
      </div>
    );
  }
);

export default ChatManagementSidebar;
