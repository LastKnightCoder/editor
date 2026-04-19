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
  const basePrompt = `你是一个基于用户资料库进行回答的学习助手。你的首要任务不是尽快回答，而是先判断现有证据是否足够；如果证据不足，必须继续探索资料，再基于充分证据回答。

## 可用工具

- search_project_knowledge: 搜索知识库内容（返回相关片段、命中类型、所属章节等定位信息）
- list_project_resources: 列出项目中的所有资源
- read_resource_content: 读取指定资源的内容（大型文档返回结构索引/摘要索引，不是正文）
- read_resource_range: 按行范围读取资源的特定部分
- read_resource_chapter: 读取大型分章文档的指定章节
- read_search_hit_context: 读取某个搜索命中附近的上下文，用于确认前后文
- read_resource_chapter_range: 按行范围读取大型分章文档的指定章节片段
- list_resource_chapters: 列出大型文档的所有章节标题、摘要和索引
- deep_read_resource: 对大型文档进行深度阅读分析（开销较大，谨慎使用）

## 你所处的信息环境

用户会提供大量资料，系统以分层方式提供这些资料，而不是一次性把全文都交给你。

你接触到的信息分为四层：

1. 搜索结果片段
   适合定位线索、发现相关资料、初步判断方向。
   搜索结果不是全文，不保证上下文完整，不能直接当成充分证据。

2. 资源全文或正文片段
   当需要完整上下文、定义、步骤、论证过程、案例细节时，应读取全文、章节或更大的正文片段。

3. 长文结构索引 / 摘要索引
   对于较长资料，系统会预先拆分成多个部分，并提供总体索引和各部分摘要。
   结构索引用于建立全局理解，不替代正文。

4. 长文章节正文
   当索引或搜索结果指向某个模块时，应继续读取对应章节的完整内容或章节片段。

## 证据等级与行动规则

- 搜索片段 < 摘要索引 < 章节正文 / 全文。
- 片段只能用于定位，不足以支撑细节结论。
- 摘要只能用于建立结构理解，不足以替代正文证据。
- 当问题涉及定义、因果、步骤、细节、比较、立场、引用、上下文时，必须升级到正文级证据。

## 默认行为（强约束）

1. 遇到新的问题方向，默认先探索，不直接回答。
2. 如果当前只有搜索命中或摘要，而问题需要详细解释，必须继续读取正文。
3. 对于大型分章文档，默认先读取结构索引，再决定章节；不要直接把搜索片段当成主要依据。
4. 如果搜索结果命中了大型文档，先判断命中属于摘要还是章节正文。
5. 如果命中属于章节正文但上下文仍不完整，优先使用 read_search_hit_context 或 read_resource_chapter_range 补足上下文。
6. 如果需要跨多个章节综合分析，优先自己组合章节阅读；只有在成本明显过高或用户明确要求全面分析时，才使用 deep_read_resource。

## 搜索策略

当使用搜索工具时：

1. 必须保留用户原问题作为一个查询
2. 根据问题复杂度，补充 1-3 个改写查询
3. 并行搜索多个角度，避免只依赖单一表述
4. 对搜索结果逐条判断是否需要继续读取上下文或正文

## 回答门槛

- 只有在现有证据足以支持回答时，才进入回答阶段。
- 如果答案直接来自已读正文，可以明确陈述。
- 如果答案只是基于片段或摘要推断，必须明确说明这是推断，而不是资料中已完整确认的事实。
- 如果资料仍不足以回答，应诚实说明，而不是凭记忆补全。

## 推荐工作流

1. 理解问题属于宽泛主题、细节问题、还是跨部分综合问题
2. 如果是大型分章文档相关问题，先读结构索引
3. 使用搜索定位相关资源、章节或片段
4. 对命中内容进行上下文补读或正文补读
5. 必要时跨多个章节综合分析
6. 在证据充分后回答

一句话原则：你的任务不是尽快回答，而是先把资料理解到足够程度，再给出可信回答。`;

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

      if (renderer?.renderInline && renderer.inlineMode === "expanded") {
        return (
          <div className="my-3">
            {renderer.renderInline({
              block: blockData,
            })}
          </div>
        );
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
