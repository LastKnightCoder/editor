/**
 * PDF 阅读页纸内右栏的 AI 对话：这份 PDF 专属的会话（pdf-chat 作用域，domainRef = pdfId）。
 * - 正文里「问 AI」把选区 / 标注 / 截图作为引用 chip 带进输入框，不自动发送，给出快捷问法；
 * - 回答里的 :pdfref 引用渲染成页码角标，点了跳回原文；
 * - AI 索引建好之前也能提问（只是不能按页引用），顶部给出进度。
 */

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
import type { EditTextHandle } from "@/components/EditText";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import ChatDropdownSelector from "@/components/ChatDropdownSelector";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import type { Pdf, PdfIndexStatus } from "@/types";
import { buildPdfCitationMarkerLabel, type PdfCitationTarget } from "@/utils/pdfCitation";
import { applyQuote, quoteSource, type PdfQuote } from "../reader/annotationModel";
import { usePdfChatTools } from "./usePdfChatTools";

const ChatContainer = lazy(() => import("@/components/ChatSidebar/ChatContainer"));

export interface PdfChatPanelHandle {
  /** 把引用带进输入框（不发送） */
  attachQuote: (quote: PdfQuote) => void;
}

interface PdfChatPanelProps {
  pdf: Pdf;
  mainDbName: string;
  indexStatus: PdfIndexStatus | null;
  indexPreparing: boolean;
  /** 发送前确保索引至少在准备（不等它建完） */
  onEnsureIndex: () => void;
  onCitationNavigate: (target: PdfCitationTarget) => void;
  onClose: () => void;
}

const QUICK_ASKS = [
  { label: "解释", prompt: "解释一下这段内容" },
  { label: "翻译", prompt: "把这段翻译成中文" },
  { label: "举个例子", prompt: "举个例子说明这段话" },
  { label: "找相关段落", prompt: "在这份 PDF 里找和这段相关的其他段落" },
];

const STARTERS = ["总结全文", "列出这份文档的核心贡献", "这份文档的结构是怎样的"];

const buildPdfSystemPrompt = (pdf: Pdf): string =>
  `你是 PDF 阅读助手，只能基于当前 PDF 回答问题。

## 可用工具
- search_pdf_knowledge：搜索当前 PDF 的相关片段，返回页码、chunk 和字符范围
- get_pdf_document_info：读取当前 PDF 的总页数和索引状态
- get_pdf_outline：读取当前 PDF 的目录
- read_pdf_page_range：读取指定页范围全文
- get_pdf_annotations：读取当前 PDF 的标注、区域截图与笔记
- get_pdf_bookmarks：读取当前 PDF 的书签

## 工作流要求
1. 先理解问题
2. 如果是结构性问题（例如“整体结构是什么”“有哪些章节”），优先调用 get_pdf_outline 或 get_pdf_document_info
3. 如果是内容问题，优先调用 search_pdf_knowledge 获取证据片段和字符范围
4. 根据搜索结果的页码或字符范围，再用 read_pdf_page_range 读取完整上下文
5. 如果需要按目录浏览，再调用 get_pdf_outline
6. 需要用户上下文时，再调用 get_pdf_annotations / get_pdf_bookmarks
7. 证据不足时明确说明，不要猜测
8. 用户消息开头以 \`>\` 引用的是用户在 PDF 里选中的原文（附页码），问题针对这段原文

## 回答要求
- 回答尽量给出对应页码
- 只使用当前 PDF 的信息，不混入其它知识库
- 如果当前 PDF 尚未完成索引，应说明限制并尽量基于已读页面作答
- 回答整体问题时，先用目录或搜索结果定位，再读取相关页范围后归纳，不要凭摘要臆测
- 当你引用证据时，只能使用这种行内 PDF 引用语法，不要使用 Markdown 链接，不要使用 blockquote（\`>\`）：
  \`:pdfref[第12页｜这里放 40-80 字的证据摘要]{page=12 charStart=120 charEnd=180}\`
- PDF 引用必须作为行内脚注附着在相关句子末尾，不要单独成段
- \`page\` 必填，\`charStart/charEnd\` 选填；优先直接复用工具返回的 \`citation\` 字段，不要自己编造页码
- \`label\`（即 \`:pdfref[这里]\` 里的内容）禁止出现半角 \`[\` \`]\` \`{\` \`}\`；如果证据原文包含这些字符，必须改写或替换为全角符号（如 \`（\` \`）\`），否则语法会失效
- 如果工具已经返回了 \`citation\` 字段，优先直接原样输出该字段，不要手写或重组 PDF 引用语法
- 证据摘要尽量简短稳定，避免包含复杂公式、数组下标、代码片段或任何可能引入 \`[]{}\` 的原文片段

## 当前文档
- 文件名：${pdf.fileName}`;

const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
};

function IndexBanner({ status, preparing }: { status: PdfIndexStatus | null; preparing: boolean }) {
  if (status?.state === "failed") {
    return (
      <div className="rounded-tau-md bg-danger-soft text-tau-sm text-danger mb-2 px-3 py-2">
        AI 索引建立失败：{status.error || "未知错误"}。可以在「更多 → 重建 AI 索引」里重试
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
          {status?.progressLabel || "正在建立 AI 索引"}
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
      <div className="text-tau-meta text-ink-3 mt-1.5">完成前也能提问，只是不能按页引用</div>
    </div>
  );
}

const PdfChatPanel = forwardRef<PdfChatPanelHandle, PdfChatPanelProps>(
  (
    { pdf, mainDbName, indexStatus, indexPreparing, onEnsureIndex, onCitationNavigate, onClose },
    ref
  ) => {
    const { isDark } = useTheme();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatRef = useRef<ChatContainerHandle>(null);
    const isConnected = useDatabaseConnected();
    const toolScope = usePdfChatTools(pdf.id, mainDbName);
    const systemPrompt = useMemo(() => buildPdfSystemPrompt(pdf), [pdf]);

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
      if (!indexStatus || indexStatus.state === "failed") onEnsureIndex();
      return true;
    });

    const onTitleChange = useMemoizedFn(async (title: string) => {
      try {
        await rename(currentChat.id, title);
      } catch (error) {
        toast.error("更新标题失败");
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

    // 代码 / 链接渲染与对话页共用（D-048）；pdfref 引用渲染成页码角标
    const baseMarkdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "pdf-block" });
    const markdownComponents = useMemo(
      () => ({
        ...baseMarkdownComponents,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        span: ({ children, className, node: _node, ...props }: any) => {
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
                  <span className="mb-0.5 block font-medium tabular-nums">第 {pageNumber} 页</span>
                  <span className="block opacity-85">
                    {citation.previewText || label || "引用位置"}
                  </span>
                </span>
              }
            >
              <button
                type="button"
                className="rounded-tau-sm bg-accent-soft text-accent-text ease-tau-out text-tau-tiny hover:bg-selected mx-px inline-flex translate-y-[-0.2em] cursor-pointer items-center px-1.5 py-px font-medium tabular-nums leading-none transition-colors duration-[160ms]"
                aria-label={`跳转到第 ${pageNumber} 页引用`}
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
              alt="区域截图"
              className="border-line-1 rounded-tau-sm size-12 shrink-0 border object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-tau-meta text-ink-3 tabular-nums">{quoteSource(quote)}</div>
            {quote.text && <div className="text-tau-sm text-ink-2 line-clamp-2">{quote.text}</div>}
          </div>
          <IconButton
            title="移除引用"
            aria-label="移除引用"
            onClick={() => setQuote(null)}
            className="-mr-1 -mt-0.5 size-6"
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
          <div className="flex h-[46px] shrink-0 items-center gap-1 pl-3 pr-2">
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
            <IconButton title="新对话" aria-label="新对话" onClick={newChat} className="size-7">
              <SquarePen size={15} strokeWidth={1.75} />
            </IconButton>
            <IconButton
              title="收起对话 (Ctrl/⌘ J)"
              aria-label="收起对话"
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
                      <h2 className="text-tau-title text-ink-1 font-semibold">问问这份 PDF</h2>
                      <p className="text-tau-meta text-ink-3 mt-1.5 max-w-[280px]">
                        回答会标出处页码，点页码直接跳到原文。也可以在正文里选中文字后点「问 AI」。
                      </p>
                      <div className="mt-4 flex w-full max-w-[280px] flex-col gap-2">
                        {STARTERS.map(prompt => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() =>
                              void chatRef.current?.sendUserMessage([
                                { type: "text", text: prompt },
                              ])
                            }
                            className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm ease-tau-out border px-3 py-2 text-left transition-colors duration-[160ms]"
                          >
                            {prompt}
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
