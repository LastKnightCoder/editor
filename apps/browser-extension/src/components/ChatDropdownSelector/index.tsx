import { memo, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { ConfirmDialog, IconButton, Menu, Popover, cn, toast } from "@tau/ui";
import { EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { ChatSession } from "../../types/chat-session";

interface ChatDropdownSelectorProps {
  chats: ChatSession[];
  currentChat: ChatSession;
  onChatSelect: (chatId: string) => void;
  onTitleChange: (title: string) => void;
  onChatDelete?: (chatId: string) => void;
  disabled?: boolean;
  titleRef?: React.RefObject<EditTextHandle>;
}

/**
 * 对话标题行（与桌面对话标题行同构）：标题 ▾ = 会话切换 Popover（搜索 + 按更新时间排序的列表；
 * 新建对话走输入框 ＋）；⋯ = 重命名 / 删除。分支在用户消息的 ‹ i/n › 切换，不在这里。
 */
const ChatDropdownSelector = memo(
  ({
    chats,
    currentChat,
    onChatSelect,
    onTitleChange,
    onChatDelete,
    disabled,
    titleRef,
  }: ChatDropdownSelectorProps) => {
    const [listOpen, setListOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [renaming, setRenaming] = useState(false);
    const draftTitle = useRef("");
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const hasChat = !currentChat.draft;

    const rows = useMemo(() => {
      const q = query.trim().toLowerCase();
      return [...chats]
        .sort((a, b) => b.updateTime - a.updateTime)
        .filter(chat => !q || (chat.title || "").toLowerCase().includes(q));
    }, [chats, query]);

    const select = (chatId: string) => {
      setListOpen(false);
      setQuery("");
      if (chatId !== currentChat.id) onChatSelect(chatId);
    };

    const title = hasChat ? currentChat.title || "新对话" : "新对话";

    return (
      <div className="flex w-full min-w-0 items-center gap-0.5">
        {renaming && hasChat ? (
          <div className="text-tau-body text-ink-1 min-w-0 flex-1 px-1.5 font-semibold">
            <EditText
              key={currentChat.id}
              ref={titleRef}
              defaultValue={currentChat.title}
              // 逐字变化只记草稿，失焦才落库
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
            className="w-[290px] p-1.5"
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
            <div className="tau-scrollbar max-h-[320px] overflow-y-auto">
              {rows.length === 0 ? (
                <p className="text-tau-sm text-ink-3 px-2.5 py-3">没有匹配的对话</p>
              ) : (
                rows.map(chat => {
                  const active = chat.id === currentChat.id;
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
                      <span className="min-w-0 flex-1 truncate">{chat.title || "新对话"}</span>
                      {active && (
                        <Check size={13} strokeWidth={2} className="text-accent-text shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </Popover>
        )}

        <span className="min-w-0 flex-1" />

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
                <Menu.Item
                  danger
                  icon={<Trash2 />}
                  onSelect={() => setPendingDelete(currentChat.id)}
                >
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
          description="对话里的所有版本会一起删除，删除后无法恢复。"
          confirmText="删除"
          danger
          size="sm"
          onConfirm={async () => {
            if (!pendingDelete || !onChatDelete) return;
            try {
              await onChatDelete(pendingDelete);
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

ChatDropdownSelector.displayName = "ChatDropdownSelector";

export default ChatDropdownSelector;
