import { App } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useState, useMemo, memo, lazy, Suspense, useRef } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import type { EditTextHandle } from "@/components/EditText";
import { openExternal } from "@/commands";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

import useChatMessageStore from "@/stores/useChatMessageStore";
import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import useTheme from "@/hooks/useTheme";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import { measurePerformance } from "../ChatSidebar/hooks/usePerformanceMonitor";

import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "../ChatSidebar/MarkdownContext";
import { shouldRenderAsBlockCode } from "../ChatSidebar/codeBlockUtils";

import {
  ResponseMessage,
  ChatMessage,
  ChatSessionMessage,
  ChatAgentType,
} from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import type { ChatContainerHandle } from "../ChatSidebar/ChatContainer";
import ChatDropdownSelector from "./ChatDropdownSelector";
import {
  CHAT_AGENT_TYPE_STORAGE_KEY,
  normalizeChatAgentType,
} from "@/constants/chatAgent";

const ChatContainer = lazy(() => import("../ChatSidebar/ChatContainer"));

// 简单的字符串hash函数
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

const DEFAULT_CHAT: ChatMessage = {
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: DEFAULT_SYSTEM_PROMPT,
      reasoning_content: "",
    },
  ],
  title: "新对话",
  titleDirty: false,
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
  agentSessionId: null,
};

const RightChatSidebar = memo(() => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);
  const [rememberedAgentType] = useLocalStorageState<ChatAgentType>(
    CHAT_AGENT_TYPE_STORAGE_KEY,
    {
      defaultValue: "local",
    },
  );

  const { activePanel, width, currentChatId, setWidth, setCurrentChatId } =
    useRightChatSidebarStore(
      useShallow((state) => ({
        activePanel: state.activePanel,
        width: state.width,
        currentChatId: state.currentChatId,
        setWidth: state.setWidth,
        setCurrentChatId: state.setCurrentChatId,
      })),
    );
  const open = activePanel === "chat";

  const {
    chats,
    updateChatMessage,
    updateCurrentChat,
    createChatBranch,
    deleteChatMessage,
    getChildBranchesCount,
  } = useChatMessageStore(
    useShallow((state) => ({
      chats: state.chats,
      updateChatMessage: state.updateChatMessage,
      updateCurrentChat: state.updateCurrentChat,
      createChatBranch: state.createChatBranch,
      deleteChatMessage: state.deleteChatMessage,
      getChildBranchesCount: state.getChildBranchesCount,
    })),
  );

  const currentChat = useMemo(() => {
    if (!currentChatId) return null;
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: ResponseMessage[] = [
      {
        role: Role.System,
        content: DEFAULT_SYSTEM_PROMPT,
      },
    ];

    setCreateMessageLoading(true);

    try {
      const { createChatMessage } = useChatMessageStore.getState();
      const newChat = await createChatMessage(
        messages,
        undefined,
        undefined,
        false,
        normalizeChatAgentType(rememberedAgentType),
      );
      setCurrentChatId(newChat.id);
    } catch (error) {
      message.error("Failed to create new chat");
      console.error(error);
    } finally {
      setCreateMessageLoading(false);
    }
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;

    const perf = measurePerformance("titleChange");
    try {
      const updatedChat = { ...currentChat, title, titleDirty: true };
      await updateChatMessage(updatedChat);
    } catch (error) {
      message.error("Failed to update title");
      console.error(error);
    }
    perf.end();
  });

  const handleChatSelect = useMemoizedFn((chatId: number) => {
    chatContainerRef.current?.scrollToTop();
    setCurrentChatId(chatId);
  });

  const handleChatDelete = useMemoizedFn(async (chatId: number) => {
    try {
      await deleteChatMessage(chatId);
      // 如果删除的是当前对话，需要切换到其他对话或清空
      if (currentChatId === chatId) {
        const remainingChats = chats.filter((c) => c.id !== chatId);
        if (remainingChats.length > 0) {
          setCurrentChatId(remainingChats[0].id);
        } else {
          setCurrentChatId(null);
        }
      }
    } catch (error) {
      message.error("删除对话失败");
      console.error(error);
      throw error;
    }
  });

  const handleChatCreated = useMemoizedFn((chatId: number) => {
    setCurrentChatId(chatId);
  });

  // ChatContainer 需要的创建对话回调
  const handleCreateChat = useMemoizedFn(
    async (
      messages: ChatSessionMessage[],
      title?: string,
      agentType?: ChatAgentType,
      agentSessionId?: string | null,
    ) => {
      const { createChatMessage } = useChatMessageStore.getState();
      return await createChatMessage(
        messages,
        title,
        currentChat?.groupId ?? null,
        false,
        agentType,
        agentSessionId,
      );
    },
  );

  // ChatContainer 需要的创建分支回调
  const handleCreateBranch = useMemoizedFn(
    async (parentChatId: number, messages: ChatSessionMessage[]) => {
      return await createChatBranch(parentChatId, messages);
    },
  );

  const handleLinkClick = useMemoizedFn(
    (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (href) {
        event.preventDefault();
        openExternal(href).catch((err) => {
          console.error("打开链接失败:", err);
        });
      }
    },
  );

  // 在主内容区新标签页打开预览
  const handleOpenInTab = useMemoizedFn((block: BlockData) => {
    const { createTab } = useTabStore.getState();
    // 使用 createTab 直接创建新标签页，而不是 openInNewTab（会检查重复）
    createTab(
      TabType.BlockPreview,
      { block },
      undefined,
      block.metadata.title || `${block.type} 预览`,
    );
  });

  const markdownComponents = useMemo(() => {
    // 检查代码块是否已完成生成（后面还有内容）
    const isCodeBlockCompleted = (
      code: string,
      textContent: string | undefined,
    ): boolean => {
      if (!textContent) return true;
      // 在 textContent 中找到代码块的位置
      const codeIndex = textContent.indexOf(code);
      if (codeIndex === -1) return true;
      // 检查代码块后面是否还有非空白内容
      const afterCode = textContent.slice(codeIndex + code.length);
      // 如果代码块后面有反引号结束符和其他内容，说明已完成
      const hasContentAfter = /```[\s\S]*?\S/.test(afterCode);
      return hasContentAfter;
    };

    const CodeBlockRenderer: React.FC<{
      children?: React.ReactNode;
      className?: string;
      "data-markdown-block-code"?: string;
    }> = ({
      children,
      className,
      "data-markdown-block-code": markdownBlockCode,
      ...rest
    }) => {
      const mermaidRenderPreference = useMermaidRenderPreference();
      const { messageMeta } = useMarkdownContext();
      const sourceChatId = messageMeta?.chatId ?? 0;
      const sourceMessageIndex = messageMeta?.messageIndex ?? 0;
      const blockIndex = messageMeta?.blockIndex;
      const messageKey = `${sourceChatId}-${sourceMessageIndex}`;

      const match = /language-([\w-]+)/.exec(className || "");
      const language = match ? match[1] : undefined;
      const isBlockCode = shouldRenderAsBlockCode({
        className,
        "data-markdown-block-code": markdownBlockCode,
      });
      const code = String(children)
        .replace(/^\r?\n/, "")
        .replace(/\r?\n$/, "");

      // 判断代码块是否正在生成：
      // 1. 消息正在流式生成
      // 2. 是最后一个 text block
      // 3. 代码块后面没有其他内容（未完成）
      const isGenerating =
        !!messageMeta?.isStreaming &&
        !!messageMeta?.isLastTextBlock &&
        !isCodeBlockCompleted(code, messageMeta?.textContent);

      // 内联渲染的特殊类型
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

      // HTML 特殊处理：只有完整的 HTML 才使用 BlockCard
      if (language === "html") {
        const trimmedCode = code.trim();
        const isCompleteHtml = /^<!DOCTYPE\s+html>/i.test(trimmedCode);

        if (!isCompleteHtml) {
          // 不完整的 HTML，渲染为普通代码块
          return (
            <LazySyntaxHighlighter language="html" isDark={isDark} {...rest}>
              {code}
            </LazySyntaxHighlighter>
          );
        }
        // 完整的 HTML，继续下面的 BlockCard 处理
      }

      // 检查是否为可预览的 Block 类型（使用 BlockCard 卡片展示）
      if (language && blockRegistry.isPreviewable(language)) {
        // 使用内容hash生成稳定的block ID
        const stableContent = code.slice(0, 200);
        const idSuffix =
          blockIndex != null
            ? `idx-${blockIndex}`
            : `hash-${simpleHash(stableContent)}`;
        const blockData: BlockData = {
          id: `sidebar-block-${language}-${messageKey}-${idSuffix}`,
          type: language,
          content: code,
          metadata: {
            type: language,
            language,
            timestamp: Date.now(),
            sourceChatId,
            sourceMessageIndex,
            blockIndex,
            isGenerating,
          },
        };

        // 提取元数据
        const renderer = blockRegistry.getRenderer(language);
        if (renderer?.extractMetadata) {
          Object.assign(blockData.metadata, renderer.extractMetadata(code));
        }

        if (renderer?.renderInline && renderer.inlineMode === "expanded") {
          return (
            <div className="my-3">
              {renderer.renderInline({
                block: blockData,
                onPreview: () => handleOpenInTab(blockData),
              })}
            </div>
          );
        }

        return <BlockCard block={blockData} onPreview={handleOpenInTab} />;
      }

      // 普通代码高亮
      if (match) {
        return (
          <LazySyntaxHighlighter language={match[1]} isDark={isDark} {...rest}>
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
        <code {...rest} className={className}>
          {children}
        </code>
      );
    };

    return {
      code: CodeBlockRenderer,
      a: ({
        children,
        href,
        ...props
      }: {
        children?: React.ReactNode;
        href?: string;
      }) => {
        return (
          <a
            {...props}
            href={href}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
              handleLinkClick(e, href)
            }
          >
            {children}
          </a>
        );
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  return (
    <ResizableAndHideableSidebar
      className={classnames(
        "relative box-border flex-none h-full",
        open && "ml-3 rounded-2xl shadow-lg border",
        open && "bg-[var(--th-card-bg)] border-[var(--th-border)]",
      )}
      width={width}
      open={open}
      onWidthChange={(newWidth) => {
        setWidth(newWidth);
      }}
      resizeHandleSide="left"
      minWidth={400}
      maxWidth={800}
      disableResize={!open}
      handleOffset={9}
    >
      <MarkdownProvider isDark={isDark} isVisible={open}>
        <div className="h-full box-border overflow-hidden rounded-2xl">
          <div className={classnames("box-border p-4 h-full flex flex-col")}>
            <div className="flex justify-between items-center mb-2">
              <ChatDropdownSelector
                chats={chats}
                currentChat={currentChat || DEFAULT_CHAT}
                onChatSelect={handleChatSelect}
                onTitleChange={onTitleChange}
                onCreateNewChat={onCreateNewMessage}
                onChatDelete={handleChatDelete}
                getChildBranchesCount={getChildBranchesCount}
                titleRef={editTitleRef}
              />
            </div>

            <div className={open ? "flex-1 min-h-0" : "hidden"}>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full">
                    <LoadingOutlined />
                  </div>
                }
              >
                <ChatContainer
                  ref={chatContainerRef}
                  currentChat={currentChat || DEFAULT_CHAT}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible={open}
                  updateChatMessage={updateChatMessage}
                  updateCurrentChat={updateCurrentChat}
                  sendLoading={sendLoading}
                  setSendLoading={setSendLoading}
                  titleRef={editTitleRef}
                  onCreateNewMessage={onCreateNewMessage}
                  createMessageLoading={createMessageLoading}
                  preserveScrollPosition
                  scrollPositionScope="right-chat-sidebar"
                  onChatCreated={handleChatCreated}
                  onCreateChat={handleCreateChat}
                  onCreateBranch={handleCreateBranch}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </MarkdownProvider>
    </ResizableAndHideableSidebar>
  );
});

export default RightChatSidebar;
