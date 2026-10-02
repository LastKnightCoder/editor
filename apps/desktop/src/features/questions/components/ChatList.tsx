/**
 * 探究对话行：对话图标 + 标题 + 场景 / 消息数 / 最近更新；从这个问题发起的标「由此发起」。
 * 点行打开对话（只有主对话可打开），悬停时右上角叠加「打开 / 解除关联」；对话已删除的灰显，只能解除。
 */

import { ExternalLink, MessageCircle, Unlink } from "lucide-react";
import { IconButton, cn } from "@tau/ui";
import type { QuestionChat } from "@/types";
import { relativeDay } from "../model";

export function ChatList({
  chats,
  now,
  onOpen,
  onUnlink,
}: {
  chats: QuestionChat[];
  now: number;
  onOpen(chat: QuestionChat): void;
  onUnlink(chat: QuestionChat): void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {chats.map(chat => (
        <ChatRow
          key={chat.id}
          chat={chat}
          now={now}
          onOpen={() => onOpen(chat)}
          onUnlink={() => onUnlink(chat)}
        />
      ))}
    </div>
  );
}

function ChatRow({
  chat,
  now,
  onOpen,
  onUnlink,
}: {
  chat: QuestionChat;
  now: number;
  onOpen(): void;
  onUnlink(): void;
}) {
  const openable = chat.openable && !chat.missing;
  const info = [
    chat.initiated ? "由此发起" : "",
    chat.scopeLabel,
    chat.messageCount ? `${chat.messageCount} 条消息` : "",
    relativeDay(chat.updateTime, now),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={!openable}
      onClick={openable ? onOpen : undefined}
      onKeyDown={e => {
        if (e.key === "Enter" && openable) onOpen();
      }}
      className={cn(
        "bg-surface border-line-1 group/chat relative flex gap-[11px] rounded-[12px] border px-3 py-[11px] outline-none",
        "ease-tau-out transition-[border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        chat.missing ? "opacity-60" : openable && "hover:border-ink-3 cursor-pointer"
      )}
    >
      <span className="text-ink-2 grid size-[26px] shrink-0 place-items-center rounded-[8px] shadow-[inset_0_0_0_1px_var(--tau-line-1)]">
        <MessageCircle className="size-[14px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-normal">
          {chat.missing ? "对话已删除" : chat.title}
        </div>
        <div className="text-ink-3 mt-1 text-[11.5px]">
          {chat.missing ? "原对话已不存在，可解除关联" : info}
        </div>
      </div>
      <div className="bg-surface absolute right-2 top-2 flex gap-0.5 rounded-[8px] opacity-0 transition-opacity duration-150 group-focus-within/chat:opacity-100 group-hover/chat:opacity-100">
        {openable && (
          <IconButton
            title="打开对话"
            onClick={e => {
              e.stopPropagation();
              onOpen();
            }}
            className="size-[22px] rounded-[6px]"
          >
            <ExternalLink className="size-[13px]" strokeWidth={1.75} />
          </IconButton>
        )}
        <IconButton
          title="解除关联"
          onClick={e => {
            e.stopPropagation();
            onUnlink();
          }}
          className="size-[22px] rounded-[6px]"
        >
          <Unlink className="size-[13px]" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}
