/**
 * PDF 阅读页纸内右栏的 AI 对话：这份 PDF 专属的会话（pdf-chat 作用域，domainRef = pdfId）。
 * - 正文里「问 AI」把选区 / 标注 / 截图作为引用 chip 带进输入框，不自动发送，给出快捷问法；
 * - 回答里的 :pdfref 引用渲染成页码角标，点了跳回原文；
 * - AI 索引建好之前也能提问（只是不能按页引用），顶部给出进度。
 */

import { pdfText, pdfValue, pdfFormat, usePdfI18n } from "../i18n";
import {
  forwardRef,
  isValidElement,
  lazy,
  memo,
  Suspense,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";
import { PanelRightClose, SquarePen, X } from "lucide-react";
import type { MessageContentItem } from "@tau/shared";
import { IconButton, Loading, Spinner, Tooltip, toast } from "@tau/ui";
import type { EditTextHandle } from "@tau/ui";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import ChatDropdownSelector from "@/components/ChatDropdownSelector";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import type { Pdf, PdfIndexStatus } from "@/types";
import { buildPdfCitationMarkerLabel, type PdfCitationTarget } from "@/utils/pdfCitation";
import { applyQuote, type PdfQuote } from "../reader/annotationModel";

const ChatContainer = lazy(() => import("@/components/ChatSidebar/ChatContainer"));

export interface PdfChatPanelHandle {
  /** 把引用带进输入框（不发送） */
  attachQuote: (quote: PdfQuote) => void;
}

interface PdfChatPanelProps {
  pdf: Pdf;
  toolScope: string;
  systemPrompt: string;
  indexStatus: PdfIndexStatus | null;
  indexPreparing: boolean;
  /** 发送前确保索引至少在准备（不等它建完） */
  onEnsureIndex: () => void;
  onCitationNavigate: (target: PdfCitationTarget) => void;
  onClose: () => void;
}

const QUICK_ASKS = [
  {
    get label() {
      return pdfText("chat.explain");
    },
    prompt: "解释一下这段内容",
  },
  {
    get label() {
      return pdfText("chat.translate");
    },
    prompt: "把这段翻译成中文",
  },
  {
    get label() {
      return pdfText("chat.example");
    },
    prompt: "举个例子说明这段话",
  },
  {
    get label() {
      return pdfText("chat.related");
    },
    prompt: "在这份 PDF 里找和这段相关的其他段落",
  },
];

const STARTERS = [
  { key: "chat.starterSummary", prompt: "总结全文" },
  { key: "chat.starterContributions", prompt: "列出这份文档的核心贡献" },
  { key: "chat.starterStructure", prompt: "这份文档的结构是怎样的" },
] as const;

const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
};

function IndexBanner({ status, preparing }: { status: PdfIndexStatus | null; preparing: boolean }) {
  usePdfI18n();

  if (status?.state === "failed") {
    return (
      <div className="rounded-tau-md bg-danger-soft text-tau-sm text-danger mb-2 px-3 py-2">
        {pdfText("index.failedHint", { error: status.error || pdfText("index.unknownError") })}
      </div>
    );
  }
  if (!preparing && status?.state !== "building" && status?.state !== "pending") return null;
  const total = status?.progressTotal ?? 0;
  const current = status?.progressCurrent ?? 0;
  const percent = total ? Math.max(4, Math.min(100, (current / total) * 100)) : 35;
  return (
    <div className="border-line-1 rounded-tau-md text-tau-sm text-ink-2 mb-2 border px-3 py-2">
      <div className="flex items-center gap-2">
        <Spinner className="size-3" />
        <span className="min-w-0 flex-1 truncate">
          {status?.progressLabel || pdfText("index.preparing")}
        </span>
        {total > 0 && (
          <span className="text-ink-3 shrink-0 tabular-nums">
            {current} / {total}
          </span>
        )}
      </div>
      <div className="bg-line-1 mt-2 h-1 overflow-hidden rounded-full">
        <div
          className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-tau-meta text-ink-3 mt-1.5">{pdfText("index.askBeforeReady")}</div>
    </div>
  );
}

const PdfChatPanel = forwardRef<PdfChatPanelHandle, PdfChatPanelProps>(
  (
    {
      pdf,
      toolScope,
      systemPrompt,
      indexStatus,
      indexPreparing,
      onEnsureIndex,
      onCitationNavigate,
      onClose,
    },
    ref
  ) => {
    usePdfI18n();

    const { isDark } = useTheme();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatRef = useRef<ChatContainerHandle>(null);
    const isConnected = useDatabaseConnected();

    const bucket = useMemo(
      () => ({ scope: "pdf-chat" as const, domainRef: String(pdf.id) }),
      [pdf.id]
    );
    const { rows, loaded, currentChat, select, newChat, rename, remove } = useScopedChat(bucket, {
      draftSlot: "pdf",
      autoLoad: isConnected,
    });
    const [sendLoading, setSendLoading] = useState(false);

    const [quote, setQuote] = useState<PdfQuote | null>(null);
    const quoteRef = useRef(quote);
    quoteRef.current = quote;

    useImperativeHandle(ref, () => ({
      attachQuote: next => {
        setQuote(next);
        window.setTimeout(() => chatRef.current?.focusInput(), 60);
      },
    }));

    // 引用随这一条消息发出，发出即清掉
    const prepareUserContent = useCallback((content: MessageContentItem[]) => {
      const current = quoteRef.current;
      if (!current) return content;
      setQuote(null);
      return applyQuote(content, current);
    }, []);

    const beforeSend = useMemoizedFn(async () => {
      onEnsureIndex();
      return true;
    });

    const onTitleChange = useMemoizedFn(async (title: string) => {
      try {
        await rename(currentChat.id, title);
      } catch (error) {
        toast.error(pdfText("feedback.titleFailed"));
        console.error(error);
      }
    });

    const handleChatSelect = useMemoizedFn((chatId: string) => {
      chatRef.current?.scrollToTop();
      select(chatId);
    });

    const fillInput = (text: string) => {
      chatRef.current?.setInputValue(text);
      chatRef.current?.focusInput();
    };

    // 代码 / 链接渲染与对话页共用；pdfref 引用渲染成页码角标
    const baseMarkdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "pdf-block" });
    const markdownComponents = useMemo(
      () => ({
        ...baseMarkdownComponents,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        span: function PdfCitationSpan({ children, className, node: _node, ...props }: any) {
          usePdfI18n();
          if (className !== "pdf-citation") {
            return (
              <span className={className} {...props}>
                {children}
              </span>
            );
          }
          const label = textOf(children).trim();
          const pageNumber = Number(props["data-page"]);
          if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
            return <span className={className}>{children}</span>;
          }
          const charStart = Number(props["data-char-start"]);
          const charEnd = Number(props["data-char-end"]);
          const citation: PdfCitationTarget = {
            pageNumber,
            charStart: Number.isFinite(charStart) ? charStart : undefined,
            charEnd: Number.isFinite(charEnd) ? charEnd : undefined,
            previewText: props["data-preview-text"] || undefined,
            label: props["data-label"] || label,
          };
          return (
            <Tooltip
              placement="top"
              delay={200}
              content={
                <span className="block max-w-[260px]">
                  <span className="mb-0.5 block font-medium tabular-nums">
                    {pdfText("page.number", { page: pdfValue(pageNumber) })}
                  </span>
                  <span className="block opacity-85">
                    {citation.previewText || label || pdfText("citation.fallback")}
                  </span>
                </span>
              }
            >
              <button
                type="button"
                className="rounded-tau-sm bg-accent-soft text-accent-text ease-tau-out text-tau-tiny hover:bg-selected mx-px inline-flex translate-y-[-0.2em] cursor-pointer items-center px-1.5 py-px leading-none font-medium tabular-nums transition-colors duration-[160ms]"
                aria-label={pdfText("citation.jumpPage", { page: pdfValue(pageNumber) })}
                onMouseDown={event => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCitationNavigate(citation);
                }}
              >
                {buildPdfCitationMarkerLabel(citation)}
              </button>
            </Tooltip>
          );
        },
      }),
      [baseMarkdownComponents, onCitationNavigate]
    );

    const accessory = quote ? (
      <div className="mb-2 flex flex-col gap-1.5">
        <div className="bg-surface border-line-1 rounded-tau-md flex items-start gap-2 border px-2.5 py-2">
          {quote.imageUrl && (
            <img
              src={quote.imageUrl}
              alt={pdfText("quote.area")}
              className="border-line-1 rounded-tau-sm size-12 shrink-0 border object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-tau-meta text-ink-3 tabular-nums">
              {pdfFormat.quoteSource(quote)}
            </div>
            {quote.text && <div className="text-tau-sm text-ink-2 line-clamp-2">{quote.text}</div>}
          </div>
          <IconButton
            title={pdfText("quote.remove")}
            aria-label={pdfText("quote.remove")}
            onClick={() => setQuote(null)}
            className="-mt-0.5 -mr-1 size-6"
          >
            <X size={13} strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ASKS.map(ask => (
            <button
              key={ask.label}
              type="button"
              onClick={() => fillInput(ask.prompt)}
              className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out h-6 rounded-full border px-2.5 transition-colors duration-[160ms]"
            >
              {ask.label}
            </button>
          ))}
        </div>
      </div>
    ) : null;

    return (
      <MarkdownProvider isDark={isDark} isVisible>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-0.5 pr-2 pl-2.5">
            <div className="min-w-0 flex-1">
              {loaded && (
                <ChatDropdownSelector
                  chats={rows}
                  currentChat={currentChat}
                  onChatSelect={handleChatSelect}
                  onTitleChange={onTitleChange}
                  onChatDelete={remove}
                  titleRef={editTitleRef}
                />
              )}
            </div>
            <IconButton
              title={pdfText("chat.new")}
              aria-label={pdfText("chat.new")}
              onClick={newChat}
              className="size-7"
            >
              <SquarePen size={15} strokeWidth={1.75} />
            </IconButton>
            <IconButton
              title={pdfText("chat.hideShortcut")}
              aria-label={pdfText("chat.hide")}
              onClick={onClose}
              className="size-7"
            >
              <PanelRightClose size={15} strokeWidth={1.75} />
            </IconButton>
          </div>
          {!loaded ? (
            <Loading minHeight={0} className="flex-1" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-1">
              <div className="px-2">
                <IndexBanner status={indexStatus} preparing={indexPreparing} />
              </div>
              <Suspense fallback={<Loading minHeight={0} />}>
                <ChatContainer
                  ref={chatRef}
                  currentChat={currentChat}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible
                  chatScope={`pdf-chat:${pdf.id}`}
                  toolScope={toolScope}
                  sendLoading={sendLoading}
                  setSendLoading={setSendLoading}
                  titleRef={editTitleRef}
                  onCreateNewMessage={newChat}
                  createMessageLoading={false}
                  onChatCreated={select}
                  customSystemPrompt={systemPrompt}
                  beforeSendUserMessage={beforeSend}
                  compact
                  composerAccessory={accessory}
                  prepareUserContent={prepareUserContent}
                  emptyState={
                    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
                      <h2 className="text-tau-title text-ink-1 font-semibold">
                        {pdfText("chat.emptyTitle")}
                      </h2>
                      <p className="text-tau-meta text-ink-3 mt-1.5 max-w-[280px]">
                        {pdfText("chat.emptyHint")}
                      </p>
                      <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2">
                        {STARTERS.map(starter => (
                          <button
                            key={starter.key}
                            type="button"
                            onClick={() =>
                              void chatRef.current?.sendUserMessage([
                                { type: "text", text: starter.prompt },
                              ])
                            }
                            className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm ease-tau-out border px-3 py-2 text-left transition-colors duration-[160ms]"
                          >
                            {pdfText(starter.key)}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                />
              </Suspense>
            </div>
          )}
        </div>
      </MarkdownProvider>
    );
  }
);

PdfChatPanel.displayName = "PdfChatPanel";

export default memo(PdfChatPanel);
