import { useState, useCallback, useMemo, useEffect, useRef, type Ref } from "react";
import { App, Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { Bot, Check, Cpu } from "lucide-react";
import type WebSocketClient from "../../../../utils/WebSocketClient";
import {
  ChatInputArea,
  ChatContainerCore,
  type ChatContainerCoreHandle,
  useChatAutoScroll,
  type ChatInputAreaProps,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
  type MessageContentItem,
  type ReasoningEffort,
} from "@tau/shared";
import { fetchCodexAvailabilityViaRpc, useAiChat } from "../../../../hooks/useAiChat";
import type {
  AiChatRequestMessage,
  ChatAgentType,
  CodexAvailability,
} from "../../../../hooks/useAiChat";
import { useChatSessions } from "../../../../hooks/useChatSessions";
import { useLlmConfigs } from "../../../../hooks/useLlmConfigs";
import { useAiServerWebSocket } from "../../../../hooks/useAiServerWebSocket";
import { useSkills } from "../../../../hooks/useSkills";
import {
  ASK_QUESTION_TOOL_NAME,
  buildAskQuestionToolResult,
} from "../../../../tools/askQuestionTypes";
import { useAskQuestionSessionStore } from "../../../../tools/askQuestionSessionStore";
import { buildSessionAwareSystemPrompt } from "../../../../utils/systemPrompt";
import ChatMessage from "../../../../components/ChatMessage";
import ChatDropdownSelector from "../../../../components/ChatDropdownSelector";
import { useTheme } from "../../../../hooks/useTheme";
import { useThemeStore } from "../../../../stores/useThemeStore";
import type { ChatMessageType, ToolCallExecutionState, ToolCallPayload } from "@tau/shared";
import classNames from "classnames";

export interface ChatTabProps {
  wsClient: WebSocketClient | null;
  url: string | null;
  additionalSystemPrompt?: string;
}

const normalizeAskQuestionExecutionInput = (input: string) => {
  try {
    return JSON.stringify(JSON.parse(input));
  } catch {
    return input.trim();
  }
};

const isMatchedAskQuestionExecution = (
  execution: ToolCallExecutionState,
  toolCallId: string,
  expectedInput: string
) =>
  execution.toolCallId === toolCallId &&
  execution.toolName === ASK_QUESTION_TOOL_NAME &&
  normalizeAskQuestionExecutionInput(execution.input) ===
    normalizeAskQuestionExecutionInput(expectedInput);

const markAskQuestionExecutionResolved = (
  targetMessages: ChatMessageType[],
  toolCallId: string,
  expectedInput: string,
  output: string
) => {
  const now = Date.now();
  return targetMessages.map(message => {
    if (message.role !== "assistant" || !message.contentBlocks?.length) {
      return message;
    }

    let changed = false;
    const nextBlocks = message.contentBlocks.map(block => {
      if (block.type !== "tool_calls") {
        return block;
      }

      let blockChanged = false;
      const nextExecutions = block.executions.map(execution => {
        if (!isMatchedAskQuestionExecution(execution, toolCallId, expectedInput)) {
          return execution;
        }
        blockChanged = true;
        return {
          ...execution,
          status: "success" as const,
          output,
          duration:
            execution.duration || (execution.timestamp ? now - execution.timestamp : undefined),
        };
      });

      if (!blockChanged) {
        return block;
      }
      changed = true;
      return {
        ...block,
        executions: nextExecutions as ToolCallExecutionState[],
      };
    });

    if (!changed) {
      return message;
    }
    return {
      ...message,
      contentBlocks: nextBlocks,
    };
  });
};

export default function SharedChatTab({ wsClient, url, additionalSystemPrompt }: ChatTabProps) {
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("none");
  const { message: antdMessage, modal } = App.useApp();
  const [codexAvailability, setCodexAvailability] = useState<CodexAvailability>({
    available: false,
    reason: null,
  });

  const { themeMode } = useThemeStore();
  const resolvedTheme = useTheme(themeMode);
  const isDark = resolvedTheme === "dark";

  const { client: aiWsClient, status: aiWsStatus } = useAiServerWebSocket();

  const {
    llmConfigs,
    currentModelName,
    isSupportImage,
    isSupportFile,
    setLlmUsage,
    currentModelConfig,
  } = useLlmConfigs(aiWsClient);
  const { skills } = useSkills(aiWsClient);
  const askQuestionRecords = useAskQuestionSessionStore(state => state.records);
  const completeAskQuestionSession = useAskQuestionSessionStore(state => state.completeSession);
  const resumingAskQuestionRef = useRef<Set<string>>(new Set());
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
    ensureSessionSystemPrompt,
    updateCurrentSessionAgentType,
    updateCurrentSessionAgentSessionId,
    deleteSession,
    updateSessionTitle,
    selectSession,
    saveMessages,
    getChildBranchesCount,
    deleteMessage,
    regenerateMessage,
    createBranch,
  } = useChatSessions(url);

  const conversationKey = useMemo(
    () => `${url || "unknown-url"}::${currentSession?.id || "no-session"}`,
    [url, currentSession?.id]
  );
  const selectedAgentType: ChatAgentType =
    codexAvailability.available && currentSession.agentType === "codex" ? "codex" : "local";
  const isCodexAgent = selectedAgentType === "codex";

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

  const sessionSystemPrompt = useMemo(() => {
    return (
      currentSession.systemPromptSnapshot || buildSessionAwareSystemPrompt(effectiveSystemPrompt)
    );
  }, [currentSession.systemPromptSnapshot, effectiveSystemPrompt]);

  useEffect(() => {
    if (!currentSession?.id || !effectiveSystemPrompt.trim()) {
      return;
    }
    if (currentSession.systemPromptSnapshot) {
      return;
    }

    void ensureSessionSystemPrompt(
      currentSession.id,
      buildSessionAwareSystemPrompt(effectiveSystemPrompt)
    );
  }, [
    currentSession?.id,
    currentSession.systemPromptSnapshot,
    effectiveSystemPrompt,
    ensureSessionSystemPrompt,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (aiWsStatus !== "connected" || !aiWsClient) {
      setCodexAvailability({ available: false, reason: null });
      return;
    }

    void fetchCodexAvailabilityViaRpc(aiWsClient)
      .then(availability => {
        if (!cancelled) {
          setCodexAvailability(availability);
        }
      })
      .catch(error => {
        console.warn("查询 Codex 可用性失败:", error);
        if (!cancelled) {
          setCodexAvailability({
            available: false,
            reason: error instanceof Error ? error.message : "Codex 可用性未知",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [aiWsClient, aiWsStatus]);

  const handleAgentSessionIdChange = useCallback(
    (agentSessionId: string | null) => {
      if (selectedAgentType !== "codex") {
        return;
      }
      void updateCurrentSessionAgentSessionId(agentSessionId);
    },
    [selectedAgentType, updateCurrentSessionAgentSessionId]
  );

  const {
    isLoading,
    error,
    isConnected,
    sendMessage,
    sendRequestMessage,
    clearMessages,
    stopGeneration,
  } = useAiChat({
    enableTools: true,
    agentType: selectedAgentType,
    agentSessionId: isCodexAgent ? (currentSession.agentSessionId ?? null) : null,
    onAgentSessionIdChange: handleAgentSessionIdChange,
    conversationKey,
    systemPrompt: sessionSystemPrompt,
    initialMessages: messages,
    onMessagesChange: saveMessages,
    wsClient: aiWsClient,
    wsConnected: aiWsStatus === "connected",
  });

  const modelSelectItems: MenuProps["items"] = useMemo(() => {
    if (isCodexAgent) {
      return [];
    }
    return llmConfigs.flatMap(provider => [
      {
        key: `provider-${provider.id}`,
        label: provider.name,
        type: "group" as const,
      },
      ...(provider.models || []).map(model => ({
        key: `${provider.id}:${model.name}`,
        label: model.name,
      })),
    ]);
  }, [isCodexAgent, llmConfigs]);

  const handleModelSelect = useCallback(
    async ({ key }: { key: string }) => {
      const [providerId, modelName] = key.split(":");
      if (!providerId || !modelName) return;
      try {
        await setLlmUsage(providerId, modelName);
      } catch (err) {
        console.error("设置模型失败:", err);
        antdMessage.error("设置模型失败");
      }
    },
    [setLlmUsage, antdMessage]
  );

  const handleMcpManagerClick = useCallback(async () => {
    if (!aiWsClient?.isConnected) {
      antdMessage.warning("桌面端未连接，无法打开 MCP 管理中心");
      return;
    }

    try {
      await aiWsClient.sendRequest("mcp.manager.open", {});
    } catch (error) {
      console.error("打开 MCP 管理中心失败:", error);
      antdMessage.error("打开 MCP 管理中心失败");
    }
  }, [aiWsClient, antdMessage]);

  const handleAgentTypeChange = useCallback(
    async (agentType: ChatAgentType) => {
      if (agentType === "codex" && !codexAvailability.available) {
        return;
      }
      if (messages.length > 0 || isLoading) {
        return;
      }
      await updateCurrentSessionAgentType(agentType);
    },
    [codexAvailability.available, isLoading, messages.length, updateCurrentSessionAgentType]
  );

  const agentTypeToolbar = useMemo(() => {
    if (!codexAvailability.available) {
      return null;
    }

    const disabled = messages.length > 0 || isLoading;
    const items: MenuProps["items"] = [
      {
        key: "local",
        label: (
          <span className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5" />
            <span>本地代理</span>
            {selectedAgentType === "local" && <Check className="h-3.5 w-3.5" />}
          </span>
        ),
      },
      {
        key: "codex",
        label: (
          <span className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            <span>Codex</span>
            {selectedAgentType === "codex" && <Check className="h-3.5 w-3.5" />}
          </span>
        ),
      },
    ];

    return (
      <Dropdown
        menu={{
          items,
          onClick: ({ key }) => {
            void handleAgentTypeChange(key as ChatAgentType);
          },
        }}
        trigger={["click"]}
        disabled={disabled}
      >
        <Tooltip title={disabled ? "已有消息后不能切换代理" : "选择聊天代理"}>
          <Button
            type="text"
            size="small"
            disabled={disabled}
            icon={
              selectedAgentType === "codex" ? (
                <Bot className="h-4 w-4" />
              ) : (
                <Cpu className="h-4 w-4" />
              )
            }
            className="p-1! bg-none! border-none! hover:!bg-gray-100! dark:hover:!bg-white/10! text-gray-600! dark:text-gray-400!"
          >
            <span className="text-xs font-medium">
              {selectedAgentType === "codex" ? "Codex" : "本地"}
            </span>
          </Button>
        </Tooltip>
      </Dropdown>
    );
  }, [
    codexAvailability.available,
    handleAgentTypeChange,
    isLoading,
    messages.length,
    selectedAgentType,
  ]);

  const handleDeleteMessage = useCallback(
    (messageIndex: number) => {
      deleteMessage(messageIndex);
    },
    [deleteMessage]
  );

  const handleRegenerateMessage = useCallback(
    (messageIndex: number) => {
      regenerateMessage(messageIndex, (content, baseMessages) => {
        if (typeof content === "string") {
          void sendMessage(content, baseMessages);
          return;
        }
        void sendRequestMessage({
          requestMessage: {
            role: "user",
            content,
          },
          baseMessages,
        });
      });
    },
    [regenerateMessage, sendMessage, sendRequestMessage]
  );

  const handleCreateBranch = useCallback(
    (messageIndex: number) => {
      void createBranch(messageIndex);
    },
    [createBranch]
  );

  const handleDeleteConfirm = useCallback((): Promise<boolean> => {
    return new Promise(resolve => {
      modal.confirm({
        title: "确定删除该消息吗？",
        content: "删除后无法恢复",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [modal]);

  const handleCopySuccess = useCallback(() => {
    antdMessage.success("已复制到剪贴板");
  }, [antdMessage]);

  const handleCopyError = useCallback(() => {
    antdMessage.error("复制失败");
  }, [antdMessage]);

  const chatInputServices: ChatInputAreaServices = useMemo(
    () => ({
      uploadFile: async (file: File) => {
        if (!aiWsClient?.isConnected) {
          throw new Error("WebSocket 未连接");
        }
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const result = (await aiWsClient.sendRequest("resource.upload", {
          data: base64,
          name: file.name,
          type: file.type,
        })) as { url: string | null };
        return result.url;
      },
      convertFileSrc: async (path: string) => {
        if (!aiWsClient?.isConnected) {
          return path;
        }
        const result = (await aiWsClient.sendRequest("file.convertFileSrc", {
          path,
        })) as { url: string };
        return result.url;
      },
      getHomeDir: async () => {
        if (!aiWsClient?.isConnected) {
          return "";
        }
        const result = (await aiWsClient.sendRequest("file.getHomeDir", {})) as { homeDir: string };
        return result.homeDir;
      },
    }),
    [aiWsClient]
  );

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

  const submittedAskQuestionSessions = useMemo(() => {
    return Object.values(askQuestionRecords)
      .filter(
        record =>
          record.conversationKey === conversationKey &&
          record.status === "submitted" &&
          Boolean(record.submittedAnswers)
      )
      .sort((a, b) => a.updatedAt - b.updatedAt);
  }, [askQuestionRecords, conversationKey]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const pendingSession = submittedAskQuestionSessions.find(
      session => !resumingAskQuestionRef.current.has(session.sessionId)
    );
    if (!pendingSession || !pendingSession.submittedAnswers) {
      return;
    }

    resumingAskQuestionRef.current.add(pendingSession.sessionId);

    const askQuestionResult = buildAskQuestionToolResult(
      pendingSession.payload,
      pendingSession.submittedAnswers
    );
    const answerJson = JSON.stringify(askQuestionResult, null, 2);

    const resolvedMessages = markAskQuestionExecutionResolved(
      messages,
      pendingSession.toolCallId,
      pendingSession.rawInput,
      answerJson
    );
    saveMessages(resolvedMessages);

    const hasAssistantToolCallMessage = resolvedMessages.some(message => {
      const withToolContext = message as ChatMessageType & {
        tool_calls?: ToolCallPayload[];
      };
      if (withToolContext.role !== "assistant" || !withToolContext.tool_calls) {
        return false;
      }
      return withToolContext.tool_calls.some(
        call =>
          call.id === pendingSession.toolCallId && call.function.name === ASK_QUESTION_TOOL_NAME
      );
    });

    const bridgeAssistantToolCallMessage: AiChatRequestMessage = {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: pendingSession.toolCallId,
          type: "function",
          function: {
            name: ASK_QUESTION_TOOL_NAME,
            arguments: pendingSession.rawInput,
          },
        },
      ],
    };

    void (async () => {
      try {
        const resumed = await sendRequestMessage({
          requestMessage: {
            role: "tool",
            content: answerJson,
            tool_call_id: pendingSession.toolCallId,
            name: ASK_QUESTION_TOOL_NAME,
          },
          baseMessages: resolvedMessages,
          extraHistoryMessages: hasAssistantToolCallMessage ? [] : [bridgeAssistantToolCallMessage],
        });

        if (resumed) {
          completeAskQuestionSession(pendingSession.sessionId);
        } else {
          resumingAskQuestionRef.current.delete(pendingSession.sessionId);
        }
      } catch (error) {
        console.error("恢复 ask-question 请求失败:", error);
        resumingAskQuestionRef.current.delete(pendingSession.sessionId);
      }
    })();
  }, [
    isLoading,
    submittedAskQuestionSessions,
    messages,
    sendRequestMessage,
    saveMessages,
    completeAskQuestionSession,
  ]);

  const chatHeader = useMemo(() => {
    if (isSessionsLoading) {
      return null;
    }
    return (
      <ChatDropdownSelector
        chats={sessions}
        currentChat={currentSession}
        onChatSelect={selectSession}
        onTitleChange={title => updateSessionTitle(currentSession.id, title)}
        onCreateNewChat={() => createSession(undefined, selectedAgentType)}
        onChatDelete={deleteSession}
        getChildBranchesCount={getChildBranchesCount}
      />
    );
  }, [
    createSession,
    currentSession,
    deleteSession,
    getChildBranchesCount,
    isSessionsLoading,
    selectSession,
    selectedAgentType,
    sessions,
    updateSessionTitle,
  ]);

  useEffect(() => {
    setTimeout(forceScrollToBottom, 100);
  }, [currentSession?.id, forceScrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(scrollToBottom, 0);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  return (
    <ChatContainerCore
      ref={coreRef}
      isDark={isDark}
      isConnected={isConnected}
      messages={messages}
      isLoading={isLoading}
      error={error}
      reasoningEffort={reasoningEffort}
      onReasoningEffortChange={setReasoningEffort}
      reasoningEffortDisabled={!currentModelConfig?.features.thinking}
      currentModelName={currentModelName}
      extraToolbarButtons={agentTypeToolbar}
      modelSelectItems={modelSelectItems}
      onModelSelect={handleModelSelect}
      isSupportImage={isCodexAgent || isSupportImage}
      isSupportFile={!isCodexAgent && isSupportFile}
      createMessageLoading={false}
      onCreateNewMessage={() => {
        void createSession(buildSessionAwareSystemPrompt(effectiveSystemPrompt), selectedAgentType);
      }}
      onMcpManagerClick={handleMcpManagerClick}
      currentPageUrl={url}
      onSendMessageContent={handleSendMessageContent}
      onUserSend={handleUserSend}
      onStopGeneration={stopGeneration}
      onClearMessages={clearMessages}
      onDeleteMessage={handleDeleteMessage}
      onRegenerateMessage={handleRegenerateMessage}
      onCreateBranch={handleCreateBranch}
      onCopySuccess={handleCopySuccess}
      onCopyError={handleCopyError}
      onDeleteConfirm={handleDeleteConfirm}
      chatInputServices={chatInputServices}
      chatHeader={chatHeader}
      messagesContainerRef={messagesContainerRef}
      messagesContainerClassName="tau-scrollbar border-t-12 border-b-12 border-transparent px-6 py-3 flex-1 min-h-0 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
      renderInputWrapper={inputNode => (
        <div
          className={classNames(
            "bg-(--th-chat-input) border-(--th-chat-input-border) m-1 mt-3 box-border flex-none rounded-3xl border px-3 py-3 shadow-sm"
          )}
        >
          {inputNode}
        </div>
      )}
      renderChatInputArea={({ chatInputRef, inputProps }) => {
        const resolvedProps = inputProps as ChatInputAreaProps;
        return (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <ChatInputArea
                ref={chatInputRef as Ref<ChatInputAreaHandle>}
                className="min-w-0 flex-1"
                {...resolvedProps}
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
            onCopySuccess={handleCopySuccess}
            onCopyError={handleCopyError}
            onDeleteConfirm={handleDeleteConfirm}
          />
        </div>
      )}
    />
  );
}
