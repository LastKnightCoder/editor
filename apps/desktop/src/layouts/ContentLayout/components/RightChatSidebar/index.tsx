import { App } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useState, useMemo, memo, lazy, Suspense, useRef } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
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
import { measurePerformance } from "../ChatSidebar/hooks/usePerformanceMonitor";

import MermaidRenderer from "../ChatSidebar/MermaidRenderer";
import MindMapRenderer from "../ChatSidebar/MindMapRenderer";
import WhiteBoardRenderer from "../ChatSidebar/WhiteBoardRenderer";
import LazySyntaxHighlighter from "../ChatSidebar/LazySyntaxHighlighter";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "../ChatSidebar/MarkdownContext";

import { ResponseMessage, ChatMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import type { ChatContainerHandle } from "../ChatSidebar/ChatContainer";
import ChatDropdownSelector from "./ChatDropdownSelector";

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
  promptId: null,
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
};

interface RightChatSidebarProps {
  isGradient?: boolean;
}

const RightChatSidebar = memo(
  ({ isGradient = false }: RightChatSidebarProps) => {
    const { isDark } = useTheme();
    const { message } = App.useApp();
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatContainerRef = useRef<ChatContainerHandle>(null);

    const { open, width, currentChatId, setWidth, setCurrentChatId } =
      useRightChatSidebarStore(
        useShallow((state) => ({
          open: state.open,
          width: state.width,
          currentChatId: state.currentChatId,
          setWidth: state.setWidth,
          setCurrentChatId: state.setCurrentChatId,
        })),
      );

    const { chats, updateChatMessage, updateCurrentChat } = useChatMessageStore(
      useShallow((state) => ({
        chats: state.chats,
        updateChatMessage: state.updateChatMessage,
        updateCurrentChat: state.updateCurrentChat,
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
        const newChat = await createChatMessage(messages);
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
        const updatedChat = { ...currentChat, title };
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

    const handleChatCreated = useMemoizedFn((chatId: number) => {
      setCurrentChatId(chatId);
    });

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
      const CodeBlockRenderer: React.FC<{
        children?: React.ReactNode;
        className?: string;
      }> = ({ children, className, ...rest }) => {
        const { messageMeta } = useMarkdownContext();
        const isGenerating = !!messageMeta?.isStreaming;
        const sourceChatId = messageMeta?.chatId ?? 0;
        const sourceMessageIndex = messageMeta?.messageIndex ?? 0;
        const blockIndex = messageMeta?.blockIndex;
        const messageKey = `${sourceChatId}-${sourceMessageIndex}`;

        const match = /language-([\w-]+)/.exec(className || "");
        const language = match ? match[1] : undefined;
        const code = String(children).replace(/\n$/, "");

        // 内联渲染的特殊类型
        if (language === "mermaid") {
          return <MermaidRenderer code={code} />;
        }

        if (language === "mind-map") {
          return <MindMapRenderer code={code} />;
        }

        if (language === "white-board") {
          return <WhiteBoardRenderer code={code} />;
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

          return <BlockCard block={blockData} onPreview={handleOpenInTab} />;
        }

        // 普通代码高亮
        if (match) {
          return (
            <Suspense fallback={<div>Loading code...</div>}>
              <LazySyntaxHighlighter language={match[1]} {...rest}>
                {code}
              </LazySyntaxHighlighter>
            </Suspense>
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
    }, []);

    return (
      <ResizableAndHideableSidebar
        className={classnames(
          "relative box-border flex-none h-full",
          open && "rounded-2xl shadow-lg border",
          open &&
            (isGradient
              ? "bg-white/20 dark:bg-[#0a0a0a]/15 backdrop-blur-sm backdrop-saturate-110 border-white/30 dark:border-white/20"
              : "bg-(--main-bg-color) border-(--line-color)"),
        )}
        width={width}
        open={open}
        onWidthChange={(newWidth) => {
          setWidth(newWidth);
        }}
        side="left"
        minWidth={400}
        maxWidth={800}
        disableResize={!open}
        handleOffset={14}
      >
        <MarkdownProvider isDark={isDark} isVisible={open}>
          <div className="h-full box-border overflow-hidden rounded-2xl">
            <div className={classnames("box-border p-4 h-full flex flex-col")}>
              <div className="flex justify-between items-center mb-2">
                <ChatDropdownSelector
                  currentChat={currentChat || DEFAULT_CHAT}
                  onChatSelect={handleChatSelect}
                  onTitleChange={onTitleChange}
                  onCreateNewChat={onCreateNewMessage}
                  disabled={sendLoading}
                  titleRef={editTitleRef}
                />
              </div>

              {open && (
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
                    onChatCreated={handleChatCreated}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </MarkdownProvider>
      </ResizableAndHideableSidebar>
    );
  },
);

export default RightChatSidebar;
