import { App } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import {
  useState,
  useMemo,
  memo,
  lazy,
  Suspense,
  useRef,
  useEffect,
} from "react";
import {
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";
import ModelSidebar from "@/components/ModelSidebar";
import { openExternal } from "@/commands";

import useChatMessageStore from "@/stores/useChatMessageStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "./hooks/usePerformanceMonitor";

import MermaidRenderer from "./MermaidRenderer";
import LazySyntaxHighlighter from "./LazySyntaxHighlighter";
import { MarkdownProvider } from "./MarkdownContext";

import { ResponseMessage } from "@/types";
import { Role } from "@/constants";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import type { ChatContainerHandle } from "./ChatContainer";

const ChatContainer = lazy(() => import("./ChatContainer"));

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

const ChatSidebar = memo(() => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  const {
    initChatMessage,
    open,
    width,
    currentChatId,
    chats,
    createChatMessage,
    updateChatMessage,
    updateCurrentChat,
  } = useChatMessageStore(
    useShallow((state) => ({
      initChatMessage: state.initChatMessage,
      open: state.open,
      width: state.width,
      currentChatId: state.currentChatId,
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      updateCurrentChat: state.updateCurrentChat,
    })),
  );

  // 添加 ModelSidebar 可见性状态
  const [modelSidebarVisible, setModelSidebarVisible] = useState(false);

  useEffect(() => {
    if (isConnected) {
      initChatMessage();
    }
  }, [initChatMessage, isConnected, database]);

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

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

  // 处理对话选择
  const handleChatSelect = useMemoizedFn((chatId: number) => {
    chatContainerRef.current?.scrollToTop();
    useChatMessageStore.setState({ currentChatId: chatId });
    setModelSidebarVisible(false);
  });

  // 切换对话列表侧边栏
  const toggleModelSidebar = useMemoizedFn(() => {
    setModelSidebarVisible(!modelSidebarVisible);
  });

  const onCreateChat = useMemoizedFn(async () => {
    await onCreateNewMessage();
    setModelSidebarVisible(false);
  });

  // 只有在侧边栏打开时才需要渲染Markdown组件
  const markdownComponents = useMemo(() => {
    if (!open) return null;

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
      code(props: any) {
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
      a: ({ node, children, href, ...props }: any) => {
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
  }, [open]);

  return (
    <ResizableAndHideableSidebar
      className="relative box-border flex-none h-full"
      width={width}
      open={open}
      onWidthChange={(width) => {
        useChatMessageStore.setState({ width });
      }}
      side={"left"}
      minWidth={320}
      maxWidth={920}
      disableResize={!open}
    >
      <MarkdownProvider isDark={isDark} isVisible={open}>
        <div className="h-full bg-[var(--primary-bg-color)] box-border">
          <div
            className={classnames("box-border p-4 h-full flex flex-col", {
              "bg-[#29292f]": isDark,
            })}
          >
            <div className="flex justify-between items-center">
              <div className="font-bold flex-1 flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-md cursor-pointer text-base transition-all duration-200 ease-in-out flex items-center justify-center hover:text-black"
                  onClick={toggleModelSidebar}
                >
                  {modelSidebarVisible ? (
                    <MenuFoldOutlined />
                  ) : (
                    <MenuUnfoldOutlined />
                  )}
                </button>
                {currentChat && (
                  <EditText
                    key={currentChat.id}
                    ref={editTitleRef}
                    defaultValue={currentChat.title}
                    onChange={onTitleChange}
                    contentEditable={!sendLoading}
                  />
                )}
              </div>
            </div>

            {(currentChat || (!currentChat && !createMessageLoading)) &&
              open && (
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
                  />
                </Suspense>
              )}
          </div>
        </div>

        {open && (
          <ModelSidebar
            visible={modelSidebarVisible}
            onChatSelect={handleChatSelect}
            selectedChatId={currentChatId || undefined}
            onCreateChat={onCreateChat}
            onClose={() => setModelSidebarVisible(false)}
          />
        )}
      </MarkdownProvider>
    </ResizableAndHideableSidebar>
  );
});

export default ChatSidebar;
