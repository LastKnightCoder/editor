import { useState, useCallback, useMemo, useEffect, useRef, type Ref } from "react";
import { IconButton, toast } from "@tau/ui";
import { SquarePen } from "lucide-react";
import type { ChatDropdownItem } from "@tau/shared";
import { useConfirmPrompt } from "../../../../hooks/useConfirmPrompt";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import {
  COMPOSER_ANCHOR_ATTR,
  ChatInputArea,
  useChatAutoScroll,
  type ChatInputAreaProps,
  type ChatInputAreaHandle,
  type MessageContentItem,
  type ThinkingLevel,
} from "@tau/shared";
import { ChatContainerCore, type ChatContainerCoreHandle } from "@tau/chat-ui";
import { useAiChat } from "../../../../hooks/useAiChat";
import { useChatSessions } from "../../../../hooks/useChatSessions";
import { useLlmConfigs } from "../../../../hooks/useLlmConfigs";
import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import { useSkills } from "../../../../hooks/useSkills";
import { buildSessionAwareSystemPrompt } from "../../../../utils/systemPrompt";
import ChatMessage from "../../../../components/ChatMessage";
import ToolApprovalBar from "../../../../components/ToolApprovalBar";
import { useRunInteractionStore } from "../../../../stores/useRunInteractionStore";
import ChatDropdownSelector from "../../../../components/ChatDropdownSelector";
import { useIsDark } from "../../../../stores/useExtensionTheme";
import { useChatInputServices } from "../../../../hooks/useChatInputServices";
import { SubpageHeader } from "../SubpageHeader";
import type { ChatMessageType } from "@tau/shared";

export interface ChatPageProps {
  wsClient: WebSocketClient | null;
  url: string | null;
  onBack: () => void;
  additionalSystemPrompt?: string;
  /** 从本页流的输入框带进来的消息：就绪后发进当前对话，只发一次 */
  pendingMessage?: MessageContentItem[] | null;
  onPendingConsumed?: () => void;
}

/** 对话二级页：当前网页的对话（会话按页面存于桌面），顶栏切换 / 新建对话 */
export default function ChatPage({
  wsClient,
  url,
  onBack,
  additionalSystemPrompt,
  pendingMessage,
  onPendingConsumed,
}: ChatPageProps) {
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("off");
  const { confirm: confirmPrompt, confirmDialog } = useConfirmPrompt();

  const isDark = useIsDark();

  const { client: aiWsClient, status: aiWsStatus } = useAiServerWebSocket();

  const {
    llmConfigs,
    currentModelName,
    isSupportImage,

    setLlmUsage,
    currentProviderConfig,
    currentModelConfig,
  } = useLlmConfigs(aiWsClient);
  const { skills } = useSkills(aiWsClient);
  const coreRef = useRef<ChatContainerCoreHandle>(null);
  const {
    containerRef: messagesContainerRef,
    enableAutoScroll,
    forceScrollToBottom,
    scrollToBottom,
  } = useChatAutoScroll<HTMLDivElement>({
    scrollToBottomImpl: () => {
      if (!coreRef.current) {
        return false;
      }
      coreRef.current.scrollToBottom();
      return true;
    },
  });

  const {
    sessions,
    currentSession,
    messages,
    isLoading: isSessionsLoading,
    createSession,
    deleteSession,
    updateSessionTitle,
    selectSession,
    reloadCurrent,
    deleteMessage,
    rewindBefore,
    createBranch,
    switchVersion,
  } = useChatSessions(url);

  const conversationKey = useMemo(
    () => `${url || "unknown-url"}::${currentSession?.id || "no-session"}`,
    [url, currentSession?.id]
  );

  const defaultSystemPrompt = `你是一个智能助手，可以帮助用户理解和分析当前网页内容。
当前用户正在浏览网页，你可以使用工具获取页面内容来帮助回答问题。
请用简洁清晰的中文回答问题。`;

  const skillPrompt = useMemo(() => {
    if (skills.length === 0) {
      return "";
    }
    const skillsList = skills
      .map(
        skill =>
          `${skill.folderName} metadata:
  - Name: ${skill.name}
  - Description: ${skill.description || "无描述"}
  - Path: ${skill.path}`
      )
      .join("\n\n");
    return `\n以下是可用 Skills，当用户需求匹配对应场景时请优先调用相关工具：\n\n${skillsList}`;
  }, [skills]);

  const effectiveSystemPrompt = useMemo(() => {
    const promptParts = [defaultSystemPrompt];
    if (skillPrompt.trim()) {
      promptParts.push(skillPrompt.trim());
    }
    if (additionalSystemPrompt?.trim()) {
      promptParts.push(additionalSystemPrompt.trim());
    }
    return promptParts.join("\n\n");
  }, [defaultSystemPrompt, skillPrompt, additionalSystemPrompt]);

  // system prompt 每轮由桌面替换进会话（不再在消息里存快照）；时间上下文按对话固定，
  // 同一对话内 system 段不变，提示缓存才不会每轮失效
  const sessionSystemPrompt = useMemo(
    () => buildSessionAwareSystemPrompt(effectiveSystemPrompt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveSystemPrompt, currentSession.id]
  );

  const aiSession = useMemo(
    () => (url ? { id: currentSession.id, pageUrl: url } : undefined),
    [url, currentSession.id]
  );

  const {
    messages: liveMessages,
    isLoading,
    error,
    isConnected,
    sendMessage,
    sendRequestMessage,
    stopGeneration,
    retryStatus,
    interactions,
    approveTool,
    answerQuestion,
  } = useAiChat({
    thinkingLevel,
    enableTools: true,
    conversationKey,
    systemPrompt: sessionSystemPrompt,
    initialMessages: messages,
    ...(aiSession ? { session: aiSession } : {}),
    // 一轮结束：以桌面会话文件的投影为准（流式期间是本地归约的快照）
    onFinish: () => void reloadCurrent(),
    wsClient: aiWsClient,
    wsConnected: aiWsStatus === "connected",
  });

  // 宿主等待的交互（提问、审批）同步给工具卡渲染器：提问卡按 toolCallId 读、作答发回这一轮
  useEffect(() => {
    useRunInteractionStore.setState({
      approvals: interactions.approvals,
      questions: interactions.questions,
      answer: answerQuestion,
      approve: approveTool,
    });
  }, [interactions, answerQuestion, approveTool]);
  useEffect(
    () => () =>
      useRunInteractionStore.setState({
        approvals: [],
        questions: [],
        answer: null,
        approve: null,
      }),
    []
  );

  const modelSelectItems: ChatDropdownItem[] = useMemo(() => {
    return llmConfigs.flatMap(provider => [
      {
        key: `provider-${provider.id}`,
        label: provider.name,
        group: true,
      },
      ...(provider.models || []).map(model => ({
        key: `${provider.id}::${model.id}`,
        label: model.name ?? model.id,
      })),
    ]);
  }, [llmConfigs]);

  const currentModelKey =
    currentProviderConfig && currentModelConfig
      ? `${currentProviderConfig.id}::${currentModelConfig.id}`
      : undefined;

  const handleModelSelect = useCallback(
    async ({ key }: { key: string }) => {
      // 模型 id 自身可能含冒号（如 qwen2.5:7b），只按第一个分隔符切
      const separator = key.indexOf("::");
      if (separator <= 0) return;
      const providerId = key.slice(0, separator);
      const modelId = key.slice(separator + 2);
      if (!modelId) return;
      try {
        await setLlmUsage(providerId, modelId);
      } catch (err) {
        console.error("设置模型失败:", err);
        toast.error("设置模型失败");
      }
    },
    [setLlmUsage]
  );

  const handleMcpManagerClick = useCallback(async () => {
    if (!aiWsClient?.isConnected) {
      toast.warning("桌面端未连接，无法打开 MCP 管理中心");
      return;
    }

    try {
      await aiWsClient.sendRequest("mcp.manager.open", {});
    } catch (error) {
      console.error("打开 MCP 管理中心失败:", error);
      toast.error("打开 MCP 管理中心失败");
    }
  }, [aiWsClient]);

  const handleDeleteMessage = useCallback(
    (messageIndex: number) => {
      if (isLoading) return;
      void deleteMessage(messageIndex);
    },
    [deleteMessage, isLoading]
  );

  // 重新生成：桌面把会话回退到这条用户消息之前，再以原内容重发
  const handleRegenerateMessage = useCallback(
    (messageIndex: number) => {
      if (isLoading) return;
      const target = messages[messageIndex] as ChatMessageType & {
        requestContent?: MessageContentItem[];
      };
      if (target?.role !== "user") return;
      const content =
        target.requestContent && target.requestContent.length > 0
          ? target.requestContent
          : target.content;
      void (async () => {
        const baseMessages = await rewindBefore(messageIndex);
        if (!baseMessages) return;
        if (typeof content === "string") {
          await sendMessage(content, baseMessages);
          return;
        }
        await sendRequestMessage({ requestMessage: { role: "user", content }, baseMessages });
      })();
    },
    [isLoading, messages, rewindBefore, sendMessage, sendRequestMessage]
  );

  // 从这里建分支（M4-d）：回到这条回答之后，接下来发的消息成为新版本
  const handleCreateBranch = useCallback((messageIndex: number) => {
    if (isLoading) return;
    if (messageIndex === messages.length - 1) {
      toast.info("已经是最新的回答，直接发送消息即可继续");
      return;
    }
    void createBranch(messageIndex).then(ok => {
      if (ok) toast.success("已从这里分叉，发送的消息会成为新分支");
    });
  }, []);

  const handleSwitchVersion = useCallback(
    (messageIndex: number, versionIndex: number) => {
      if (isLoading) return;
      void switchVersion(messageIndex, versionIndex);
    },
    [isLoading, switchVersion]
  );

  const handleDeleteConfirm = useCallback(
    () =>
      confirmPrompt({
        title: "删除消息",
        description: "删除后无法恢复",
        danger: true,
        confirmText: "删除",
      }),
    [confirmPrompt]
  );

  const chatInputServices = useChatInputServices(aiWsClient);

  const handleSendMessageContent = useCallback(
    (content: MessageContentItem[]) => {
      void sendRequestMessage({
        requestMessage: {
          role: "user",
          content,
        },
      });
    },
    [sendRequestMessage]
  );

  const handleUserSend = useCallback(() => {
    enableAutoScroll();
    setTimeout(forceScrollToBottom, 0);
  }, [enableAutoScroll, forceScrollToBottom]);

  // 本页流输入框带进来的消息：会话与连接都就绪后发出
  const pendingSentRef = useRef(false);
  useEffect(() => {
    if (!pendingMessage?.length || pendingSentRef.current) return;
    if (isSessionsLoading || !isConnected) return;
    pendingSentRef.current = true;
    handleUserSend();
    handleSendMessageContent(pendingMessage);
    onPendingConsumed?.();
  }, [
    handleSendMessageContent,
    handleUserSend,
    isConnected,
    isSessionsLoading,
    onPendingConsumed,
    pendingMessage,
  ]);

  const chatTitle = isSessionsLoading ? (
    "对话"
  ) : (
    <ChatDropdownSelector
      chats={sessions}
      currentChat={currentSession}
      onChatSelect={selectSession}
      onTitleChange={title => updateSessionTitle(currentSession.id, title)}
      onChatDelete={deleteSession}
    />
  );

  useEffect(() => {
    setTimeout(forceScrollToBottom, 100);
  }, [currentSession?.id, forceScrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(scrollToBottom, 0);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  return (
    <div className="flex h-full flex-col">
      {confirmDialog}
      <SubpageHeader
        title={chatTitle}
        onBack={onBack}
        actions={
          <IconButton
            aria-label="新建对话"
            title="新建对话"
            className="size-8"
            onClick={() => void createSession()}
          >
            <SquarePen size={16} strokeWidth={1.75} />
          </IconButton>
        }
      />
      <ChatContainerCore
        ref={coreRef}
        isConnected={isConnected}
        messages={liveMessages}
        isLoading={isLoading}
        error={error}
        retryStatus={
          retryStatus ? { attempt: retryStatus.attempt, maxRetries: retryStatus.maxAttempts } : null
        }
        thinkingLevel={thinkingLevel}
        onThinkingLevelChange={setThinkingLevel}
        thinkingLevelDisabled={!currentModelConfig?.reasoning}
        currentModelName={currentModelName}
        modelSelectItems={modelSelectItems}
        onModelSelect={handleModelSelect}
        isSupportImage={isSupportImage}

        createMessageLoading={false}
        onCreateNewMessage={createSession}
        onMcpManagerClick={handleMcpManagerClick}
        currentPageUrl={url}
        onSendMessageContent={handleSendMessageContent}
        onUserSend={handleUserSend}
        onStopGeneration={stopGeneration}
        messagesContainerRef={messagesContainerRef}
        messagesContainerClassName="tau-scrollbar border-t-12 border-b-12 border-transparent px-4 py-1 flex-1 min-h-0 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
        renderInputWrapper={inputNode => (
          // 外框与桌面对话输入框一致；＋ 面板按它的矩形定位（同宽、贴上沿）
          <div
            {...{ [COMPOSER_ANCHOR_ATTR]: "" }}
            className="border-line-1 bg-surface ease-tau-out focus-within:border-accent relative m-2 mt-3 flex-none rounded-[16px] border pb-2.5 pl-3.5 pr-2.5 pt-3 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]"
          >
            {inputNode}
          </div>
        )}
        renderChatInputArea={({ chatInputRef, inputProps }) => {
          const resolvedProps = inputProps as ChatInputAreaProps;
          return (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <ToolApprovalBar approvals={interactions.approvals} onDecide={approveTool} />
                <ChatInputArea
                  ref={chatInputRef as Ref<ChatInputAreaHandle>}
                  className="min-w-0 flex-1"
                  {...resolvedProps}
                  currentModelKey={currentModelKey}
                  services={chatInputServices}
                />
              </div>
            </div>
          );
        }}
        renderMessage={({ message, messageIndex }) => (
          <div key={message.id} className="py-3">
            <ChatMessage
              message={message as ChatMessageType}
              messageIndex={messageIndex}
              isDark={isDark}
              wsClient={aiWsClient}
              onDeleteMessage={handleDeleteMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onCreateBranch={handleCreateBranch}
              {...(!isLoading ? { onSwitchVersion: handleSwitchVersion } : {})}
              onDeleteConfirm={handleDeleteConfirm}
            />
          </div>
        )}
      />
    </div>
  );
}
