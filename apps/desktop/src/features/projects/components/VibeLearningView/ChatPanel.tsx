/**
 * 对话面板
 * 基于 Vibe Learning 项目资源进行对话
 * 复用 ChatSidebar 的 ChatContainer 和 ChatDropdownSelector 组件
 */

import { useState, useMemo, memo, lazy, Suspense, useRef, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";

import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";

import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { buildSessionAwareSystemPrompt } from "@/constants";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";

import { ResponseMessage, ChatMessage } from "@/types";
import { Role } from "@/constants";
import type { VLResource } from "@/types/vibe-learning";

import useVLChatStore, { EVLChatStatus } from "@/stores/useVLChatStore";
import { useVibeLearningChat } from "./useVibeLearningChat";
import { Loading, cn, toast } from "@tau/ui";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

/**
 * 构建 VL 系统提示词
 * 根据资源列表动态注入项目资源元信息，帮助模型在对话开始时就了解文档结构
 */
const buildVLSystemPrompt = (resources: VLResource[]): string => {
  const basePrompt = `你是一个基于用户资料库进行回答的学习助手。你的首要任务不是尽快回答，而是先判断现有证据是否足够；如果证据不足，必须继续探索资料，再基于充分证据回答。

## 可用工具

- vibe_learning_query: 统一执行资源列出、语义搜索、精确搜索、预览读取、按行/字符范围补读和批量搜索/补读；通过 operation 和 input 参数选择具体操作
- subagent_research: 全局工具；适合把复杂资料搜集拆成多个并行子任务，降低主 Agent 上下文压力

## 你所处的信息环境

用户会提供大量资料，系统通过本地 Markdown、语义搜索、grep 和范围读取提供这些资料，而不是一次性把全文都交给你。

你接触到的信息分为四层：

1. 搜索结果片段
   适合定位线索、发现相关资料、初步判断方向。
   搜索结果不是全文，不保证上下文完整，不能直接当成充分证据。

2. 原文范围片段
   当需要完整上下文、定义、步骤、论证过程、案例细节时，应根据行号或字符范围读取原文片段。

3. 资源开头内容
   read_resource_content 可能因长文限制而截断，只适合快速预览，不替代基于定位范围的原文确认。

## 证据等级与行动规则

- 搜索片段 < 截断预览 < 按行/字符范围读取到的原文。
- 片段只能用于定位，不足以支撑细节结论。
- 当问题涉及定义、因果、步骤、细节、比较、立场、引用、上下文时，必须升级到原文范围证据。

## 默认行为（强约束）

1. 遇到新的问题方向，默认先探索，不直接回答。
2. 对复杂问题，通过 vibe_learning_query 的 operation 组合搜索、定位和补读步骤。
3. 如果当前只有搜索命中，而问题需要详细解释，必须继续读取原文范围。
4. 对于长文档，默认先用 vibe_learning_query 的 search 或 grep 定位，再用 read_lines/read_range 补足上下文。
5. 如果资料搜集会跨多个主题或多个查询角度，并且预计链路较长，优先使用 subagent_research 分流搜集任务；主 Agent 重点负责整合，而不是自己串长链路搜索。

## 搜索策略

当使用搜索工具时：

1. 先自己决定查询角度；如果问题简单，可以直接用用户原问题搜索
2. 如果一次搜索不够，再用 vibe_learning_query 的 search 或 batch_search 补充不同表述、不同术语或不同约束
3. 搜索命中后先看 resourceId、chunkStartLine/chunkEndLine、startOffset/endOffset，再用 vibe_learning_query 的 read_lines 或 read_range 补读
5. 当预计会产生大量搜索命中、上下文补读或并行查证需求时，应优先把资料搜集拆给 subagent_research，再由主 Agent 汇总
6. 在准备回答前，确认已经拿到原文范围证据，而不只是搜索片段

## 回答门槛

- 只有在现有证据足以支持回答时，才进入回答阶段。
- 如果答案直接来自已读正文，可以明确陈述。
- 如果答案只是基于片段推断，必须明确说明这是推断，而不是资料中已完整确认的事实。
- 如果资料仍不足以回答，应诚实说明，而不是凭记忆补全。

## 推荐工作流

1. 理解问题属于宽泛主题、细节问题、还是跨部分综合问题
2. 直接用 vibe_learning_query 的 search、grep 或 batch_search 定位
3. 根据返回的行号或字符范围补读原文上下文
4. 对命中内容进行上下文补读或正文补读
5. 如果搜集路径明显会变长、需要跨章节/跨主题并行查证，优先用 subagent_research 分流资料搜集
6. 在证据充分后回答

一句话原则：你的任务不是尽快回答，而是先把资料理解到足够程度，再给出可信回答。`;

  // 动态注入当前项目的资源元信息
  if (resources.length === 0) {
    return basePrompt;
  }

  const resourceLines = resources.map(r => {
    const typeLabel = r.resourceType;
    return `- "${r.name}" (${typeLabel}, resourceId: ${r.id})`;
  });

  let resourceSection = `\n\n## 当前项目资源\n\n本项目包含以下学习资料：\n${resourceLines.join("\n")}`;
  resourceSection +=
    "\n\n> 长文档请先使用 vibe_learning_query 的 search 或 grep 定位，再用 read_lines 或 read_range 补读原文上下文。优先使用 resourceId 作为稳定定位锚点。";

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

interface ChatPanelProps {
  projectId: number;
  mainDbName: string;
  resources: VLResource[];
  /** 停靠在阅读区右侧（窄栏）；否则占满纸面中间 */
  docked?: boolean;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ projectId, mainDbName, resources, docked }) => {
  const { isDark } = useTheme();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore(state => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  // 注册项目专属搜索工具（只给本页对话）
  const toolScope = useVibeLearningChat(projectId, mainDbName);

  // 根据资源列表动态构建系统提示词
  const systemPrompt = useMemo(() => buildVLSystemPrompt(resources), [resources]);

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
    useShallow(state => ({
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
    }))
  );

  // 初始化对话数据
  useEffect(() => {
    if (isConnected && projectId) {
      initChats(projectId);
    }
  }, [initChats, isConnected, database, projectId]);

  // 当前对话
  const currentChat = useMemo(() => {
    return chats.find(chat => chat.id === currentChatId);
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
    return chats.map(chat => ({
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
      toast.error("创建对话失败");
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
      toast.error("更新标题失败");
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
      toast.error("删除对话失败");
      console.error(error);
      throw error;
    }
  });

  // 外部创建对话回调（用于 ChatContainer）
  const handleExternalCreateChat = useMemoizedFn(
    async (messages: ChatMessage["messages"], title?: string): Promise<ChatMessage> => {
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
    }
  );

  // 外部创建分支回调（用于 ChatContainer）
  const handleExternalCreateBranch = useMemoizedFn(
    async (parentChatId: number, messages: ChatMessage["messages"]): Promise<ChatMessage> => {
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
    }
  );

  // 更新对话消息（用于 ChatContainer）
  const handleUpdateChatMessage = useMemoizedFn(async (chat: ChatMessage): Promise<ChatMessage> => {
    const vlChat = chats.find(c => c.id === chat.id);
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
  });

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

  // 代码 / 链接渲染与对话页共用（D-048）；可预览块走 BlockPreview 上下文
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "vl-block" });

  // 加载中状态
  if (status === EVLChatStatus.LOADING) {
    return <Loading minHeight={0} />;
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className="box-border h-full min-h-0">
        <div className={cn("box-border flex h-full flex-col pb-3", docked ? "px-3" : "px-5")}>
          <div className="flex h-[52px] shrink-0 items-center justify-between">
            <ChatDropdownSelector
              chatSource="vibe-learning-chat"
              chats={chatsAsMessages}
              currentChat={currentChatAsMessage}
              onChatSelect={handleChatSelect}
              onTitleChange={onTitleChange}
              onChatDelete={handleChatDelete}
              getChildBranchesCount={getChildBranchesCount}
              titleRef={editTitleRef}
            />
          </div>

          {(currentChat || (!currentChat && !createMessageLoading)) && (
            <Suspense fallback={<Loading minHeight={0} />}>
              <ChatContainer
                ref={chatContainerRef}
                currentChat={currentChatAsMessage}
                isDark={isDark}
                markdownComponents={markdownComponents}
                isVisible={true}
                chatScope={`vibe-learning-chat:${projectId}`}
                toolScope={toolScope}
                updateChatMessage={handleUpdateChatMessage}
                updateCurrentChat={handleUpdateCurrentChat}
                sendLoading={sendLoading}
                setSendLoading={setSendLoading}
                titleRef={editTitleRef}
                onCreateNewMessage={onCreateNewMessage}
                createMessageLoading={createMessageLoading}
                onChatCreated={chatId => {
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
