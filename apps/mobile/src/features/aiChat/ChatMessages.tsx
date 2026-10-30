// 消息列表：与桌面、浏览器扩展同一套 MessageView（用户气泡、助手通栏、思考与工具行按原序）。
// 触屏没有悬停：相邻工具收成过程胶囊，操作行只常显在最后一条回答下，其余操作靠长按菜单。
// 生成中用户上滑阅读时停止跟随，出现「回到最新」。

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  BookmarkPlus,
  Copy,
  Ellipsis,
  FileText,
  RefreshCw,
  TextQuote,
  X,
} from "lucide-react";
import {
  getAssistantContentBlocks,
  Role,
  type ChatSessionMessage,
  type MentionRef,
  type ResponseMessage,
} from "@tau/shared/chat-core";
import {
  getDisplayTextFromBlocks,
  type ContentBlock,
  type ToolCallExecutionState,
} from "@tau/shared/chat-renderers";
import {
  MarkdownRenderer,
  MessageView,
  ToolApprovalBar,
  ToolCallBlock,
  ToolCallRow,
} from "@tau/chat-ui/conversation";
import { useThemeStore } from "@tau/themes/react";
import { cn } from "@tau/ui";
import { TOOL_LABELS } from "./interactions";
import { ToolSteps } from "./ToolSteps";
import { createReferenceSpan } from "./ReferencePill";
import { resolveChatReference } from "./references";
import { useAppContext } from "../../app/AppContext";
import { toast } from "../../components/toast";
import { ContentLinkPreviewSheet } from "../cards/editorExtensions/ContentLinkPreviewSheet";
import type { ContentLinkTarget } from "../cards/editorExtensions/contentLinkModel";

const FOLLOW_SLOP_PX = 80;

function userText(content: ChatSessionMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .map(part => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

function userParts(content: ChatSessionMessage["content"]) {
  if (typeof content === "string") return { mentions: [], images: [] };
  return {
    mentions: content.flatMap(part => (part.type === "text" ? (part.mentions ?? []) : [])),
    images: content.flatMap(part => (part.type === "image" ? [{ url: part.image }] : [])),
  };
}

/** 用户消息上方的引用：选中片段显示原文两行，整篇与 @ 笔记显示标题 */
export function MentionQuote(props: { mention: MentionRef; onRemove?: () => void }) {
  const { mention } = props;
  return (
    <div className="bg-surface text-tau-sm text-ink-2 flex max-w-full items-start gap-2 rounded-xl px-2.5 py-1.5">
      <span className="bg-accent mt-[3px] h-[13px] w-[2px] shrink-0 rounded-full" aria-hidden />
      <span className="min-w-0 flex-1">
        {mention.quote ? (
          <span className="line-clamp-2 leading-snug">{mention.previewText}</span>
        ) : (
          <span className="block truncate">
            <span className="text-ink-3">{MENTION_KIND[mention.entityType] ?? "笔记"} · </span>
            {mention.title || "未命名"}
          </span>
        )}
      </span>
      {props.onRemove && (
        <button
          type="button"
          aria-label="去掉引用"
          onClick={props.onRemove}
          className="text-ink-3 -mr-1 grid h-5 w-5 shrink-0 place-items-center"
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** 输入框里待发送的引用：一行可删的小签，选中片段显示原文开头，整篇显示标题 */
export function MentionChip(props: { mention: MentionRef; onRemove(): void }) {
  const { mention } = props;
  const Icon = mention.quote ? TextQuote : FileText;
  return (
    <span className="bg-page text-ink-2 text-tau-sm flex h-[34px] max-w-[240px] shrink-0 items-center gap-1.5 rounded-[12px] pr-1 pl-2.5">
      <Icon size={14} className="text-accent shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {mention.quote
          ? mention.previewText
          : `${mention.title || "未命名"} · ${MENTION_KIND[mention.entityType] ?? "笔记"}`}
      </span>
      <button
        type="button"
        aria-label="去掉引用"
        onClick={props.onRemove}
        className="text-ink-3 grid h-6 w-6 shrink-0 place-items-center rounded-full"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </span>
  );
}

const MENTION_KIND: Record<string, string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  diary: "日记",
};

/** 宿主工具的可读叫法；插件与未知工具返回 undefined，回落为工具名 */
function toolTitle(execution: ToolCallExecutionState) {
  const label = TOOL_LABELS[execution.toolName];
  return label ? <span className="text-tau-meta">{label}</span> : undefined;
}

const ToolLine = memo(function ToolLine({ execution }: { execution: ToolCallExecutionState }) {
  return <ToolCallRow execution={execution} title={toolTitle(execution)} />;
});

const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 10;

/** 长按：按住不动达到时长触发；移动（滚动）或松手取消。系统长按菜单一并拦掉 */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => clear, []);
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      // 链接、按钮、展开行等可点元素保持原有点按
      if ((event.target as HTMLElement).closest("a, button, input, textarea, pre")) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        clear();
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = origin.current;
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX
      )
        clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
  };
}

export type ChatMessageAction = "copy" | "select" | "card" | "regenerate" | "delete";

const ChatMessage = memo(function ChatMessage(props: {
  message: ChatSessionMessage;
  index: number;
  streaming: boolean;
  isDark: boolean;
  /** 最后一条回答：常显操作行（其余消息靠长按） */
  showActions: boolean;
  onAction?(action: ChatMessageAction, index: number, text: string): void;
  onMenu?(index: number, text: string): void;
  onReference?(id: number, type: string, text: string): void;
}) {
  const { message, index, streaming, isDark, onAction } = props;
  const isUser = message.role === Role.User;
  const blocks = useMemo(
    () => (isUser ? [] : (getAssistantContentBlocks(message as ResponseMessage) as ContentBlock[])),
    [isUser, message]
  );
  const plainText = isUser ? userText(message.content) : getDisplayTextFromBlocks(blocks);
  const renderStandalone = useCallback(
    (execution: ToolCallExecutionState) => (
      <ToolCallBlock
        execution={execution}
        isDark={isDark}
        renderApproval={item => <ToolApprovalBar execution={item} />}
        renderDefaultItem={({ execution: item }) => <ToolLine execution={item} />}
        toolTitle={toolTitle}
      />
    ),
    [isDark]
  );
  const press = useLongPress(() => props.onMenu?.(index, plainText));
  const { onReference } = props;
  const markdownComponents = useMemo(
    () => (onReference ? { span: createReferenceSpan(onReference) } : undefined),
    [onReference]
  );
  const parts = isUser ? userParts(message.content) : null;
  return (
    <div
      className={cn(isUser ? "mt-6 first:mt-3" : "mt-3.5")}
      {...(props.onMenu && plainText.trim() ? press : {})}
    >
      {parts?.mentions.length ? (
        <div className="mb-1.5 ml-auto flex max-w-[85%] flex-col items-end gap-1">
          {parts.mentions.map((mention, mentionIndex) => (
            <MentionQuote key={mentionIndex} mention={mention} />
          ))}
        </div>
      ) : null}
      <MessageView
        role={isUser ? "user" : "assistant"}
        messageIndex={index}
        userText={isUser ? userText(message.content) : undefined}
        images={parts?.images}
        assistantBlocks={blocks}
        hideActions
        userBubbleClassName="bg-[color-mix(in_srgb,var(--tau-accent)_16%,var(--tau-bg-surface))] text-tau-body-lg rounded-[18px_18px_5px_18px] px-[13px] py-2 max-w-[80%]"
        renderMarkdown={({ content }) => (
          <MarkdownRenderer
            content={content}
            isDark={isDark}
            enableDocumentReference
            components={markdownComponents}
            className={isUser ? undefined : ANSWER_TYPOGRAPHY}
          />
        )}
        renderImage={(image, imageIndex, className) => (
          <img key={imageIndex} src={image.url} alt={image.alt ?? ""} className={className} />
        )}
        renderToolCall={renderStandalone}
        renderToolGroup={executions => (
          <ToolSteps
            executions={executions}
            renderStandalone={renderStandalone}
            toolTitle={toolTitle}
          />
        )}
      />
      {streaming && !isUser && blocks.length === 0 && (
        <span className="bg-accent inline-block h-2 w-2 animate-pulse rounded-full" />
      )}
      {props.showActions && onAction && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAction("card", index, plainText)}
            className={cn(ANSWER_PILL, "bg-accent-soft text-accent-text gap-1.5 pr-3.5 pl-3")}
          >
            <BookmarkPlus size={15} aria-hidden="true" />
            存为卡片
          </button>
          <button
            type="button"
            onClick={() => onAction("copy", index, plainText)}
            className={cn(ANSWER_PILL, "gap-1.5 pr-3.5 pl-3")}
          >
            <Copy size={15} aria-hidden="true" />
            复制
          </button>
          <button
            type="button"
            aria-label="重新生成"
            onClick={() => onAction("regenerate", index, plainText)}
            className={cn(ANSWER_PILL, "w-[34px]")}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          {props.onMenu && (
            <button
              type="button"
              aria-label="更多操作"
              onClick={() => props.onMenu?.(index, plainText)}
              className={cn(ANSWER_PILL, "w-[34px]")}
            >
              <Ellipsis size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/** 回答正文排版：手机上读长回答，字号行距比桌面稍大、段距拉开 */
const ANSWER_TYPOGRAPHY =
  "text-[15.5px] leading-[1.75] [&_h1]:text-[17px] [&_h2]:text-[16px] [&_h3]:text-[15.5px] [&_h4]:text-[15.5px] [&_li]:my-1 [&_p]:my-2.5";

/** 回答下方的文字胶囊：手指好点，意思一眼能懂 */
const ANSWER_PILL =
  "bg-surface text-ink-2 text-tau-sm flex h-[34px] shrink-0 items-center justify-center rounded-full font-medium transition-transform active:scale-95";

export function ChatMessages(props: {
  messages: ChatSessionMessage[];
  running: boolean;
  /** 列表为空时的内容（建议问题） */
  empty?: ReactNode;
  /** 回答下方操作与长按菜单；不传则只读 */
  onAction?(action: ChatMessageAction, index: number, text: string): void;
  onMenu?(index: number, text: string): void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [detached, setDetached] = useState(false);
  const isDark = useThemeStore(state => state.mode === "dark");
  const databaseName = useAppContext().syncSettings.safeSetting?.database?.active ?? "";
  const [preview, setPreview] = useState<ContentLinkTarget | null>(null);
  const openReference = useCallback(
    (id: number, type: string, text: string) => {
      resolveChatReference(databaseName, id, type, text)
        .then(target => (target ? setPreview(target) : toast.info("引用的内容不存在或已被删除")))
        .catch(() => toast.error("引用读取失败"));
    },
    [databaseName]
  );

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && followRef.current) node.scrollTop = node.scrollHeight;
  }, [props.messages]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_SLOP_PX;
    followRef.current = atBottom;
    setDetached(!atBottom);
  };
  const toLatest = () => {
    const node = scrollRef.current;
    if (!node) return;
    followRef.current = true;
    setDetached(false);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-allow-touchmove="true"
        className="h-full overflow-y-auto overscroll-contain px-[18px] pb-2"
      >
        {props.messages.length === 0
          ? props.empty
          : props.messages.map((message, index) => (
              <ChatMessage
                key={(message as { clientId?: string }).clientId ?? index}
                message={message}
                index={index}
                isDark={isDark}
                streaming={props.running && index === props.messages.length - 1}
                showActions={
                  !props.running &&
                  index === props.messages.length - 1 &&
                  message.role !== Role.User
                }
                onAction={props.onAction}
                onMenu={props.onMenu}
                onReference={openReference}
              />
            ))}
      </div>
      {detached && props.messages.length > 0 && (
        <button
          type="button"
          onClick={toLatest}
          className="bg-surface text-ink-2 shadow-float text-tau-sm absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1 rounded-full px-3 font-semibold"
        >
          <ArrowDown size={13} aria-hidden="true" />
          {props.running ? "回到最新" : "回到底部"}
        </button>
      )}
      <ContentLinkPreviewSheet
        open={preview !== null}
        target={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
