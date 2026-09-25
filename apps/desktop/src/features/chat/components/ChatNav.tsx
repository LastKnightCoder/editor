/**
 * 侧栏「AI 对话」入口的子项（D-047 页面方案 1「侧栏嵌套」）：对话页在栈顶时于入口下方
 * 展开置顶与最近会话，末行「全部会话」打开全量管理弹窗。全局只有一条侧栏，页内不再放会话列。
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import { Library, Pin } from "lucide-react";
import { cn } from "@tau/ui";
import useChatMessageStore from "@/stores/useChatMessageStore";
import type { ChatMessage } from "@/types";
import { navSessions, parseChatId } from "../model";
import { useChatLibraryStore } from "../libraryStore";

export function ChatNavSessions({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (chatId: string) => void;
}) {
  const chats = useChatMessageStore(s => s.chats);
  const openLibrary = useChatLibraryStore(s => s.setOpen);
  const currentId = parseChatId(selectedId);
  // 流式回答期间 chats 每个 chunk 都更新，派生列表记忆化避免侧栏全量重算
  const { pinned, recent, total } = useMemo(
    () => navSessions(chats, currentId),
    [chats, currentId]
  );

  const item = (chat: ChatMessage, isPinned: boolean) => (
    <SubItem
      key={chat.id}
      active={chat.id === currentId}
      title={chat.title || "新对话"}
      icon={isPinned ? <Pin size={12} strokeWidth={1.75} className="text-ink-3 shrink-0" /> : null}
      onClick={() => onSelect(String(chat.id))}
    />
  );

  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="AI 会话">
      {pinned.map(chat => item(chat, true))}
      {recent.map(chat => item(chat, false))}
      <SubItem
        title="全部会话"
        muted
        icon={<Library size={13} strokeWidth={1.75} className="shrink-0" />}
        trailing={<span className="text-tau-tiny tabular-nums">{total}</span>}
        onClick={() => openLibrary(true)}
      />
    </div>
  );
}

/** 侧栏是否有子项可展开：有会话即展开（含「全部会话」入口） */
export function useChatNavHasContent() {
  return useChatMessageStore(s => s.chats.length > 0);
}

function SubItem({
  title,
  icon,
  trailing,
  active = false,
  muted = false,
  onClick,
}: {
  title: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算），与协作 / 日记子项同一缩进口径
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : muted
              ? "text-ink-3 hover:bg-hover hover:text-ink-1"
              : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {trailing}
      </button>
    </div>
  );
}
