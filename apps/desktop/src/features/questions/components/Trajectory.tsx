/**
 * 探究轨迹：一条连续的时间线，每步「做了什么」在上、「何时 · 第几天」在下。
 * 自动事件（提出 / 状态 / 关联 / 移除）视觉轻，手动「记一笔」视觉重（accent 圆点 + 正文字号）；
 * 推算出的旧数据只有日期，标「约」。
 * 关联对话的事件显示对话的实时标题（事件里存的是关联那一刻的标题，常常还是「新对话」），
 * 对话还能打开时点它在右侧停靠栏打开。
 * 末尾输入框回车写入一条记录。
 */

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { cn, toast } from "@tau/ui";
import type { QuestionChat, QuestionEvent } from "@/types";
import { useChatTitle } from "@/features/chat/openInDock";
import { TARGET_META, clock, daySpan, describeEvent, relativeDay, type EventView } from "../model";

const DOT: Record<EventView["tone"], string> = {
  start: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-accent)]",
  made: "bg-ink-3",
  plain: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]",
  muted: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]",
  done: "bg-ok",
  note: "bg-accent size-[9px] -left-px top-[5.5px] shadow-[0_0_0_3px_var(--tau-bg-surface)]",
};

export function Trajectory({
  events,
  chats,
  now,
  onOpenChat,
  onAddNote,
}: {
  events: QuestionEvent[];
  /** 这个问题的探究对话：事件里的对话据此判断能不能打开 */
  chats: QuestionChat[];
  now: number;
  onOpenChat(chat: QuestionChat): void;
  onAddNote(text: string): Promise<void>;
}) {
  const titleOf = useChatTitle();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onAddNote(value);
      setText("");
    } catch {
      toast.error("记录失败");
    } finally {
      setBusy(false);
    }
  };

  const origin = events[0]?.createTime;

  return (
    <>
      <ol className="flex flex-col">
        {events.map(event => {
          const view = describeEvent(event);
          const sessionId =
            view.targetType === "chat-session"
              ? (event.payload as { sessionId?: string }).sessionId
              : undefined;
          const chat = sessionId ? chats.find(item => item.sessionId === sessionId) : undefined;
          const title = (sessionId && titleOf(sessionId)) || view.title;
          const openChat =
            chat && chat.openable && !chat.missing && view.tone !== "muted"
              ? () => onOpenChat(chat)
              : undefined;
          return (
            <li
              key={event.id}
              className="relative pb-4 pl-5 before:absolute before:-bottom-2.5 before:left-[3px] before:top-2.5 before:w-[1.5px] before:bg-[var(--tau-bg-track)] last:pb-0 last:before:hidden"
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-[6.5px] z-[1] size-[7px] rounded-full",
                  DOT[view.tone]
                )}
              />
              {view.tone === "note" ? (
                <div className="text-ink-1 whitespace-pre-wrap text-[13px] leading-[20px]">
                  {view.text}
                </div>
              ) : (
                <div
                  className={cn(
                    "text-[12.5px] leading-[20px]",
                    view.tone === "muted" ? "text-ink-3" : "text-ink-2",
                    view.tone === "done" && "text-ok font-semibold"
                  )}
                >
                  {view.verb}
                </div>
              )}
              {view.tone !== "note" && title && (
                <EventRef
                  type={view.targetType}
                  title={title}
                  muted={view.tone === "muted"}
                  onClick={openChat}
                />
              )}
              <div className="text-ink-3 mt-1 text-[11px] tabular-nums">
                {when(event.createTime, view.estimated, now)}
                {origin != null && event.createTime > origin && (
                  <> · 第 {daySpan(origin, event.createTime)} 天</>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <label className="border-line-1 text-ink-3 focus-within:border-accent mt-2.5 flex h-[34px] cursor-text items-center gap-2 rounded-[10px] border border-dashed px-2.5 focus-within:border-solid focus-within:shadow-[var(--tau-focus-ring)]">
        <NotebookPen className="size-[14px] shrink-0" strokeWidth={1.75} />
        <input
          value={text}
          disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="记一笔：读到了什么、卡在哪、换了什么思路…"
          aria-label="记一笔"
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
        />
      </label>
    </>
  );
}

/** 「今天 12:15」「7月18日 12:15」；推算时间只到日期：「约 7月18日」 */
function when(ts: number, estimated: boolean, now: number): string {
  const day = relativeDay(ts, now);
  return estimated ? `约 ${day}` : `${day} ${clock(ts)}`;
}

function EventRef({
  type,
  title,
  muted,
  onClick,
}: {
  type?: keyof typeof TARGET_META;
  title: string;
  muted: boolean;
  /** 能打开时给（目前只有对话） */
  onClick?: () => void;
}) {
  const Icon = type ? TARGET_META[type].icon : null;
  const className = cn(
    "text-ink-2 text-tau-meta mt-1 inline-flex max-w-full items-center gap-1",
    muted ? "text-ink-3 line-through" : undefined
  );
  const body = (
    <>
      {Icon && <Icon className="text-ink-3 size-3 shrink-0" strokeWidth={1.75} />}
      <span className="truncate">{title}</span>
    </>
  );
  if (!onClick) return <span className={className}>{body}</span>;
  return (
    <button
      type="button"
      title="在侧栏打开对话"
      onClick={onClick}
      className={cn(
        className,
        "hover:text-accent-text rounded-[4px] text-left outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
    >
      {body}
    </button>
  );
}
