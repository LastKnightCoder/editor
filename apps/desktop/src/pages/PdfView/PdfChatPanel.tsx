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
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import useSettingStore from "@/stores/useSettingStore";
import usePdfChatStore, { EPdfChatStatus } from "@/stores/usePdfChatStore";
import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import { buildSessionAwareSystemPrompt, Role } from "@/constants";
import type { ChatMessage, Pdf, ResponseMessage } from "@/types";
import { ensurePdfIndex, openExternal } from "@/commands";
import { remoteResourceToLocal } from "@/utils";
import usePdfChat from "./usePdfChat";
import {
  buildPdfCitationMarkerLabel,
  type PdfCitationTarget,
} from "./pdfCitation";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
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
- get_pdf_document_map：读取当前 PDF 的总纲地图、章节树和总览摘要
- search_pdf_sections：搜索当前 PDF 的章节摘要层
- get_pdf_section_summary：读取某个章节的深度摘要
- read_pdf_section：按章节读取页范围、摘要和全文
- search_pdf_knowledge：搜索当前 PDF 的相关片段，返回页码
- get_pdf_document_info：读取当前 PDF 的总页数和索引状态
- get_pdf_outline：读取当前 PDF 的目录
- read_pdf_page：读取指定页全文
- read_pdf_page_range：读取指定页范围全文
- get_pdf_annotations：读取当前 PDF 的标注、区域截图与笔记
- get_pdf_bookmarks：读取当前 PDF 的书签

## 工作流要求
1. 先理解问题
2. 如果是整体性问题（例如“这篇文章讲了什么”“整体结构是什么”“各章节主要内容”），优先调用 get_pdf_document_map
3. 如果要定位相关章节，优先调用 search_pdf_sections；确认章节后再调用 get_pdf_section_summary 或 read_pdf_section
4. 如果是细节性问题，优先调用 search_pdf_knowledge 获取证据片段
5. 必要时再用 read_pdf_page / read_pdf_page_range 读取完整上下文
6. 需要用户上下文时，再调用 get_pdf_annotations / get_pdf_bookmarks
7. 证据不足时明确说明，不要猜测

## 回答要求
- 回答尽量给出对应页码
- 只使用当前 PDF 的信息，不混入其它知识库
- 如果当前 PDF 尚未完成索引，应说明限制并尽量基于已读页面作答
- 回答整体问题时，优先先给出“总纲 -> 章节 -> 细节”的结构，而不是直接堆叠零散片段
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
}> = ({ children, className, ...rest }) => {
  const { message } = App.useApp();
  const mermaidRenderPreference = useMermaidRenderPreference();
  const { isDark } = useTheme();
  const { messageMeta } = useMarkdownContext();
  const match = /language-([\w-]+)/.exec(className || "");
  const language = match ? match[1] : undefined;
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

  return (
    <code {...rest} className={className} data-message={messageMeta?.chatId}>
      {children}
    </code>
  );
};

const PdfChatPanel = forwardRef<PdfChatPanelHandle, PdfChatPanelProps>(
  (
    { pdf, mainDbName, collapsed, onToggleCollapsed, onCitationNavigate },
    ref,
  ) => {
    const { message } = App.useApp();
    const { isDark } = useTheme();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatContainerRef = useRef<ChatContainerHandle>(null);
    const [chatContainerReady, setChatContainerReady] = useState(false);
    const database = useSettingStore((state) => state.setting.database.active);
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
      useShallow((state) => ({
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
      })),
    );

    useEffect(() => {
      if (isConnected && pdf.id) {
        initChats(pdf.id);
      }
    }, [database, initChats, isConnected, pdf.id]);

    const currentChat = useMemo(
      () => chats.find((chat) => chat.id === currentChatId),
      [chats, currentChatId],
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
      };
    }, [currentChat, systemPrompt]);

    const chatsAsMessages = useMemo(
      (): ChatMessage[] =>
        chats.map((chat) => ({
          id: chat.id,
          createTime: chat.createTime,
          updateTime: chat.updateTime,
          messages: chat.messages,
          title: chat.title,
          groupId: null,
          archived: chat.archived,
          parentChatId: chat.parentChatId,
          branchIndex: chat.branchIndex,
        })),
      [chats],
    );

    const [createMessageLoading, setCreateMessageLoading] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);
    const [pendingAskPayload, setPendingAskPayload] =
      useState<PdfChatAskPayload | null>(null);

    const handleChatContainerRef = useCallback(
      (instance: ChatContainerHandle | null) => {
        chatContainerRef.current = instance;
        setChatContainerReady(Boolean(instance));
      },
      [],
    );

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

      const resolvedPath = await resolvePdfPath();
      if (!resolvedPath) {
        message.warning("无法定位当前 PDF 文件，暂时无法建立索引");
        return false;
      }

      try {
        const status = await ensurePdfIndex({
          pdfId: pdf.id,
          resolvedPath,
          fileName: pdf.fileName,
          mainDbName,
        });
        if (status.state === "failed") {
          message.error(status.error || "PDF 索引构建失败");
          return false;
        }
        return true;
      } catch (error) {
        console.error("准备 PDF 索引失败:", error);
        message.error("准备 PDF 索引失败");
        return false;
      }
    });

    const onCreateNewMessage = useMemoizedFn(async () => {
      const messages: ResponseMessage[] = [
        {
          role: Role.System,
          content: systemPrompt,
        },
      ];
      setCreateMessageLoading(true);
      try {
        await createChat(messages);
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
      async (messages: ChatMessage["messages"], title?: string) => {
        const created = await createChat(messages, title);
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
        };
      },
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
        };
      },
    );

    const handleUpdateChatMessage = useMemoizedFn(async (chat: ChatMessage) => {
      const localChat = chats.find((item) => item.id === chat.id);
      if (!localChat) {
        throw new Error("Chat not found");
      }
      const updated = await updateChat({
        ...localChat,
        messages: chat.messages,
        title: chat.title,
        archived: chat.archived,
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
      });
    });

    const handleChatDelete = useMemoizedFn(async (chatId: number) => {
      await deleteChat(chatId);
    });

    const handleLinkClick = useMemoizedFn(
      (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
        if (!href) return;
        event.preventDefault();
        openExternal(href).catch((err) => {
          console.error("打开链接失败:", err);
        });
      },
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
                    charStart: Number.isFinite(charStart)
                      ? charStart
                      : undefined,
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
                    <div className="text-xs font-semibold mb-1">
                      第 {citation.pageNumber} 页
                    </div>
                    <div className="text-xs leading-6 opacity-85">
                      {citation.previewText || label || "引用位置"}
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-1.5 py-[1px] text-[11px] leading-none font-semibold text-sky-700 transition-colors cursor-pointer translate-y-[-0.2em] hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-900 dark:hover:text-sky-100"
                  aria-label={`跳转到第 ${citation.pageNumber} 页引用`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
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
              onClick={(event: React.MouseEvent<HTMLAnchorElement>) =>
                handleLinkClick(event, href)
              }
            >
              {children}
            </a>
          );
        },
      }),
      [handleLinkClick, onCitationNavigate],
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
        <div className="h-full flex flex-col border-l border-black/6 dark:border-white/8 bg-white/70 dark:bg-zinc-950/40 backdrop-blur-sm overflow-hidden">
          {collapsed ? null : status === EPdfChatStatus.LOADING ? (
            <>
              <div className="flex-1 flex items-center justify-center">
                <LoadingOutlined />
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 p-4 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <ChatDropdownSelector
                    chats={chatsAsMessages}
                    currentChat={currentChatAsMessage}
                    onChatSelect={handleChatSelect}
                    onTitleChange={onTitleChange}
                    onCreateNewChat={onCreateNewMessage}
                    onChatDelete={handleChatDelete}
                    getChildBranchesCount={getChildBranchesCount}
                    disabled={sendLoading}
                    titleRef={editTitleRef}
                  />
                </div>

                {currentChat || (!currentChat && !createMessageLoading) ? (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
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
                      onChatCreated={(chatId) => {
                        usePdfChatStore.setState({ currentChatId: chatId });
                      }}
                      customSystemPrompt={systemPrompt}
                      onCreateChat={handleExternalCreateChat}
                      onCreateBranch={handleExternalCreateBranch}
                      beforeSendUserMessage={ensureIndexReadyBeforeSend}
                    />
                  </Suspense>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <Empty description="暂无对话" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </MarkdownProvider>
    );
  },
);

PdfChatPanel.displayName = "PdfChatPanel";

export default memo(PdfChatPanel);
