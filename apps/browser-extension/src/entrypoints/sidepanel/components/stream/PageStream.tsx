import { useMemo, useRef, type ReactNode } from "react";
import { ChevronRight, Highlighter, MessageCircle, NotebookPen, Plus } from "lucide-react";
import {
  COMPOSER_ANCHOR_ATTR,
  ChatInputArea,
  type ChatInputAreaHandle,
  type MessageContentItem,
} from "@tau/shared";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import { usePageHighlights, formatRelativeTime } from "../../../../hooks/usePageHighlights";
import { useNoteList } from "../../../../hooks/useNoteList";
import { useChatList } from "../../../../hooks/useChatList";
import { useChatInputServices } from "../../../../hooks/useChatInputServices";
import { HighlightCard } from "../HighlightCard";
import type { NoteIntent } from "../pages/NotePage";
import SummaryCard from "./SummaryCard";

/** 本页流里只露最近几条高亮，其余进「全部」 */
const HIGHLIGHT_PREVIEW_COUNT = 3;

interface PageStreamProps {
  wsClient: WebSocketClient | null;
  aiClient: WebSocketClient | null;
  url: string | null;
  /** 从二级页返回时递增，重读对话列表 */
  refreshKey: number;
  onOpenChat: (pending?: MessageContentItem[]) => void;
  onOpenNote: (intent: NoteIntent) => void;
  onOpenHighlights: () => void;
}

/**
 * 本页（阅读伴侣）：一页一张纸，从上到下是 AI 总结 → 高亮 → 笔记 → 上次对话，
 * 底部常驻「问这一页」——发送后进入对话页并把这条消息发出去。
 */
export default function PageStream({
  wsClient,
  aiClient,
  url,
  refreshKey,
  onOpenChat,
  onOpenNote,
  onOpenHighlights,
}: PageStreamProps) {
  const { highlights, annotations } = usePageHighlights(url);
  const { notes } = useNoteList(url);
  const chats = useChatList(url, refreshKey);
  const services = useChatInputServices(aiClient);
  const inputRef = useRef<ChatInputAreaHandle>(null);

  const recentHighlights = useMemo(
    () =>
      [...highlights].sort((a, b) => b.createdAt - a.createdAt).slice(0, HIGHLIGHT_PREVIEW_COUNT),
    [highlights]
  );
  const lastChat = chats[0];

  const send = () => {
    const content = inputRef.current?.getValue() ?? [];
    if (content.length === 0) return;
    inputRef.current?.clear();
    onOpenChat(content);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="tau-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3 pt-0.5">
        <SummaryCard key={url} wsClient={wsClient} url={url} />

        <SectionHeader
          icon={<Highlighter />}
          title={highlights.length ? `高亮 ${highlights.length}` : "高亮"}
          action={highlights.length > 0 ? { label: "全部", onClick: onOpenHighlights } : undefined}
        />
        {recentHighlights.length > 0 ? (
          <div className="border-line-1 bg-surface rounded-tau-md divide-line-2 divide-y overflow-hidden border">
            {recentHighlights.map(highlight => (
              <HighlightCard
                key={highlight.id}
                compact
                highlight={highlight}
                annotation={annotations[highlight.id]}
              />
            ))}
          </div>
        ) : (
          <p className="text-tau-sm text-ink-3 px-1 pb-1">选中网页上的文字，用浮出的工具条高亮</p>
        )}

        <SectionHeader icon={<NotebookPen />} title="笔记" />
        {notes.map(note => (
          <button
            key={note.id}
            type="button"
            onClick={() => onOpenNote({ type: "open", noteId: note.id })}
            className="border-line-1 bg-surface hover:bg-surface-hover rounded-tau-md border px-3.5 py-2.5 text-left transition-colors"
          >
            <div className="text-tau-body-lg text-ink-1 truncate font-semibold">{note.title}</div>
            {note.preview && (
              <p className="text-tau-meta text-ink-2 mt-0.5 line-clamp-2 leading-[1.6]">
                {note.preview}
              </p>
            )}
            <div className="text-tau-tiny text-ink-3 mt-1.5">
              {formatRelativeTime(note.contentUpdatedAt ?? note.updatedAt)}
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => onOpenNote({ type: "new" })}
          className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-md flex h-9 items-center justify-center gap-1.5 border border-dashed transition-colors"
        >
          <Plus size={14} strokeWidth={1.75} />
          新建笔记
        </button>

        {lastChat && (
          <>
            <SectionHeader
              icon={<MessageCircle />}
              title="上次对话"
              meta={formatRelativeTime(lastChat.updateTime)}
            />
            <button
              type="button"
              onClick={() => onOpenChat()}
              className="border-line-1 bg-surface hover:bg-surface-hover text-tau-meta text-ink-1 rounded-tau-md flex items-center gap-2 border px-3.5 py-2.5 text-left transition-colors"
            >
              <span className="min-w-0 flex-1 truncate">{lastChat.title || "新对话"}</span>
              {chats.length > 1 && (
                <span className="text-ink-3 shrink-0">共 {chats.length} 个</span>
              )}
              <ChevronRight size={14} strokeWidth={1.75} className="text-ink-3 shrink-0" />
            </button>
          </>
        )}
      </div>

      <div
        {...{ [COMPOSER_ANCHOR_ATTR]: "" }}
        className="border-line-1 bg-surface ease-tau-out focus-within:border-accent relative mx-2.5 mb-2.5 mt-1 flex-none rounded-[16px] border pb-2.5 pl-3.5 pr-2.5 pt-3 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]"
      >
        <ChatInputArea
          ref={inputRef}
          services={services}
          placeholder="问这一页，Ctrl/Command + Enter 发送"
          onPressEnter={send}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  meta,
  action,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-tau-sm text-ink-2 [&>svg]:text-ink-3 flex h-8 items-center gap-1.5 px-1 pt-1.5 font-semibold [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="flex-1">{title}</span>
      {meta && <span className="text-ink-3 font-normal">{meta}</span>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-0.5 font-normal"
        >
          {action.label}
          <ChevronRight size={13} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
