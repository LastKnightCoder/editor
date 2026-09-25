import { memo, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  GitBranch,
  Library,
  MoreHorizontal,
  Pencil,
  Pin,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { ConfirmDialog, IconButton, Menu, Popover, Spinner, cn, toast } from "@tau/ui";

import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";
import { ChatMessage } from "@/types";
import type { ChatRunStatus, ChatSource } from "@/types/chat-run";
import useChatRunStore from "@/stores/useChatRunStore";

interface ChatDropdownSelectorProps {
  /** 对话列表 */
  chats: ChatMessage[];
  currentChat: ChatMessage;
  onChatSelect: (chatId: number) => void;
  onTitleChange: (title: string) => void;
  onCreateNewChat: () => void;
  onChatDelete?: (chatId: number) => void;
  getChildBranchesCount?: (chatId: number) => Promise<number>;
  disabled?: boolean;
  titleRef?: React.RefObject<EditTextHandle | null>;
  chatSource?: ChatSource;
  /** 列表末行「全部会话…」（有全量管理入口的宿主才传） */
  onOpenLibrary?: () => void;
}

const ACTIVE_RUN: ChatRunStatus[] = ["queued", "running", "retrying", "waiting_input"];

/**
 * 对话标题行（D-048 tau 化，停靠栏 / 项目 / PDF / 视频笔记对话共用）：
 * 标题 ▾ = 会话切换 Popover（搜索 + 新对话 + 置顶在前的会话列表）；分支 chip = 分支切换 Menu；
 * ⋯ = 重命名 / 删除（删除走 ConfirmDialog，含子分支数）。
 */
const ChatDropdownSelector = memo(
  ({
    chats,
    currentChat,
    onChatSelect,
    onTitleChange,
    onCreateNewChat,
    onChatDelete,
    getChildBranchesCount,
    disabled,
    titleRef,
    chatSource = "main-chat",
    onOpenLibrary,
  }: ChatDropdownSelectorProps) => {
    const chatRuns = useChatRunStore(state => state.runs);
    const [listOpen, setListOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [renaming, setRenaming] = useState(false);
    const draftTitle = useRef("");
    const [pendingDelete, setPendingDelete] = useState<{ id: number; branches: number } | null>(
      null
    );
    const hasChat = currentChat.id !== 0;

    // 相关分支：主干 + 兄弟分支 + 子分支
    const siblingBranches = useMemo(() => {
      if (!hasChat) return [];
      const result: ChatMessage[] = [];
      const findRoot = (chat: ChatMessage): ChatMessage => {
        if (!chat.parentChatId) return chat;
        const parent = chats.find(c => c.id === chat.parentChatId);
        return parent ? findRoot(parent) : chat;
      };
      const root = findRoot(currentChat);
      if (root.id !== currentChat.id) result.push(root);
      if (currentChat.parentChatId) {
        result.push(
          ...chats
            .filter(c => c.parentChatId === currentChat.parentChatId)
            .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0))
        );
      } else {
        result.push(currentChat);
      }
      result.push(
        ...chats
          .filter(c => c.parentChatId === currentChat.id)
          .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0))
      );
      return result.length > 1 ? result : [];
    }, [chats, currentChat, hasChat]);
    const currentBranchIndex = siblingBranches.findIndex(c => c.id === currentChat.id);

    // 会话列表：未归档主干，置顶（orderNum）在前，其余按更新时间
    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      const roots = chats.filter(c => !c.archived && !c.parentChatId);
      const pinned = roots
        .filter(c => c.orderNum != null)
        .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0));
      const rest = roots
        .filter(c => c.orderNum == null)
        .sort((a, b) => b.updateTime - a.updateTime);
      return [...pinned, ...rest]
        .filter(c => !q || (c.title || "").toLowerCase().includes(q))
        .map(chat => ({
          chat,
          pinned: chat.orderNum != null,
          hasBranches: chats.some(c => c.parentChatId === chat.id),
          runStatus: Object.values(chatRuns)
            .filter(run => run.sessionKey === `${chatSource}:${chat.id}`)
            .sort((a, b) => b.updatedAt - a.updatedAt)[0]?.status,
        }));
    }, [chatRuns, chatSource, chats, query]);

    const select = (chatId: number) => {
      setListOpen(false);
      setQuery("");
      if (chatId !== currentChat.id) onChatSelect(chatId);
    };

    const askDelete = useMemoizedFn(async () => {
      if (!onChatDelete || !hasChat) return;
      let branches = 0;
      try {
        branches = (await getChildBranchesCount?.(currentChat.id)) ?? 0;
      } catch (error) {
        console.error("Failed to get child branches count:", error);
      }
      setPendingDelete({ id: currentChat.id, branches });
    });

    const title = hasChat ? currentChat.title || "新对话" : "新对话";

    return (
      <div className="flex w-full min-w-0 items-center gap-0.5">
        {renaming && hasChat ? (
          <div className="text-tau-body text-ink-1 min-w-0 flex-1 px-1.5 font-semibold">
            <EditText
              key={currentChat.id}
              ref={titleRef}
              defaultValue={currentChat.title}
              value={currentChat.title}
              // 逐字变化只记草稿，失焦 / 回车才落库（legacy 每个字都写一次库）
              onChange={value => {
                draftTitle.current = value;
              }}
              onBlur={() => {
                const next = draftTitle.current.trim();
                if (next && next !== currentChat.title) onTitleChange(next);
                setRenaming(false);
              }}
              contentEditable={!disabled}
              defaultFocus
            />
          </div>
        ) : (
          <Popover
            open={listOpen}
            onOpenChange={open => {
              setListOpen(open);
              if (!open) setQuery("");
            }}
            placement="bottom-start"
            arrow={false}
            className="w-[300px] p-1.5"
            trigger={
              <button
                type="button"
                disabled={disabled}
                title="切换对话"
                className="hover:bg-hover aria-expanded:bg-hover text-tau-body text-ink-1 ease-tau-out -ml-1 flex min-w-0 max-w-full items-center gap-1 rounded-[8px] px-1.5 py-1 font-semibold transition-colors duration-[160ms]"
              >
                <span className="min-w-0 truncate">{title}</span>
                <ChevronDown size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
              </button>
            }
          >
            <div className="border-line-1 bg-surface mb-1 flex h-8 items-center gap-2 rounded-[8px] border px-2.5">
              <Search size={13} strokeWidth={1.75} className="text-ink-3 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索对话"
                className="text-tau-meta text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setListOpen(false);
                onCreateNewChat();
              }}
              className="hover:bg-hover text-tau-meta text-ink-1 flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5"
            >
              <SquarePen size={14} strokeWidth={1.75} className="text-ink-2" />
              新对话
            </button>
            <div className="max-h-[320px] overflow-y-auto">
              {rows.length === 0 ? (
                <p className="text-tau-sm text-ink-3 px-2.5 py-3">没有匹配的对话</p>
              ) : (
                rows.map(({ chat, pinned, hasBranches, runStatus }) => {
                  const active = chat.id === currentChat.id || chat.id === currentChat.parentChatId;
                  return (
                    <button
                      type="button"
                      key={chat.id}
                      onClick={() => select(chat.id)}
                      className={cn(
                        "text-tau-meta flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-left",
                        active
                          ? "bg-selected text-ink-1 font-medium"
                          : "text-ink-2 hover:bg-hover hover:text-ink-1"
                      )}
                    >
                      <span className="flex size-3.5 shrink-0 items-center justify-center">
                        {runStatus && ACTIVE_RUN.includes(runStatus) ? (
                          <Spinner className="size-3 border-[1.5px]" />
                        ) : runStatus === "failed" ? (
                          <AlertCircle size={13} strokeWidth={1.75} className="text-danger" />
                        ) : pinned ? (
                          <Pin size={12} strokeWidth={1.75} className="text-ink-3" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{chat.title || "新对话"}</span>
                      {hasBranches && (
                        <GitBranch size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" />
                      )}
                      {active && (
                        <Check size={13} strokeWidth={2} className="text-accent-text shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={() => {
                  setListOpen(false);
                  onOpenLibrary();
                }}
                className="hover:bg-hover text-tau-meta text-ink-2 mt-1 flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5"
              >
                <Library size={14} strokeWidth={1.75} className="text-ink-3" />
                全部会话…
                <span className="text-tau-tiny text-ink-3 ml-auto">分组与归档</span>
              </button>
            )}
          </Popover>
        )}

        <span className="min-w-0 flex-1" />

        {siblingBranches.length > 1 && (
          <Menu
            align="end"
            className="w-[220px]"
            trigger={
              <button
                type="button"
                title="切换分支"
                className="hover:bg-hover aria-expanded:bg-hover text-tau-sm text-ink-2 flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2"
              >
                <GitBranch size={13} strokeWidth={1.75} />
                <span className="tabular-nums">
                  {currentBranchIndex + 1}/{siblingBranches.length}
                </span>
                <ChevronDown size={12} strokeWidth={1.75} className="text-ink-3" />
              </button>
            }
          >
            <Menu.Group>分支</Menu.Group>
            <Menu.RadioGroup
              value={String(currentChat.id)}
              onValueChange={value => {
                const id = Number(value);
                if (id !== currentChat.id) onChatSelect(id);
              }}
            >
              {siblingBranches.map(chat => (
                <Menu.RadioItem key={chat.id} value={String(chat.id)}>
                  {!chat.parentChatId
                    ? "主干 · "
                    : chat.parentChatId === currentChat.id
                      ? "↳ "
                      : ""}
                  {chat.title}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu>
        )}

        {hasChat && (
          <Menu
            align="end"
            className="w-[168px]"
            trigger={
              <IconButton
                aria-label="更多操作"
                title="更多操作"
                className="size-7"
                disabled={disabled}
              >
                <MoreHorizontal size={16} strokeWidth={1.75} />
              </IconButton>
            }
          >
            <Menu.Item
              icon={<Pencil />}
              onSelect={() => {
                draftTitle.current = currentChat.title;
                setRenaming(true);
              }}
            >
              重命名
            </Menu.Item>
            {onChatDelete && (
              <>
                <Menu.Separator />
                <Menu.Item danger icon={<Trash2 />} onSelect={() => void askDelete()}>
                  删除对话
                </Menu.Item>
              </>
            )}
          </Menu>
        )}

        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={open => !open && setPendingDelete(null)}
          title="删除这个对话？"
          context={currentChat.title}
          description={
            pendingDelete?.branches
              ? `此对话包含 ${pendingDelete.branches} 个子分支，删除后将同时删除所有子分支。`
              : "删除后无法恢复。"
          }
          confirmText="删除"
          danger
          size="sm"
          onConfirm={async () => {
            if (!pendingDelete || !onChatDelete) return;
            try {
              await onChatDelete(pendingDelete.id);
              toast.success("对话已删除");
            } catch (error) {
              toast.error("删除对话失败");
              console.error(error);
            } finally {
              setPendingDelete(null);
            }
          }}
        />
      </div>
    );
  }
);

export default ChatDropdownSelector;
