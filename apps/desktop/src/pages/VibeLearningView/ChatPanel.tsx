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
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import useSettingStore from "@/stores/useSettingStore";

import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { buildSessionAwareSystemPrompt } from "@/constants";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";

import { ResponseMessage, ChatMessage } from "@/types";
import { Role } from "@/constants";
import type { VLResource } from "@/types/vibe-learning";

import useVLChatStore, { EVLChatStatus } from "@/stores/useVLChatStore";
import { useVibeLearningChat } from "./useVibeLearningChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

/**
 * 构建 VL 系统提示词
 * 根据资源列表动态注入项目资源元信息，帮助模型在对话开始时就了解文档结构
 */
const buildVLSystemPrompt = (resources: VLResource[]): string => {
  const basePrompt = `你是一个智能学习助手，专门帮助用户理解和分析他们上传的学习资料。

## 可用工具

- search_project_knowledge: 搜索知识库内容（支持语义搜索，返回相关片段）
- list_project_resources: 列出项目中的所有资源
- read_resource_content: 读取指定资源的内容（大型文档返回摘要索引，包含完整目录和各章节概要描述）
- read_resource_range: 按行范围读取资源的特定部分
- read_resource_chapter: 读取大型分章文档的指定章节
- list_resource_chapters: 列出大型文档的所有章节标题和索引
- deep_read_resource: 对大型文档进行深度阅读分析（开销较大，谨慎使用）

## 大型文档处理策略（重要，优先于搜索）

大型文档已按章节拆分，其摘要索引文件内容很短，包含完整的目录和各章节的概要描述。读取摘要索引的成本很低，但能帮助你建立对整个文档结构的全局理解。

**核心原则：对于大型文档，优先读取摘要索引建立全局理解，再按需读取具体章节，最后才考虑使用搜索。**

1. **先读摘要索引**：使用 read_resource_content 获取摘要索引（内容很短，包含所有章节的标题和概要）
2. **定位相关章节**：根据摘要中的章节描述，判断哪些章节与用户问题相关
3. **读取章节内容**：使用 read_resource_chapter 读取具体章节
4. **搜索补充**：如果章节阅读仍不足以回答，再使用 search_project_knowledge 进行精确搜索
5. **深度分析**：仅在需要跨多个章节综合分析时，使用 deep_read_resource

注意：deep_read_resource 开销较大，仅在以下情况使用：
- 用户明确要求全面分析整个文档
- 搜索和章节阅读无法回答问题
- 需要跨多个章节综合分析

## 搜索策略

当使用搜索工具时，你应该主动将问题改写为多个不同角度的查询，并行搜索以获取充分的资料：

1. **保留原问题**：必须将用户的原问题作为查询之一
2. **补充改写查询**：根据问题的复杂度，额外改写 1-3 个不同角度的查询
3. **并行执行**：同时执行多个搜索查询，一次性获取更全面的资料

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
2. 如果项目包含大型分章文档且问题可能涉及该文档 → 先用 read_resource_content 读取摘要索引，建立全局理解
3. 根据摘要索引定位相关章节 → 用 read_resource_chapter 读取具体章节
4. 如果需要更精确定位或补充信息 → 用 search_project_knowledge 搜索
5. 如果是普通（非大型）文档 → 可直接搜索或读取完整内容
6. 综合所有资料，组织回答

## 工具调用决策

在回答每个问题前，先判断是否需要使用工具：

**应该使用工具的情况：**
- 用户提出了新的话题或新的问题方向
- 你对答案不确定或不够自信
- 之前的对话中没有检索过与当前问题直接相关的资料
- 用户追问的内容需要更详细或更全面的信息
- 涉及具体的数据、定义、步骤等需要精确引用的内容

**可以直接回答的情况：**
- 当前对话中已经检索并获取了充分的相关资料
- 用户在对同一段已检索内容进行追问或澄清
- 简单的总结、解释或格式转换请求

如果不确定是否需要检索，优先选择使用工具。宁可多检索一次，也不要给出不准确的回答。

## 回答要求

- 使用清晰、易懂的语言回答问题
- 必要时使用列表、表格等格式组织信息
- 如果搜索结果确实不足以回答问题，诚实地告知用户
- 当你不确定某个信息是否准确时，应使用工具重新检索确认，而非凭记忆回答`;

  // 动态注入当前项目的资源元信息
  if (resources.length === 0) {
    return basePrompt;
  }

  const hasLargeDoc = resources.some((r) => r.isChunked);
  const resourceLines = resources.map((r) => {
    const typeLabel = r.resourceType;
    if (r.isChunked && r.chapterCount > 0) {
      return `- "${r.name}" (${typeLabel}, 大型分章文档, ${r.chapterCount} 个章节)`;
    }
    return `- "${r.name}" (${typeLabel})`;
  });

  let resourceSection = `\n\n## 当前项目资源\n\n本项目包含以下学习资料：\n${resourceLines.join("\n")}`;

  if (hasLargeDoc) {
    resourceSection +=
      "\n\n> 标记为「大型分章文档」的资源已按章节拆分。建议先使用 read_resource_content 读取其摘要索引，了解文档整体结构和各章节概要后，再针对性地读取章节或搜索。摘要索引内容很短，读取成本极低。";
  }

  return basePrompt + resourceSection;
};

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
  resources: VLResource[];
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  projectId,
  mainDbName,
  resources,
}) => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  // 注册项目专属搜索工具
  useVibeLearningChat(projectId, mainDbName);

  // 根据资源列表动态构建系统提示词
  const systemPrompt = useMemo(
    () => buildVLSystemPrompt(resources),
    [resources],
  );

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
    deleteChat,
    getChildBranchesCount,
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
      deleteChat: state.deleteChat,
      getChildBranchesCount: state.getChildBranchesCount,
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
      return createDefaultChat(systemPrompt);
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
  }, [currentChat, projectId, systemPrompt]);

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

  // 处理对话删除
  const handleChatDelete = useMemoizedFn(async (chatId: number) => {
    try {
      await deleteChat(chatId);
      // deleteChat 内部已经处理了当前对话的切换逻辑
    } catch (error) {
      message.error("删除对话失败");
      console.error(error);
      throw error;
    }
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
    const mermaidRenderPreference = useMermaidRenderPreference();
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

    if (language === "html") {
      const trimmedCode = code.trim();
      const isCompleteHtml = /^<!DOCTYPE\s+html>/i.test(trimmedCode);

      if (!isCompleteHtml) {
        return (
          <LazySyntaxHighlighter language="html" isDark={isDark} {...rest}>
            {code}
          </LazySyntaxHighlighter>
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
        <LazySyntaxHighlighter language={language} isDark={isDark} {...rest}>
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
              onChatDelete={handleChatDelete}
              getChildBranchesCount={getChildBranchesCount}
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
                chatScope={`vibe-chat:${projectId}`}
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
                customSystemPrompt={systemPrompt}
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
