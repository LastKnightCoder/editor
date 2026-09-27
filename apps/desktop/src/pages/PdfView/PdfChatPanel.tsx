import {
  forwardRef,
  lazy,
  memo,
  isValidElement,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { Loading, Spinner, Tooltip, toast } from "@tau/ui";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import type { Pdf, PdfIndexStatus } from "@/types";
import { ensurePdfIndex, getPdfIndexStatus } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import usePdfChat from "./usePdfChat";
import { buildPdfCitationMarkerLabel, type PdfCitationTarget } from "@/utils/pdfCitation";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

const extractTextFromReactNode = (node: React.ReactNode): string => {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromReactNode).join("");
  }
  if (isValidElement(node)) {
    const element = node as React.ReactElement<{
      children?: React.ReactNode;
    }>;
    return extractTextFromReactNode(element.props.children);
  }
  return "";
};

export interface PdfChatAskPayload {
  text: string;
  imageUrl?: string;
}

export interface PdfChatPanelHandle {
  askQuestion: (payload: PdfChatAskPayload) => Promise<boolean>;
}

interface PdfChatPanelProps {
  pdf: Pdf;
  mainDbName: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCitationNavigate?: (target: PdfCitationTarget) => void;
}

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

const PdfChatPanel = forwardRef<PdfChatPanelHandle, PdfChatPanelProps>(
  ({ pdf, mainDbName, collapsed, onToggleCollapsed, onCitationNavigate }, ref) => {
    const { isDark } = useTheme();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatContainerRef = useRef<ChatContainerHandle>(null);
    const [chatContainerReady, setChatContainerReady] = useState(false);
    const isConnected = useDatabaseConnected();

    const toolScope = usePdfChat(pdf.id, mainDbName);

    const systemPrompt = useMemo(() => buildPdfSystemPrompt(pdf), [pdf]);

    // 本 PDF 的对话（统一会话 store 按 pdf-chat + pdfId 分桶）；库切换时列表随 bucket 重读
    const bucket = useMemo(
      () => ({ scope: "pdf-chat" as const, domainRef: String(pdf.id) }),
      [pdf.id]
    );
    const { rows, loaded, currentChat, select, newChat, rename, remove } = useScopedChat(bucket, {
      draftSlot: "pdf",
      autoLoad: isConnected,
    });

    const [sendLoading, setSendLoading] = useState(false);
    const [indexPreparing, setIndexPreparing] = useState(false);
    const [indexStatus, setIndexStatus] = useState<PdfIndexStatus | null>(null);
    const [pendingAskPayload, setPendingAskPayload] = useState<PdfChatAskPayload | null>(null);

    const handleChatContainerRef = useCallback((instance: ChatContainerHandle | null) => {
      chatContainerRef.current = instance;
      setChatContainerReady(Boolean(instance));
    }, []);

    const resolvePdfPath = useMemoizedFn(async () => {
      const candidatePath = String(pdf.filePath || "").trim();
      if (candidatePath) {
        return candidatePath;
      }
      if (!pdf.isLocal && pdf.remoteUrl) {
        return await remoteResourceToLocal(pdf.remoteUrl, pdf.fileName);
      }
      return "";
    });

    const ensureIndexReadyBeforeSend = useMemoizedFn(async () => {
      if (!mainDbName) {
        toast.warning("当前数据库未连接，暂时无法使用 PDF 问答");
        return false;
      }

      setIndexPreparing(true);
      try {
        const resolvedPath = await resolvePdfPath();
        if (!resolvedPath) {
          toast.warning("无法定位当前 PDF 文件，暂时无法建立索引");
          return false;
        }

        const nextStatus = await ensurePdfIndex({
          pdfId: pdf.id,
          resolvedPath,
          fileName: pdf.fileName,
          mainDbName,
        });
        setIndexStatus(nextStatus);
        if (nextStatus.state === "failed") {
          toast.error(nextStatus.error || "PDF 索引构建失败");
          return false;
        }
        return true;
      } catch (error) {
        console.error("准备 PDF 索引失败:", error);
        setIndexStatus({
          pdfId: pdf.id,
          state: "failed",
          pageCount: 0,
          updatedAt: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("准备 PDF 索引失败");
        return false;
      } finally {
        setIndexPreparing(false);
      }
    });

    useEffect(() => {
      if (!mainDbName || !pdf.id) {
        setIndexStatus(null);
        return;
      }

      let cancelled = false;
      const refreshStatus = async () => {
        try {
          const nextStatus = await getPdfIndexStatus({
            pdfId: pdf.id,
            mainDbName,
          });
          if (!cancelled) {
            setIndexStatus(nextStatus);
          }
        } catch (error) {
          if (!cancelled) {
            console.error("获取 PDF 索引状态失败:", error);
          }
        }
      };

      void refreshStatus();
      return () => {
        cancelled = true;
      };
    }, [mainDbName, pdf.id]);

    useEffect(() => {
      if (
        !mainDbName ||
        !pdf.id ||
        !isConnected ||
        (!indexPreparing && indexStatus?.state !== "building")
      ) {
        return;
      }

      const timer = window.setInterval(async () => {
        try {
          const nextStatus = await getPdfIndexStatus({
            pdfId: pdf.id,
            mainDbName,
          });
          setIndexStatus(nextStatus);
        } catch (error) {
          console.error("获取 PDF 索引进度失败:", error);
        }
      }, 1000);
      return () => window.clearInterval(timer);
    }, [indexPreparing, indexStatus?.state, isConnected, mainDbName, pdf.id]);

    const onTitleChange = useMemoizedFn(async (title: string) => {
      try {
        await rename(currentChat.id, title);
      } catch (error) {
        toast.error("更新标题失败");
        console.error(error);
      }
    });

    const handleChatSelect = useMemoizedFn((chatId: string) => {
      chatContainerRef.current?.scrollToTop();
      select(chatId);
    });

    // 代码 / 链接渲染与对话页共用（D-048）；PDF 特有的 pdfref 引用 span 在此合并
    const baseMarkdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "pdf-block" });
    const markdownComponents = useMemo(
      () => ({
        ...baseMarkdownComponents,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
        span: ({ children, className, node: _node, ...props }: any) => {
          if (className === "pdf-citation") {
            const label = extractTextFromReactNode(children).trim();
            const pageNumber = Number(props["data-page"]);
            const charStart = Number(props["data-char-start"]);
            const charEnd = Number(props["data-char-end"]);
            const citation: PdfCitationTarget | null =
              Number.isFinite(pageNumber) && pageNumber > 0
                ? {
                    pageNumber,
                    charStart: Number.isFinite(charStart) ? charStart : undefined,
                    charEnd: Number.isFinite(charEnd) ? charEnd : undefined,
                    previewText: props["data-preview-text"] || undefined,
                    label: props["data-label"] || label,
                  }
                : null;

            if (!citation) {
              return <span className={className}>{children}</span>;
            }

            const markerLabel = buildPdfCitationMarkerLabel(citation);
            return (
              <Tooltip
                placement="top"
                delay={200}
                content={
                  <span className="block max-w-[260px]">
                    <span className="mb-0.5 block font-medium tabular-nums">
                      第 {citation.pageNumber} 页
                    </span>
                    <span className="block opacity-85">
                      {citation.previewText || label || "引用位置"}
                    </span>
                  </span>
                }
              >
                <button
                  type="button"
                  className="rounded-tau-sm bg-info-soft text-info ease-tau-out text-tau-tiny hover:bg-info/20 mx-px inline-flex translate-y-[-0.2em] cursor-pointer items-center px-1.5 py-px font-medium tabular-nums leading-none transition-colors duration-[160ms]"
                  aria-label={`跳转到第 ${citation.pageNumber} 页引用`}
                  onMouseDown={event => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onCitationNavigate?.(citation);
                  }}
                >
                  <span className="not-italic no-underline">{markerLabel}</span>
                </button>
              </Tooltip>
            );
          }

          return (
            <span className={className} {...props}>
              {children}
            </span>
          );
        },
      }),
      [baseMarkdownComponents, onCitationNavigate]
    );

    useImperativeHandle(ref, () => ({
      askQuestion: async (payload: PdfChatAskPayload) => {
        if (collapsed) {
          onToggleCollapsed();
        }
        setPendingAskPayload(payload);
        return true;
      },
    }));

    useEffect(() => {
      if (
        collapsed ||
        !pendingAskPayload ||
        !chatContainerReady ||
        !chatContainerRef.current ||
        !loaded ||
        sendLoading
      ) {
        return;
      }

      const content = [
        {
          type: "text" as const,
          text: pendingAskPayload.text,
        },
        ...(pendingAskPayload.imageUrl
          ? [
              {
                type: "image" as const,
                image: pendingAskPayload.imageUrl,
              },
            ]
          : []),
      ];

      const timer = window.setTimeout(() => {
        chatContainerRef.current?.focusInput();
        void (async () => {
          const sent = await chatContainerRef.current?.sendUserMessage(content);
          if (sent) {
            setPendingAskPayload(null);
          }
        })();
      }, 60);

      return () => window.clearTimeout(timer);
    }, [chatContainerReady, collapsed, pendingAskPayload, sendLoading, loaded]);

    const progressPercent =
      indexStatus?.progressTotal && typeof indexStatus.progressCurrent === "number"
        ? Math.max(
            4,
            Math.min(100, (indexStatus.progressCurrent / indexStatus.progressTotal) * 100)
          )
        : 35;

    return (
      <MarkdownProvider isDark={isDark} isVisible={!collapsed}>
        <div className="bg-page flex h-full flex-col overflow-hidden">
          {collapsed ? null : !loaded ? (
            <Loading minHeight={0} className="flex-1" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              {indexPreparing || indexStatus?.state === "building" ? (
                <div className="rounded-tau-md bg-info-soft text-tau-sm text-info mb-3 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <Spinner className="border-info/30 border-t-info size-3" />
                      <span className="truncate">
                        {indexStatus?.progressLabel || "正在准备 PDF 索引"}
                      </span>
                    </span>
                    {indexStatus?.progressTotal ? (
                      <span className="shrink-0 tabular-nums">
                        {indexStatus.progressCurrent || 0}/{indexStatus.progressTotal}
                      </span>
                    ) : null}
                  </div>
                  <div className="bg-info/15 mt-2 h-1 overflow-hidden rounded-full">
                    <div
                      className="bg-info ease-tau-out h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="text-ink-2 mt-1.5">索引完成后即可进行 PDF 问答</div>
                </div>
              ) : indexStatus?.state === "failed" ? (
                <div className="rounded-tau-md bg-danger-soft text-tau-sm text-danger mb-3 px-3 py-2">
                  PDF 索引失败：{indexStatus.error || "未知错误"}
                </div>
              ) : null}
              <div className="mb-2 flex items-center justify-between">
                <ChatDropdownSelector
                  chats={rows}
                  currentChat={currentChat}
                  onChatSelect={handleChatSelect}
                  onTitleChange={onTitleChange}
                  onChatDelete={remove}
                  titleRef={editTitleRef}
                />
              </div>

              <Suspense fallback={<Loading minHeight={0} />}>
                <ChatContainer
                  ref={handleChatContainerRef}
                  currentChat={currentChat}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible={!collapsed}
                  chatScope={`pdf-chat:${pdf.id}`}
                  toolScope={toolScope}
                  sendLoading={sendLoading}
                  setSendLoading={setSendLoading}
                  titleRef={editTitleRef}
                  onCreateNewMessage={newChat}
                  createMessageLoading={false}
                  onChatCreated={select}
                  customSystemPrompt={systemPrompt}
                  beforeSendUserMessage={ensureIndexReadyBeforeSend}
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
