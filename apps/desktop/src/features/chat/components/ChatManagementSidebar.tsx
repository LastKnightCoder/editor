import { useSidebarI18n } from "@/components/ChatSidebar/sidebar.i18n";
import { sidebarNumber } from "@/components/ChatSidebar/sidebar.binding";
import { memo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
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
import { getChatDatabase } from "@/services/chatDatabase";
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
import useChatSessionStore, { MAIN_CHAT_BUCKET, selectRows } from "@/stores/useChatSessionStore";
import { chatSessionKey, piChatSessionManager } from "@/services/piChatSession";
import type { ChatGroup } from "@/types";
import type { ChatSessionRow } from "@/types/chat-session";

type ChatMessage = ChatSessionRow;

interface ChatManagementSidebarProps {
  selectedChatId: string | null;
  onChatSelect?: (chatId: string) => void;
}

const selectMainRows = selectRows(MAIN_CHAT_BUCKET);

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
 * 「全部会话」管理面板：分组 / 子分组树、未分组、已归档折叠、置顶、
 * 拖入分组、归档、移动、分组重命名 / 删除。分支在对话内部，不在列表里。放在 ChatLibraryDialog 里，也作 legacy
 * 对话管理页左栏（撑满高度、内部滚动）。
 */
const ChatManagementSidebar = memo(
  ({ selectedChatId, onChatSelect }: ChatManagementSidebarProps) => {
    const { t, locale } = useSidebarI18n();
    const chats = useChatSessionStore(selectMainRows);
    const groups = useChatSessionStore(state => state.groups);
    const {
      createGroup: createChatGroup,
      renameGroup: updateChatGroup,
      deleteGroup: deleteChatGroup,
      archiveChat: archiveChatMessage,
      moveChatToGroup,
      pinChat: pinChatMessage,
      unpinChat: unpinChatMessage,
    } = useChatSessionStore(
      useShallow(state => ({
        createGroup: state.createGroup,
        renameGroup: state.renameGroup,
        deleteGroup: state.deleteGroup,
        archiveChat: state.archiveChat,
        moveChatToGroup: state.moveChatToGroup,
        pinChat: state.pinChat,
        unpinChat: state.unpinChat,
      }))
    );

    const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
    const [expandedArchived, setExpandedArchived] = useState(false);
    const [draggedChatId, setDraggedChatId] = useState<string | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<number | null | "root">(null);
    const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
    const [groupName, setGroupName] = useState("");
    const [pendingDeleteGroup, setPendingDeleteGroup] = useState<number | null>(null);
    const [pendingDeleteChat, setPendingDeleteChat] = useState<string | null>(null);

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

    const handleChatSelect = useMemoizedFn((chatId: string) => {
      onChatSelect?.(chatId);
    });

    // 新对话是草稿（带上分组），首轮发送后才出现在列表里
    const createChatIn = useMemoizedFn((groupId: number | null) => {
      const draftId = useChatSessionStore.getState().openDraftInGroup(MAIN_CHAT_BUCKET, groupId);
      onChatSelect?.(draftId);
    });

    const handleCreateGroup = useMemoizedFn((parentId?: number | null) => {
      setGroupName("");
      setGroupDialog({
        mode: "create",
        groupId: null,
        parentId: parentId ?? null,
      });
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
        toast.warning(t("group.required"));
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
        toast.error(err.message || t("group.actionFailed"));
      }
    });

    const confirmDeleteGroup = useMemoizedFn(async () => {
      if (pendingDeleteGroup === null) return;
      try {
        await deleteChatGroup(pendingDeleteGroup);
      } catch (error) {
        const err = error as Error;
        toast.error(err.message || t("group.deleteFailed"));
      }
    });

    const askDeleteChat = useMemoizedFn((chatId: string) => {
      setPendingDeleteChat(chatId);
    });

    // 先释放宿主会话与运行态，再删目录行（主进程连会话文件一起删）
    const confirmDeleteChat = useMemoizedFn(async () => {
      if (!pendingDeleteChat) return;
      const databaseName = getChatDatabase();
      const key = chatSessionKey(MAIN_CHAT_BUCKET.scope, pendingDeleteChat, databaseName);
      try {
        const { piChatRuntime } = await import("@/services/piChatRuntime");
        await piChatSessionManager.disposeByKey(key);
        piChatRuntime.disposeConversation(key);
        await useChatSessionStore.getState().deleteChat(pendingDeleteChat, databaseName);
      } catch (error) {
        toast.error(t("group.deleteFailed"));
      }
    });

    const handleArchiveChat = useMemoizedFn(async (chatId: string, archived: boolean) => {
      try {
        await archiveChatMessage(chatId, archived);
      } catch (error) {
        toast.error(t("group.actionFailed"));
      }
    });

    const handleTogglePin = useMemoizedFn(async (chatId: string, pinned: boolean) => {
      try {
        if (pinned) {
          await unpinChatMessage(chatId);
        } else {
          await pinChatMessage(chatId);
        }
      } catch (error) {
        toast.error(pinned ? t("unpin.failed") : t("pin.failed"));
      }
    });

    const handleMoveToGroup = useMemoizedFn(
      async (chatId: string, targetGroupId: number | null) => {
        const chat = chats.find(c => c.id === chatId);
        // 分组未发生改变则不操作
        if (!chat || chat.groupId === targetGroupId) return;
        try {
          await moveChatToGroup(chatId, targetGroupId);
        } catch (error) {
          toast.error(t("group.moveFailed"));
        }
      }
    );

    /* ───────── 菜单（右键与 ⋯ 共用同一份内容） ───────── */

    const renderGroupMenuItems = (groupId: number) => (
      <>
        <Menu.Item icon={<MessageSquarePlus {...ICON} />} onSelect={() => createChatIn(groupId)}>
          {t("group.addChat")}
        </Menu.Item>
        <Menu.Item icon={<FolderPlus {...ICON} />} onSelect={() => handleCreateGroup(groupId)}>
          {t("group.addChild")}
        </Menu.Item>
        <Menu.Item icon={<Pencil {...ICON} />} onSelect={() => handleEditGroup(groupId)}>
          {t("group.rename")}
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          danger
          icon={<Trash2 {...ICON} />}
          onSelect={() => setPendingDeleteGroup(groupId)}
        >
          {t("group.delete")}
        </Menu.Item>
      </>
    );

    // 递归构建「移动至分组」子菜单：有子分组的分组本身也可选（子菜单首项）
    const renderMoveTargets = (parentId: number | null, chatId: string): ReactNode =>
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

    const renderChatMenuItems = (chat: ChatMessage, isArchived: boolean) => {
      const isPinned = chat.orderNum !== null;
      return (
        <>
          <Menu.Item
            icon={isPinned ? <PinOff {...ICON} /> : <Pin {...ICON} />}
            onSelect={() => handleTogglePin(chat.id, isPinned)}
          >
            {isPinned ? t("unpin.action") : t("pin.action")}
          </Menu.Item>
          {!isArchived &&
            (groups.length > 0 ? (
              <Menu.Submenu icon={<FolderInput {...ICON} />} label={t("group.moveTo")}>
                <Menu.Item onSelect={() => handleMoveToGroup(chat.id, null)}>
                  {t("group.ungrouped")}
                </Menu.Item>
                <Menu.Separator />
                {renderMoveTargets(null, chat.id)}
              </Menu.Submenu>
            ) : (
              <Menu.Item
                icon={<FolderInput {...ICON} />}
                onSelect={() => handleMoveToGroup(chat.id, null)}
              >
                {t("group.moveUngrouped")}
              </Menu.Item>
            ))}
          {!isArchived && (
            <Menu.Item
              icon={<Archive {...ICON} />}
              onSelect={() => handleArchiveChat(chat.id, true)}
            >
              {t("chat.archive")}
            </Menu.Item>
          )}
          {isArchived && (
            <Menu.Item
              icon={<ArchiveRestore {...ICON} />}
              onSelect={() => handleArchiveChat(chat.id, false)}
            >
              {t("chat.unarchive")}
            </Menu.Item>
          )}
          <Menu.Separator />
          <Menu.Item danger icon={<Trash2 {...ICON} />} onSelect={() => askDeleteChat(chat.id)}>
            {t("action.delete")}
          </Menu.Item>
        </>
      );
    };

    /* ───────── 拖拽（拖入分组 / 根区域 = 未分组） ───────── */

    const handleDragStart = useMemoizedFn((e: React.DragEvent, chatId: string) => {
      setDraggedChatId(chatId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", chatId);
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
        toast.error(t("group.moveFailed"));
      } finally {
        setDraggedChatId(null);
        setDragOverTarget(null);
      }
    });

    /* ───────── 渲染 ───────── */

    const renderChatItem = (chat: ChatMessage, isArchived: boolean, depth: number) => {
      const isSelected = selectedChatId === chat.id;
      const isDragging = draggedChatId === chat.id;
      const isPinned = chat.orderNum !== null;
      const canDrag = !isArchived;
      const menuItems = renderChatMenuItems(chat, isArchived);

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
            <MessageSquare {...ICON} className="text-ink-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{chat.title || t("chat.new")}</span>
            <span className="text-tau-sm text-ink-3 shrink-0 font-normal tabular-nums">
              {new Intl.DateTimeFormat(locale, {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(chat.updateTime)}
            </span>
            {/* 置顶槽：已置顶常显，未置顶悬停淡入 */}
            <Tooltip content={isPinned ? t("unpin.action") : t("pin.action")}>
              <IconButton
                aria-label={isPinned ? t("unpin.action") : t("pin.action")}
                className={cn(hoverSlot, isPinned && "text-ink-2 opacity-100")}
                onClick={e => {
                  e.stopPropagation();
                  void handleTogglePin(chat.id, isPinned);
                }}
              >
                <Pin size={13} strokeWidth={1.75} className={cn(isPinned && "fill-current")} />
              </IconButton>
            </Tooltip>
            <Menu
              align="end"
              trigger={
                <IconButton
                  aria-label={t("action.more")}
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
        <span className="shrink-0 tabular-nums">{sidebarNumber(count)}</span>
        {actions ?? <span className="size-6 shrink-0" />}
      </div>
    );

    // 递归渲染分组
    const renderGroup = (group: ChatGroup, level = 0): ReactNode => {
      const isExpanded = expandedGroups.has(group.id);
      // 置顶在前
      const groupChats = chats
        .filter(c => c.groupId === group.id && !c.archived)
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
                        aria-label={t("group.actions")}
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
              {groupChats.map(chat => renderChatItem(chat, false, level + 1))}
            </>
          )}
        </div>
      );
    };

    // 未分组的对话（置顶在前）
    const ungroupedChats = chats.filter(c => !c.groupId && !c.archived).sort(sortByPinThenTime);
    const rootGroups = groups.filter(g => g.parentId === null);
    // 归档的对话（按更新时间倒序）
    const archivedChats = chats.filter(c => c.archived).sort((a, b) => b.updateTime - a.updateTime);
    const isEmpty =
      rootGroups.length === 0 && ungroupedChats.length === 0 && archivedChats.length === 0;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 px-1 pt-1 pb-2">
          <Button size="sm" variant="ghost" icon={SquarePen} onClick={() => createChatIn(null)}>
            {t("chat.create")}
          </Button>
          <Button size="sm" variant="ghost" icon={FolderPlus} onClick={() => handleCreateGroup()}>
            {t("group.new")}
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
          {isEmpty && (
            <p className="text-tau-sm text-ink-3 px-2 py-6 text-center">{t("chat.none")}</p>
          )}

          {rootGroups.length > 0 && (
            <div className="flex flex-col gap-px">
              {rootGroups.map(group => renderGroup(group))}
            </div>
          )}

          {ungroupedChats.length > 0 && (
            <div className={cn("flex flex-col gap-px", rootGroups.length > 0 && "mt-3")}>
              {rootGroups.length > 0 && (
                <div className="text-tau-tiny text-ink-3 flex h-6 items-center px-2 font-medium">
                  {t("group.ungrouped")}
                </div>
              )}
              {ungroupedChats.map(chat => renderChatItem(chat, false, 0))}
            </div>
          )}

          {archivedChats.length > 0 && (
            <div className="mt-3 flex flex-col gap-px">
              {renderSectionHeader({
                label: t("chat.archived"),
                icon: <Archive size={13} strokeWidth={1.75} className="shrink-0" />,
                count: archivedChats.length,
                expanded: expandedArchived,
                depth: 0,
                onToggle: () => setExpandedArchived(v => !v),
              })}
              {expandedArchived && archivedChats.map(chat => renderChatItem(chat, true, 1))}
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
              ? t("group.renameTitle")
              : groupDialog?.parentId != null
                ? t("group.newChild")
                : t("group.new")
          }
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={closeGroupDialog}>
                {t("action.cancel")}
              </Button>
              <Button variant="primary" onClick={() => void handleGroupDialogOk()}>
                {t("action.confirm")}
              </Button>
            </>
          }
        >
          <DialogBody>
            <Input
              data-autofocus
              placeholder={t("group.required")}
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
          title={t("group.delete")}
          description={t("group.deleteHint")}
          confirmText={t("action.delete")}
          danger
          onConfirm={confirmDeleteGroup}
        />

        <ConfirmDialog
          open={pendingDeleteChat !== null}
          onOpenChange={open => {
            if (!open) setPendingDeleteChat(null);
          }}
          title={t("chat.delete")}
          description={t("chat.deleteHint")}
          confirmText={t("action.delete")}
          danger
          onConfirm={confirmDeleteChat}
        />
      </div>
    );
  }
);

export default ChatManagementSidebar;
