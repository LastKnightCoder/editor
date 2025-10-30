import { memo, useMemo, lazy, Suspense, useRef, useState } from "react";
import { App, Empty, Spin } from "antd";
import { useShallow } from "zustand/react/shallow";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import "katex/dist/katex.min.css";

import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";
import { openExternal } from "@/commands";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "@/layouts/ContentLayout/components/ChatSidebar/hooks/usePerformanceMonitor";
import MermaidRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MermaidRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { ResponseMessage } from "@/types";
import { Role } from "@/constants";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

const DEFAULT_CHAT = {
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content:
        "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
      reasoning_content: "",
    },
  ],
  title: "新对话",
};

const ChatArea = memo(() => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const {
    currentChatId,
    chats,
    createChatMessage,
    updateChatMessage,
    updateCurrentChat,
  } = useChatMessageStore(
    useShallow((state) => ({
      currentChatId: state.currentChatId,
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      updateCurrentChat: state.updateCurrentChat,
    })),
  );

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: ResponseMessage[] = [
      {
        role: Role.System,
        content:
          "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
      },
    ];

    setCreateMessageLoading(true);

    try {
      await createChatMessage(messages);
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

  // 只有在有选中对话时才需要渲染Markdown组件
  const markdownComponents = useMemo(() => {
    if (!currentChat) return null;

    // 处理链接点击
    const handleLinkClick = (
      event: React.MouseEvent<HTMLAnchorElement>,
      href?: string,
    ) => {
      if (href) {
        event.preventDefault();
        openExternal(href).catch((err) => {
          console.error("打开链接失败:", err);
        });
      }
    };

    return {
      code(props: { children?: React.ReactNode; className?: string }) {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        const mermaidMatch = match && match[1] === "mermaid";

        if (mermaidMatch) {
          return <MermaidRenderer code={String(children).replace(/\n$/, "")} />;
        }

        if (match) {
          return (
            <Suspense fallback={<div>Loading code...</div>}>
              <LazySyntaxHighlighter language={match[1]} {...rest}>
                {String(children).replace(/\n$/, "")}
              </LazySyntaxHighlighter>
            </Suspense>
          );
        }

        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      },
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
  }, [currentChat]);

  // 检查是否有消息内容（排除系统消息）
  const hasMessages = useMemo(() => {
    if (!currentChat) return false;
    return (
      currentChat.messages.filter((m) => m.role !== Role.System).length > 0
    );
  }, [currentChat]);

  if (!currentChat) {
    return (
      <div className="flex-1 h-full flex bg-primary-bg overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <Empty description="请选择一个对话" />
        </div>
      </div>
    );
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className="flex-1 min-w-0 h-full flex bg-primary-bg overflow-hidden">
        {hasMessages ? (
          <div className={classnames("flex-1 flex flex-col overflow-hidden")}>
            <div className="w-full px-6 py-4 flex justify-between items-center flex-shrink-0">
              <div className="font-bold flex-1 flex items-center gap-2">
                <EditText
                  key={currentChat.id}
                  ref={editTitleRef}
                  defaultValue={currentChat.title}
                  onChange={onTitleChange}
                  contentEditable={!sendLoading}
                />
              </div>
            </div>

            <div className="flex-1 flex justify-center overflow-hidden mb-3">
              <div className="w-full max-w-6xl mx-20 flex flex-col overflow-hidden mb-3">
                {(currentChat || (!currentChat && !createMessageLoading)) && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-full">
                        <Spin indicator={<LoadingOutlined />} />
                      </div>
                    }
                  >
                    <ChatContainer
                      ref={chatContainerRef}
                      currentChat={currentChat || DEFAULT_CHAT}
                      isDark={isDark}
                      markdownComponents={markdownComponents}
                      isVisible={true}
                      updateChatMessage={updateChatMessage}
                      updateCurrentChat={updateCurrentChat}
                      sendLoading={sendLoading}
                      setSendLoading={setSendLoading}
                      titleRef={editTitleRef}
                      onCreateNewMessage={onCreateNewMessage}
                      createMessageLoading={createMessageLoading}
                    />
                  </Suspense>
                )}
              </div>
            </div>
          </div>
        ) : (
          // 无消息时：垂直居中，输入框限宽
          <div
            className={classnames(
              "w-full flex-1 min-h-0 flex flex-col justify-center items-center overflow-hidden px-20",
            )}
          >
            <div className="w-full max-w-6xl">
              {(currentChat || (!currentChat && !createMessageLoading)) && (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full">
                      <Spin indicator={<LoadingOutlined />} />
                    </div>
                  }
                >
                  <ChatContainer
                    ref={chatContainerRef}
                    currentChat={currentChat || DEFAULT_CHAT}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={true}
                    updateChatMessage={updateChatMessage}
                    updateCurrentChat={updateCurrentChat}
                    sendLoading={sendLoading}
                    setSendLoading={setSendLoading}
                    titleRef={editTitleRef}
                    onCreateNewMessage={onCreateNewMessage}
                    createMessageLoading={createMessageLoading}
                  />
                </Suspense>
              )}
            </div>
          </div>
        )}
      </div>
    </MarkdownProvider>
  );
});

export default ChatArea;
