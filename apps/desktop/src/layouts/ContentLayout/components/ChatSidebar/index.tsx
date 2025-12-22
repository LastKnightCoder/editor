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
import { GitBranch, ChevronDown } from "lucide-react";
import { Dropdown } from "antd";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";
import ModelSidebar from "@/components/ModelSidebar";
import { openExternal } from "@/commands";

import useChatMessageStore from "@/stores/useChatMessageStore";
import usePromptStore from "@/stores/usePromptStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "./hooks/usePerformanceMonitor";

import MermaidRenderer from "./MermaidRenderer";
import MindMapRenderer from "./MindMapRenderer";
import WhiteBoardRenderer from "./WhiteBoardRenderer";
import LazySyntaxHighlighter from "./LazySyntaxHighlighter";
import { MarkdownProvider } from "./MarkdownContext";

import { ResponseMessage, ChatMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import type { ChatContainerHandle } from "./ChatContainer";

const ChatContainer = lazy(() => import("./ChatContainer"));

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

const ChatSidebar = memo(() => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  const {
    initChatMessage,
    initChatGroups,
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
      initChatGroups: state.initChatGroups,
      open: state.open,
      width: state.width,
      currentChatId: state.currentChatId,
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      updateCurrentChat: state.updateCurrentChat,
    })),
  );
  const initPrompts = usePromptStore((state) => state.initPrompts);

  // 添加 ModelSidebar 可见性状态
  const [modelSidebarVisible, setModelSidebarVisible] = useState(false);

  useEffect(() => {
    if (isConnected) {
      initChatMessage();
      initChatGroups();
      initPrompts();
    }
  }, [initChatMessage, initChatGroups, initPrompts, isConnected, database]);

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  // 获取相关分支（主干 + 兄弟分支 + 子分支）
  const siblingBranches = useMemo(() => {
    if (!currentChat) return [];

    const result: typeof chats = [];

    // 找到根对话（主干）
    const findRoot = (chat: typeof currentChat): typeof currentChat => {
      if (!chat.parentChatId) return chat;
      const parent = chats.find((c) => c.id === chat.parentChatId);
      return parent ? findRoot(parent) : chat;
    };

    const root = findRoot(currentChat);

    // 如果当前不是根，添加根作为主干
    if (root.id !== currentChat.id) {
      result.push(root);
    }

    // 获取兄弟分支（同一父级下的所有分支，包括自己）
    if (currentChat.parentChatId) {
      const siblings = chats
        .filter((c) => c.parentChatId === currentChat.parentChatId)
        .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
      result.push(...siblings);
    } else {
      // 当前是根，把自己加入
      result.push(currentChat);
    }

    // 获取自己的子分支
    const children = chats
      .filter((c) => c.parentChatId === currentChat.id)
      .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
    result.push(...children);

    // 如果只有自己一个，不显示切换器
    if (result.length <= 1) {
      return [];
    }

    return result;
  }, [currentChat, chats]);

  // 当前分支在同级分支中的索引
  const currentBranchIndex = useMemo(() => {
    if (!currentChat) return 0;
    return siblingBranches.findIndex((c) => c.id === currentChat.id);
  }, [siblingBranches, currentChat]);

  // 分支切换菜单
  const branchMenuItems = useMemo(() => {
    if (!currentChat) return [];

    return siblingBranches.map((chat) => {
      let prefix = "";
      if (!chat.parentChatId) {
        prefix = "主干: ";
      } else if (chat.parentChatId === currentChat.id) {
        prefix = "↳ "; // 子分支
      }

      return {
        key: chat.id.toString(),
        label: prefix + chat.title,
        disabled: chat.id === currentChat.id,
        onClick: () => {
          useChatMessageStore.setState({ currentChatId: chat.id });
        },
      };
    });
  }, [siblingBranches, currentChat]);

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

  // 处理链接点击
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

  // Markdown 组件配置 - 保持稳定引用避免代码块闪烁
  const markdownComponents = useMemo(() => {
    return {
      code(props: any) {
        const { children, className, ...rest } = props;
        // 修改正则以支持连字符（如 mind-map）
        const match = /language-([\w-]+)/.exec(className || "");
        const mermaidMatch = match && match[1] === "mermaid";
        const mindMapMatch = match && match[1] === "mind-map";
        const whiteBoardMatch = match && match[1] === "white-board";

        if (mermaidMatch) {
          return <MermaidRenderer code={String(children).replace(/\n$/, "")} />;
        }

        if (mindMapMatch) {
          return <MindMapRenderer code={String(children).replace(/\n$/, "")} />;
        }

        if (whiteBoardMatch) {
          return (
            <WhiteBoardRenderer code={String(children).replace(/\n$/, "")} />
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="h-full bg-(--primary-bg-color) box-border">
          <div
            className={classnames("box-border p-4 h-full flex flex-col", {
              "bg-[#29292f]": isDark,
            })}
          >
            <div className="flex justify-between items-center">
              <div className="font-bold flex-1 flex items-center gap-2 min-w-0">
                <button
                  className="px-3 py-2 rounded-md cursor-pointer text-base transition-all duration-200 ease-in-out flex items-center justify-center hover:text-black dark:hover:text-white flex-shrink-0"
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
              {/* 分支切换器 */}
              {siblingBranches.length > 1 && (
                <Dropdown
                  menu={{ items: branchMenuItems }}
                  placement="bottomRight"
                >
                  <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm text-text-secondary transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                    <GitBranch size={14} />
                    <span>
                      {currentBranchIndex === 0 && !currentChat?.parentChatId
                        ? "主干"
                        : `分支 ${currentBranchIndex}`}
                    </span>
                    <span className="text-xs opacity-60">
                      ({currentBranchIndex + 1}/{siblingBranches.length})
                    </span>
                    <ChevronDown size={14} />
                  </div>
                </Dropdown>
              )}
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
