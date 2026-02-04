/**
 * 对话面板
 * 基于 Vibe Learning 项目资源进行对话
 * 复用 ChatSidebar 的 ChatContainer 和 ChatDropdownSelector 组件
 */

import {
  useState,
  useMemo,
  memo,
  lazy,
  Suspense,
  useRef,
  useEffect,
} from "react";
import { App } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import { openExternal } from "@/commands";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";

import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";

import MermaidRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MermaidRenderer";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import WhiteBoardRenderer from "@/layouts/ContentLayout/components/ChatSidebar/WhiteBoardRenderer";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";

import { ResponseMessage, ChatMessage } from "@/types";
import { Role } from "@/constants";

import useVLChatStore, { EVLChatStatus } from "@/stores/useVLChatStore";
import { useVibeLearningChat } from "./useVibeLearningChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

const VL_SYSTEM_PROMPT = `你是一个智能学习助手，专门帮助用户理解和分析他们上传的学习资料。

## 可用工具

- search_project_knowledge: 搜索知识库内容（支持语义搜索，返回相关片段）
- list_project_resources: 列出项目中的所有资源
- read_resource_content: 读取指定资源的完整内容
- read_resource_range: 按行范围读取资源的特定部分

## 搜索策略

当用户提问时，你应该主动将问题改写为多个不同角度的查询，并行搜索以获取充分的资料：

1. **保留原问题**：必须将用户的原问题作为查询之一
2. **补充改写查询**：根据问题的复杂度，额外改写 1-3 个不同角度的查询
3. **并行执行**：同时执行多个搜索查询，一次性获取更全面的资料

示例：
- 用户问："什么是机器学习？"
- 执行的查询：
  - "什么是机器学习？"（原问题）
  - "机器学习是如何工作的？它的原理是什么？"
  - "机器学习有哪些实际应用场景？"

## 搜索结果评估与补充

- 并行搜索后，评估资料是否充分
- 如果某个方面资料不足，可以针对性地追加搜索
- 鼓励从多维度收集：概念、原理、方法、案例、对比等

## 读取完整内容

搜索结果只返回片段，当需要更完整的上下文时：

- 使用 read_resource_content 读取资源完整内容（有 100KB 限制，超出时使用 read_resource_range）继续读取
- 使用 read_resource_range 按行范围读取特定部分

适用场景：搜索结果被截断、需要前后文、需要深入理解某段内容

## 工作流程

1. 理解用户意图
2. 将问题改写为多个不同角度的查询（包含原问题）
3. 并行执行多个搜索，一次性获取资料
4. 评估搜索结果是否充分
5. 如需补充：追加搜索或使用读取工具获取完整内容
6. 综合所有资料，组织回答

## 回答要求

- 使用清晰、易懂的语言回答问题
- 必要时使用列表、表格等格式组织信息
- 如果搜索结果确实不足以回答问题，诚实地告知用户`;

const createDefaultChat = (): ChatMessage => ({
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: VL_SYSTEM_PROMPT,
      reasoning_content: "",
    },
  ],
  title: "新对话",
  promptId: null,
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
});

// 检查代码块是否已经完成生成
const isCodeBlockCompleted = (
  codeContent: string,
  fullTextContent?: string,
): boolean => {
  if (!fullTextContent) return true;
  const codeIndex = fullTextContent.indexOf(codeContent);
  if (codeIndex === -1) return true;
  const afterCode = fullTextContent.slice(codeIndex + codeContent.length);
  return afterCode.includes("```");
};

interface ChatPanelProps {
  projectId: number;
  mainDbName: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ projectId, mainDbName }) => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  // 注册项目专属搜索工具
  useVibeLearningChat(projectId, mainDbName);

  // VL 对话状态管理
  const {
    initChats,
    chats,
    currentChatId,
    status,
    createChat,
    updateChat,
    updateCurrentChat,
    createChatBranch,
  } = useVLChatStore(
    useShallow((state) => ({
      initChats: state.initChats,
      chats: state.chats,
      currentChatId: state.currentChatId,
      status: state.status,
      createChat: state.createChat,
      updateChat: state.updateChat,
      updateCurrentChat: state.updateCurrentChat,
      createChatBranch: state.createChatBranch,
    })),
  );

  // 初始化对话数据
  useEffect(() => {
    if (isConnected && projectId) {
      initChats(projectId);
    }
  }, [initChats, isConnected, database, projectId]);

  // 当前对话
  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  // 转换为 ChatMessage 类型（兼容 ChatContainer）
  const currentChatAsMessage = useMemo((): ChatMessage => {
    if (!currentChat) {
      return createDefaultChat();
    }
    return {
      id: currentChat.id,
      createTime: currentChat.createTime,
      updateTime: currentChat.updateTime,
      messages: currentChat.messages,
      title: currentChat.title,
      promptId: null,
      groupId: null,
      archived: currentChat.archived,
      parentChatId: currentChat.parentChatId,
      branchIndex: currentChat.branchIndex,
    };
  }, [currentChat, projectId]);

  // 转换 chats 为 ChatMessage[] 类型（用于 ChatDropdownSelector）
  const chatsAsMessages = useMemo((): ChatMessage[] => {
    return chats.map((chat) => ({
      id: chat.id,
      createTime: chat.createTime,
      updateTime: chat.updateTime,
      messages: chat.messages,
      title: chat.title,
      promptId: null,
      groupId: null,
      archived: chat.archived,
      parentChatId: chat.parentChatId,
      branchIndex: chat.branchIndex,
    }));
  }, [chats]);

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  // 创建新对话
  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: ResponseMessage[] = [
      {
        role: Role.System,
        content: VL_SYSTEM_PROMPT,
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

  // 更新对话标题
  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;

    try {
      await updateChat({ ...currentChat, title });
    } catch (error) {
      message.error("更新标题失败");
      console.error(error);
    }
  });

  // 处理对话选择
  const handleChatSelect = useMemoizedFn((chatId: number) => {
    chatContainerRef.current?.scrollToTop();
    useVLChatStore.setState({ currentChatId: chatId });
  });

  // 外部创建对话回调（用于 ChatContainer）
  const handleExternalCreateChat = useMemoizedFn(
    async (
      messages: ChatMessage["messages"],
      title?: string,
    ): Promise<ChatMessage> => {
      const created = await createChat(messages, title);
      return {
        id: created.id,
        createTime: created.createTime,
        updateTime: created.updateTime,
        messages: created.messages,
        title: created.title,
        promptId: null,
        groupId: null,
        archived: created.archived,
        parentChatId: created.parentChatId,
        branchIndex: created.branchIndex,
      };
    },
  );

  // 外部创建分支回调（用于 ChatContainer）
  const handleExternalCreateBranch = useMemoizedFn(
    async (
      parentChatId: number,
      messages: ChatMessage["messages"],
    ): Promise<ChatMessage> => {
      const created = await createChatBranch(parentChatId, messages);
      return {
        id: created.id,
        createTime: created.createTime,
        updateTime: created.updateTime,
        messages: created.messages,
        title: created.title,
        promptId: null,
        groupId: null,
        archived: created.archived,
        parentChatId: created.parentChatId,
        branchIndex: created.branchIndex,
      };
    },
  );

  // 更新对话消息（用于 ChatContainer）
  const handleUpdateChatMessage = useMemoizedFn(
    async (chat: ChatMessage): Promise<ChatMessage> => {
      const vlChat = chats.find((c) => c.id === chat.id);
      if (!vlChat) {
        throw new Error("Chat not found");
      }
      const updated = await updateChat({
        ...vlChat,
        messages: chat.messages,
        title: chat.title,
        archived: chat.archived,
      });
      return {
        id: updated.id,
        createTime: updated.createTime,
        updateTime: updated.updateTime,
        messages: updated.messages,
        title: updated.title,
        promptId: null,
        groupId: null,
        archived: updated.archived,
        parentChatId: updated.parentChatId,
        branchIndex: updated.branchIndex,
      };
    },
  );

  // 更新当前对话（本地状态）
  const handleUpdateCurrentChat = useMemoizedFn((chat: ChatMessage) => {
    updateCurrentChat({
      id: chat.id,
      projectId,
      createTime: chat.createTime,
      updateTime: chat.updateTime,
      messages: chat.messages,
      title: chat.title,
      archived: chat.archived,
      parentChatId: chat.parentChatId,
      branchIndex: chat.branchIndex,
    });
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

  // 代码块渲染组件
  const CodeBlockRenderer: React.FC<{
    children?: React.ReactNode;
    className?: string;
  }> = ({ children, className, ...rest }) => {
    const { messageMeta } = useMarkdownContext();
    const match = /language-([\w-]+)/.exec(className || "");
    const language = match ? match[1] : undefined;
    const code = String(children).replace(/\n$/, "");

    if (language === "mermaid") {
      return <MermaidRenderer code={code} />;
    }

    if (language === "mind-map") {
      return <MindMapRenderer code={code} />;
    }

    if (language === "white-board") {
      return <WhiteBoardRenderer code={code} />;
    }

    if (language === "html") {
      const trimmedCode = code.trim();
      const isCompleteHtml = /^<!DOCTYPE\s+html>/i.test(trimmedCode);

      if (!isCompleteHtml) {
        return (
          <Suspense fallback={<div>Loading code...</div>}>
            <LazySyntaxHighlighter language="html" {...rest}>
              {code}
            </LazySyntaxHighlighter>
          </Suspense>
        );
      }
    }

    if (language && blockRegistry.isPreviewable(language)) {
      const messageKey = messageMeta
        ? `${messageMeta.chatId}-${messageMeta.messageIndex}`
        : "unknown";
      const blockIndex = messageMeta?.blockIndex ?? 0;
      const idSuffix = Date.now();

      const isGenerating =
        !!messageMeta?.isStreaming &&
        !!messageMeta?.isLastTextBlock &&
        !isCodeBlockCompleted(code, messageMeta?.textContent);

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

      const renderer = blockRegistry.getRenderer(language);
      if (renderer?.extractMetadata) {
        Object.assign(blockData.metadata, renderer.extractMetadata(code));
      }

      return <BlockCard block={blockData} />;
    }

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

  // Markdown 组件配置
  const markdownComponents = useMemo(() => {
    return {
      code: CodeBlockRenderer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: ({ children, href, ...props }: any) => {
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

  // 加载中状态
  if (status === EVLChatStatus.LOADING) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingOutlined />
      </div>
    );
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className="h-full box-border">
        <div className="box-border p-4 h-full flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <ChatDropdownSelector
              chats={chatsAsMessages}
              currentChat={currentChatAsMessage}
              onChatSelect={handleChatSelect}
              onTitleChange={onTitleChange}
              onCreateNewChat={onCreateNewMessage}
              disabled={sendLoading}
              titleRef={editTitleRef}
            />
          </div>

          {(currentChat || (!currentChat && !createMessageLoading)) && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <LoadingOutlined />
                </div>
              }
            >
              <ChatContainer
                ref={chatContainerRef}
                currentChat={currentChatAsMessage}
                isDark={isDark}
                markdownComponents={markdownComponents}
                isVisible={true}
                updateChatMessage={handleUpdateChatMessage}
                updateCurrentChat={handleUpdateCurrentChat}
                sendLoading={sendLoading}
                setSendLoading={setSendLoading}
                titleRef={editTitleRef}
                onCreateNewMessage={onCreateNewMessage}
                createMessageLoading={createMessageLoading}
                onChatCreated={(chatId) => {
                  useVLChatStore.setState({ currentChatId: chatId });
                }}
                hideRagToggle={true}
                hidePromptSelect={true}
                customSystemPrompt={VL_SYSTEM_PROMPT}
                onCreateChat={handleExternalCreateChat}
                onCreateBranch={handleExternalCreateBranch}
              />
            </Suspense>
          )}
        </div>
      </div>
    </MarkdownProvider>
  );
};

export default memo(ChatPanel);
