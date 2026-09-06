import { App, Empty, Popover } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
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
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { shouldRenderAsBlockCode } from "@/layouts/ContentLayout/components/ChatSidebar/codeBlockUtils";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import useSettingStore from "@/stores/useSettingStore";
import usePdfChatStore, { EPdfChatStatus } from "@/stores/usePdfChatStore";
import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import { buildSessionAwareSystemPrompt, Role } from "@/constants";
import type { ChatAgentType, ChatMessage, Pdf, PdfIndexStatus, ResponseMessage } from "@/types";
import { ensurePdfIndex, getPdfIndexStatus, openExternal } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import usePdfChat from "./usePdfChat";
import { buildPdfCitationMarkerLabel, type PdfCitationTarget } from "./pdfCitation";
import { CHAT_AGENT_TYPE_STORAGE_KEY, normalizeChatAgentType } from "@/constants/chatAgent";

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
- get_pdf_document_map：读取当前 PDF 的目录/章节结构和页码范围
- read_pdf_section：按章节读取页范围和全文
- search_pdf_knowledge：搜索当前 PDF 的相关片段，返回页码、chunk 和字符范围
- get_pdf_document_info：读取当前 PDF 的总页数和索引状态
- get_pdf_outline：读取当前 PDF 的目录
- read_pdf_page：读取指定页全文
- read_pdf_page_range：读取指定页范围全文
- get_pdf_annotations：读取当前 PDF 的标注、区域截图与笔记
- get_pdf_bookmarks：读取当前 PDF 的书签

## 工作流要求
1. 先理解问题
2. 如果是结构性问题（例如“整体结构是什么”“有哪些章节”），优先调用 get_pdf_document_map
3. 如果是内容问题，优先调用 search_pdf_knowledge 获取证据片段和字符范围
4. 根据搜索结果的页码、章节 ID 或字符范围，再用 read_pdf_page / read_pdf_page_range / read_pdf_section 读取完整上下文
5. 如果需要按目录浏览，再调用 get_pdf_outline 或 get_pdf_document_map
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

const createDefaultChat = (systemPrompt: string): ChatMessage => ({
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: buildSessionAwareSystemPrompt(systemPrompt),
      reasoning_content: "",
    },
  ],
  title: "新对话",
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
});

const CodeRenderer: React.FC<{
  children?: React.ReactNode;
  className?: string;
  "data-markdown-block-code"?: string;
}> = ({ children, className, "data-markdown-block-code": markdownBlockCode, ...rest }) => {
  const { message } = App.useApp();
  const mermaidRenderPreference = useMermaidRenderPreference();
  const { isDark } = useTheme();
  const { messageMeta } = useMarkdownContext();
  const match = /language-([\w-]+)/.exec(className || "");
  const language = match ? match[1] : undefined;
  const isBlockCode = shouldRenderAsBlockCode({
    className,
    "data-markdown-block-code": markdownBlockCode,
  });
  const code = String(children).replace(/\n$/, "");

  if (language === "mermaid") {
    return (
      <MermaidRenderer
        code={code}
        isDark={isDark}
        messageApi={message}
        renderPreference={mermaidRenderPreference}
      />
    );
  }

  if (language) {
    return (
      <LazySyntaxHighlighter language={language} isDark={isDark} {...rest}>
        {code}
      </LazySyntaxHighlighter>
    );
  }

  if (isBlockCode) {
    return (
      <LazySyntaxHighlighter language="text" isDark={isDark} {...rest}>
        {code}
      </LazySyntaxHighlighter>
    );
  }

  return (
    <code {...rest} className={className} data-message={messageMeta?.chatId}>
      {children}
    </code>
  );
};

const PdfChatPanel = forwardRef<PdfChatPanelHandle, PdfChatPanelProps>(
  ({ pdf, mainDbName, collapsed, onToggleCollapsed, onCitationNavigate }, ref) => {
    const { message } = App.useApp();
    const { isDark } = useTheme();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatContainerRef = useRef<ChatContainerHandle>(null);
    const [chatContainerReady, setChatContainerReady] = useState(false);
    const [rememberedAgentType] = useLocalStorageState<ChatAgentType>(CHAT_AGENT_TYPE_STORAGE_KEY, {
      defaultValue: "local",
    });
    const database = useSettingStore(state => state.setting.database.active);
    const isConnected = useDatabaseConnected();

    usePdfChat(pdf.id, mainDbName);

    const systemPrompt = useMemo(() => buildPdfSystemPrompt(pdf), [pdf]);

    const {
      initChats,
      chats,
      currentChatId,
      status,
      createChat,
      updateChat,
      updateCurrentChat,
      createChatBranch,
      deleteChat,
      getChildBranchesCount,
    } = usePdfChatStore(
      useShallow(state => ({
        initChats: state.initChats,
        chats: state.chats,
        currentChatId: state.currentChatId,
        status: state.status,
        createChat: state.createChat,
        updateChat: state.updateChat,
        updateCurrentChat: state.updateCurrentChat,
        createChatBranch: state.createChatBranch,
        deleteChat: state.deleteChat,
        getChildBranchesCount: state.getChildBranchesCount,
      }))
    );

    useEffect(() => {
      if (isConnected && pdf.id) {
        initChats(pdf.id);
      }
    }, [database, initChats, isConnected, pdf.id]);

    const currentChat = useMemo(
      () => chats.find(chat => chat.id === currentChatId),
      [chats, currentChatId]
    );

    const currentChatAsMessage = useMemo((): ChatMessage => {
      if (!currentChat) {
        return createDefaultChat(systemPrompt);
      }
      return {
        id: currentChat.id,
        createTime: currentChat.createTime,
        updateTime: currentChat.updateTime,
        messages: currentChat.messages,
        title: currentChat.title,
        groupId: null,
        archived: currentChat.archived,
        parentChatId: currentChat.parentChatId,
        branchIndex: currentChat.branchIndex,
        agentType: currentChat.agentType,
        agentSessionId: currentChat.agentSessionId,
      };
    }, [currentChat, systemPrompt]);

    const chatsAsMessages = useMemo(
      (): ChatMessage[] =>
        chats.map(chat => ({
          id: chat.id,
          createTime: chat.createTime,
          updateTime: chat.updateTime,
          messages: chat.messages,
          title: chat.title,
          groupId: null,
          archived: chat.archived,
          parentChatId: chat.parentChatId,
          branchIndex: chat.branchIndex,
          agentType: chat.agentType,
          agentSessionId: chat.agentSessionId,
        })),
      [chats]
    );

    const [createMessageLoading, setCreateMessageLoading] = useState(false);
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
        message.warning("当前数据库未连接，暂时无法使用 PDF 问答");
        return false;
      }

      setIndexPreparing(true);
      try {
        const resolvedPath = await resolvePdfPath();
        if (!resolvedPath) {
          message.warning("无法定位当前 PDF 文件，暂时无法建立索引");
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
          message.error(nextStatus.error || "PDF 索引构建失败");
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
        message.error("准备 PDF 索引失败");
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

    const onCreateNewMessage = useMemoizedFn(async () => {
      const messages: ResponseMessage[] = [
        {
          role: Role.System,
          content: systemPrompt,
        },
      ];
      setCreateMessageLoading(true);
      try {
        await createChat(messages, undefined, normalizeChatAgentType(rememberedAgentType));
      } catch (error) {
        message.error("创建对话失败");
        console.error(error);
      } finally {
        setCreateMessageLoading(false);
      }
    });

    const onTitleChange = useMemoizedFn(async (title: string) => {
      if (!currentChat) return;
      try {
        await updateChat({ ...currentChat, title });
      } catch (error) {
        message.error("更新标题失败");
        console.error(error);
      }
    });

    const handleChatSelect = useMemoizedFn((chatId: number) => {
      chatContainerRef.current?.scrollToTop();
      usePdfChatStore.setState({ currentChatId: chatId });
    });

    const handleExternalCreateChat = useMemoizedFn(
      async (
        messages: ChatMessage["messages"],
        title?: string,
        agentType?: ChatAgentType,
        agentSessionId?: string | null
      ) => {
        const created = await createChat(messages, title, agentType, agentSessionId);
        return {
          id: created.id,
          createTime: created.createTime,
          updateTime: created.updateTime,
          messages: created.messages,
          title: created.title,
          groupId: null,
          archived: created.archived,
          parentChatId: created.parentChatId,
          branchIndex: created.branchIndex,
          agentType: created.agentType,
          agentSessionId: created.agentSessionId,
        };
      }
    );

    const handleExternalCreateBranch = useMemoizedFn(
      async (parentChatId: number, messages: ChatMessage["messages"]) => {
        const created = await createChatBranch(parentChatId, messages);
        return {
          id: created.id,
          createTime: created.createTime,
          updateTime: created.updateTime,
          messages: created.messages,
          title: created.title,
          groupId: null,
          archived: created.archived,
          parentChatId: created.parentChatId,
          branchIndex: created.branchIndex,
          agentType: created.agentType,
          agentSessionId: created.agentSessionId,
        };
      }
    );

    const handleUpdateChatMessage = useMemoizedFn(async (chat: ChatMessage) => {
      const localChat = chats.find(item => item.id === chat.id);
      if (!localChat) {
        throw new Error("Chat not found");
      }
      const updated = await updateChat({
        ...localChat,
        messages: chat.messages,
        title: chat.title,
        archived: chat.archived,
        agentType: chat.agentType,
        agentSessionId: chat.agentSessionId,
      });
      return {
        ...chat,
        ...updated,
      };
    });

    const handleUpdateCurrentChat = useMemoizedFn((chat: ChatMessage) => {
      updateCurrentChat({
        id: chat.id,
        pdfId: pdf.id,
        createTime: chat.createTime,
        updateTime: chat.updateTime,
        messages: chat.messages,
        title: chat.title,
        archived: chat.archived,
        parentChatId: chat.parentChatId,
        branchIndex: chat.branchIndex,
        agentType: chat.agentType,
        agentSessionId: chat.agentSessionId,
      });
    });

    const handleChatDelete = useMemoizedFn(async (chatId: number) => {
      await deleteChat(chatId);
    });

    const handleLinkClick = useMemoizedFn(
      (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
        if (!href) return;
        event.preventDefault();
        openExternal(href).catch(err => {
          console.error("打开链接失败:", err);
        });
      }
    );

    const markdownComponents = useMemo(
      () => ({
        code: CodeRenderer,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        span: ({ children, className, ...props }: any) => {
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
              <Popover
                trigger={["hover"]}
                placement="top"
                overlayInnerStyle={{
                  background: isDark ? "#18181b" : "#f8fafc",
                  border: isDark
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid rgba(15,23,42,0.08)",
                  boxShadow: isDark
                    ? "0 18px 42px rgba(0,0,0,0.55)"
                    : "0 18px 42px rgba(15,23,42,0.16)",
                }}
                content={
                  <div className="max-w-[320px]">
                    <div className="mb-1 text-xs font-semibold">第 {citation.pageNumber} 页</div>
                    <div className="text-xs leading-6 opacity-85">
                      {citation.previewText || label || "引用位置"}
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className="border-[var(--th-info)]/30 bg-[var(--th-info)]/10 text-status-info hover:border-[var(--th-info)]/30 hover:bg-[var(--th-info)]/15 hover:text-status-info inline-flex translate-y-[-0.2em] cursor-pointer items-center rounded-md border px-1.5 py-[1px] text-[11px] font-semibold leading-none transition-colors"
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
              </Popover>
            );
          }

          return (
            <span className={className} {...props}>
              {children}
            </span>
          );
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a: ({ children, href, ...props }: any) => {
          return (
            <a
              {...props}
              href={href}
              onClick={(event: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(event, href)}
            >
              {children}
            </a>
          );
        },
      }),
      [handleLinkClick, onCitationNavigate]
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
        status === EPdfChatStatus.LOADING ||
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
    }, [chatContainerReady, collapsed, pendingAskPayload, sendLoading, status]);

    return (
      <MarkdownProvider isDark={isDark} isVisible={!collapsed}>
        <div className="border-black/6 dark:border-white/8 flex h-full flex-col overflow-hidden border-l bg-white/70 backdrop-blur-sm dark:bg-zinc-950/40">
          {collapsed ? null : status === EPdfChatStatus.LOADING ? (
            <>
              <div className="flex flex-1 items-center justify-center">
                <LoadingOutlined />
              </div>
            </>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col p-4">
                {indexPreparing || indexStatus?.state === "building" ? (
                  <div className="border-[var(--th-info)]/20 bg-[var(--th-info)]/10 text-status-info mb-3 rounded-lg border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <LoadingOutlined />
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
                    <div className="bg-[var(--th-info)]/15 dark:bg-[var(--th-info)]/15 mt-2 h-1 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full bg-[var(--th-info)] transition-[width] duration-300"
                        style={{
                          width:
                            indexStatus?.progressTotal &&
                            typeof indexStatus.progressCurrent === "number"
                              ? `${Math.max(
                                  4,
                                  Math.min(
                                    100,
                                    (indexStatus.progressCurrent / indexStatus.progressTotal) * 100
                                  )
                                )}%`
                              : "35%",
                        }}
                      />
                    </div>
                    <div className="mt-1.5 opacity-75">索引完成后即可进行 PDF 问答</div>
                  </div>
                ) : indexStatus?.state === "failed" ? (
                  <div className="bg-red-500/6 dark:bg-red-400/8 mb-3 rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-700 dark:border-red-400/20 dark:text-red-200">
                    PDF 索引失败：{indexStatus.error || "未知错误"}
                  </div>
                ) : null}
                <div className="mb-2 flex items-center justify-between">
                  <ChatDropdownSelector
                    chatSource="pdf-chat"
                    chats={chatsAsMessages}
                    currentChat={currentChatAsMessage}
                    onChatSelect={handleChatSelect}
                    onTitleChange={onTitleChange}
                    onCreateNewChat={onCreateNewMessage}
                    onChatDelete={handleChatDelete}
                    getChildBranchesCount={getChildBranchesCount}
                    titleRef={editTitleRef}
                  />
                </div>

                {currentChat || (!currentChat && !createMessageLoading) ? (
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <LoadingOutlined />
                      </div>
                    }
                  >
                    <ChatContainer
                      ref={handleChatContainerRef}
                      currentChat={currentChatAsMessage}
                      isDark={isDark}
                      markdownComponents={markdownComponents}
                      isVisible={!collapsed}
                      chatScope={`pdf-chat:${pdf.id}`}
                      updateChatMessage={handleUpdateChatMessage}
                      updateCurrentChat={handleUpdateCurrentChat}
                      sendLoading={sendLoading}
                      setSendLoading={setSendLoading}
                      titleRef={editTitleRef}
                      onCreateNewMessage={onCreateNewMessage}
                      createMessageLoading={createMessageLoading}
                      onChatCreated={chatId => {
                        usePdfChatStore.setState({ currentChatId: chatId });
                      }}
                      customSystemPrompt={systemPrompt}
                      onCreateChat={handleExternalCreateChat}
                      onCreateBranch={handleExternalCreateBranch}
                      beforeSendUserMessage={ensureIndexReadyBeforeSend}
                    />
                  </Suspense>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <Empty description="暂无对话" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </MarkdownProvider>
    );
  }
);

PdfChatPanel.displayName = "PdfChatPanel";

export default memo(PdfChatPanel);
