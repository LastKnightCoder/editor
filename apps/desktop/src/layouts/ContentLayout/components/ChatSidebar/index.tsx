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
import { MarkdownProvider, useMarkdownContext } from "./MarkdownContext";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

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

// 检查代码块是否已经完成生成
const isCodeBlockCompleted = (
  codeContent: string,
  fullTextContent?: string,
): boolean => {
  if (!fullTextContent) return true;

  // 查找代码块在完整文本中的位置
  const codeIndex = fullTextContent.indexOf(codeContent);
  if (codeIndex === -1) return true;

  // 检查代码块后面是否有结束标记 ```
  const afterCode = fullTextContent.slice(codeIndex + codeContent.length);
  return afterCode.includes("```");
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

  // 在新标签页中打开预览
  const handleOpenInTab = useMemoizedFn((block: BlockData) => {
    const { createTab } = useTabStore.getState();
    createTab(
      TabType.BlockPreview,
      { block },
      undefined,
      block.metadata.title || `${block.type} 预览`,
    );
  });

  // 代码块渲染组件（必须是 React 组件才能使用 Hooks）
  const CodeBlockRenderer: React.FC<{
    children?: React.ReactNode;
    className?: string;
  }> = ({ children, className, ...rest }) => {
    const { messageMeta } = useMarkdownContext();
    const match = /language-([\w-]+)/.exec(className || "");
    const language = match ? match[1] : undefined;
    const code = String(children).replace(/\n$/, "");

    // 特殊渲染器优先处理
    if (language === "mermaid") {
      return <MermaidRenderer code={code} />;
    }

    if (language === "mind-map") {
      return <MindMapRenderer code={code} />;
    }

    if (language === "white-board") {
      return <WhiteBoardRenderer code={code} />;
    }

    // HTML 特殊处理：只有完整的 HTML 才使用 BlockCard
    if (language === "html") {
      const trimmedCode = code.trim();
      const isCompleteHtml = /^<!DOCTYPE\s+html>/i.test(trimmedCode);

      if (!isCompleteHtml) {
        // 不完整的 HTML，渲染为普通代码块
        return (
          <Suspense fallback={<div>Loading code...</div>}>
            <LazySyntaxHighlighter language="html" {...rest}>
              {code}
            </LazySyntaxHighlighter>
          </Suspense>
        );
      }
      // 完整的 HTML，继续下面的 BlockCard 处理
    }

    // 检查是否是可预览的块类型
    if (language && blockRegistry.isPreviewable(language)) {
      // 生成唯一 ID
      const messageKey = messageMeta
        ? `${messageMeta.chatId}-${messageMeta.messageIndex}`
        : "unknown";
      const blockIndex = messageMeta?.blockIndex ?? 0;
      const idSuffix = Date.now();

      // 判断是否正在生成
      const isGenerating =
        !!messageMeta?.isStreaming &&
        !!messageMeta?.isLastTextBlock &&
        !isCodeBlockCompleted(code, messageMeta?.textContent);

      // 创建 BlockData
      const blockData: BlockData = {
        id: `block-${language}-${messageKey}-${idSuffix}`,
        type: language,
        content: code,
        metadata: {
          type: language,
          language,
          timestamp: Date.now(),
          sourceChatId: messageMeta?.chatId,
          sourceMessageIndex: messageMeta?.messageIndex,
          blockIndex,
          isGenerating,
        },
      };

      // 提取元数据（标题、图标、描述等）
      const renderer = blockRegistry.getRenderer(language);
      if (renderer?.extractMetadata) {
        Object.assign(blockData.metadata, renderer.extractMetadata(code));
      }

      return <BlockCard block={blockData} onPreview={handleOpenInTab} />;
    }

    // 普通代码块
    if (language) {
      return (
        <Suspense fallback={<div>Loading code...</div>}>
          <LazySyntaxHighlighter language={language} {...rest}>
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

  // Markdown 组件配置 - 保持稳定引用避免代码块闪烁
  const markdownComponents = useMemo(() => {
    return {
      code: CodeBlockRenderer,
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
                  className="px-3 py-2 rounded-md cursor-pointer text-base transition-all duration-200 ease-in-out flex items-center justify-center hover:text-black dark:hover:text-white shrink-0"
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
                  <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm text-text-secondary transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
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
