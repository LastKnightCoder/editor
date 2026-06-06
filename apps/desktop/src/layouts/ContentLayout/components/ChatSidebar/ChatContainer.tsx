import React, {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { App } from "antd";
import { produce } from "immer";
import { useLocalStorageState, useMemoizedFn } from "ahooks";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import {
  ChatMessage,
  RequestMessage,
  ResponseMessage,
  TextContent,
  ReasoningEffort,
  ToolCallPayload,
  ToolCallExecutionState,
} from "@/types";
import {
  Role,
  SUMMARY_TITLE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  buildSessionAwareSystemPrompt,
} from "@/constants";
import useChatLLM from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useSettingStore from "@/stores/useSettingStore";
import useSkillStore from "@/stores/useSkillStore";
import type { EditTextHandle } from "@/components/EditText";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import {
  ChatContainerCore,
  type ChatMessageType as CoreChatMessageType,
  type MessageContentItem,
  useChatAutoScroll,
} from "@tau/shared";
import {
  ASK_QUESTION_TOOL_NAME,
  buildAskQuestionToolResult,
} from "@/tools/askQuestionTypes";
import { ToolRendererInteractionProvider } from "@/tool-call-renderers/ToolRendererInteractionContext";
import { useAskQuestionSessionStore } from "@/tools/askQuestionSessionStore";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  ensureAssistantMessage,
  finalizeAssistantTurn,
  syncAssistantDerivedFields,
} from "@/services/assistantMessageBlocks";
import {
  buildFullHistoryMessages,
  buildResetBaseChat,
  formatGeneratedChatTitle,
  getLastUserMessageIndex,
  getRequestMessageText,
} from "./editingUtils";

const ENABLE_TITLE_SUMMARY = true;

interface EditingDraftState {
  messageIndex: number;
}

interface HiddenPromptContextState {
  text: string;
  label?: string;
}

interface ChatContainerProps {
  currentChat: ChatMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否应该渲染内容
  updateChatMessage: (chat: ChatMessage) => Promise<ChatMessage>;
  updateCurrentChat: (chat: ChatMessage) => void;
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  titleRef: React.RefObject<EditTextHandle | null>;
  onCreateNewMessage: () => void;
  createMessageLoading: boolean;
  hideInput?: boolean; // 控制是否隐藏输入框
  chatScope?: string; // 对话作用域，用于构建 ask-question 会话键
  onChatCreated?: (chatId: number) => void; // 新对话创建后的回调
  customSystemPrompt?: string; // 自定义系统提示（覆盖默认）
  onCreateChat: (
    messages: ChatMessage["messages"],
    title?: string,
  ) => Promise<ChatMessage>;
  onCreateBranch: (
    parentChatId: number,
    messages: ChatMessage["messages"],
  ) => Promise<ChatMessage>;
  beforeSendUserMessage?: (
    content: MessageContentItem[],
  ) => Promise<boolean | void>;
}

export type ChatContainerHandle = {
  scrollToTop: () => void;
  focusInput: () => void;
  setInputValue: (value: string) => void;
  sendUserMessage: (content: MessageContentItem[]) => Promise<boolean>;
};

const normalizeAskQuestionExecutionInput = (input: string) => {
  try {
    return JSON.stringify(JSON.parse(input));
  } catch {
    return input.trim();
  }
};

const markAskQuestionExecutionResolved = (
  chat: ChatMessage,
  toolCallId: string,
  expectedInput: string,
  output: string,
) => {
  const normalizedExpectedInput =
    normalizeAskQuestionExecutionInput(expectedInput);

  return produce(chat, (draft) => {
    const isMatchedExecution = (execution: ToolCallExecutionState) =>
      execution.toolCallId === toolCallId &&
      execution.toolName === ASK_QUESTION_TOOL_NAME &&
      normalizeAskQuestionExecutionInput(execution.input) ===
        normalizedExpectedInput;

    draft.messages.forEach((message) => {
      if (message.role !== Role.Assistant) {
        return;
      }

      const assistant = ensureAssistantMessage(message as ResponseMessage);
      assistant.assistant_blocks = assistant.assistant_blocks?.map((block) => {
        if (block.type !== "tool_call" || !block.execution) {
          return block;
        }

        return {
          ...block,
          execution: isMatchedExecution(block.execution)
            ? {
                ...block.execution,
                status: "success",
                output,
                duration:
                  block.execution.duration ||
                  Date.now() - block.execution.timestamp,
              }
            : block.execution,
        };
      });
      syncAssistantDerivedFields(assistant);
    });
  });
};

const buildAskQuestionExecutionSnapshotKey = (
  execution: ToolCallExecutionState,
) => `${execution.toolCallId}::${execution.input}`;

const ChatContainer = forwardRef<ChatContainerHandle, ChatContainerProps>(
  (
    {
      currentChat,
      isDark,
      markdownComponents,
      isVisible,
      updateChatMessage,
      updateCurrentChat,
      sendLoading,
      setSendLoading,
      titleRef,
      onCreateNewMessage,
      createMessageLoading,
      hideInput = false,
      chatScope = "main-chat",
      onChatCreated,
      customSystemPrompt,
      onCreateChat,
      onCreateBranch,
      beforeSendUserMessage,
    },
    ref,
  ) => {
    const { message } = App.useApp();
    const { chatLLMStream } = useChatLLM();
    const { providerConfig: chatProviderConfig, modelConfig: chatModelConfig } =
      useLLMConfig("chat");
    const {
      providerConfig: titleProviderConfig,
      modelConfig: titleModelConfig,
    } = useLLMConfig("titleSummary");

    const { chatInputBg } = useThemeColors();

    const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);
    const skills = useSkillStore((state) => state.skills);
    const loadSkills = useSkillStore((state) => state.loadSkills);
    const askQuestionRecords = useAskQuestionSessionStore(
      (state) => state.records,
    );
    const completeAskQuestionSession = useAskQuestionSessionStore(
      (state) => state.completeSession,
    );

    // 加载 Skills 数据（用于注入系统 Prompt）
    useEffect(() => {
      loadSkills();
    }, [loadSkills]);

    const [reasoningEffort, setReasoningEffort] =
      useLocalStorageState<ReasoningEffort>("reasoningEffort", {
        defaultValue: "none",
      });
    const effectiveReasoningEffort = reasoningEffort ?? "none";

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const {
      containerRef: setMessagesContainerRef,
      enableAutoScroll,
      forceScrollToBottom,
      scrollToBottom,
    } = useChatAutoScroll({
      containerRef: messagesRef,
    });
    const [editingDraft, setEditingDraft] = useState<EditingDraftState | null>(
      null,
    );
    const [hiddenPromptContext, setHiddenPromptContext] =
      useState<HiddenPromptContextState | null>(null);

    // 跟踪实际使用的聊天对象，解决新建对话时的状态同步问题
    const actualChatRef = useRef<ChatMessage>(currentChat);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    const modelFeatureSupport = chatModelConfig?.features;
    const supportImage =
      modelFeatureSupport?.image ?? modelFeatureSupport?.multimodal ?? false;
    const supportFile = modelFeatureSupport?.file ?? false;

    const abortControllerRef = useRef<AbortController | null>(null);
    const activeAssistantTurnIdRef = useRef<string | null>(null);
    const persistedAskQuestionSnapshotsRef = useRef<Set<string>>(new Set());
    const resumingAskQuestionRef = useRef<Set<string>>(new Set());
    const streamCounterRef = useRef(0);

    // 当切换聊天或收到同一聊天的外部最新快照时同步 ref
    useEffect(() => {
      const actualChat = actualChatRef.current;
      const isDifferentChat = currentChat.id !== actualChat.id;
      const hasExternalSnapshot = currentChat !== actualChat;

      if (isDifferentChat || hasExternalSnapshot) {
        actualChatRef.current = currentChat;
        if (isDifferentChat) {
          activeAssistantTurnIdRef.current = null;
          persistedAskQuestionSnapshotsRef.current.clear();
          resumingAskQuestionRef.current.clear();
        }
        setUpdateCounter((prev) => prev + 1);
      }
    }, [currentChat]);

    useEffect(() => {
      if (hideInput) {
        setEditingDraft(null);
      }
    }, [hideInput]);

    const getConversationKey = useMemoizedFn((chatId: number) => {
      return `${chatScope}:${chatId}`;
    });

    const buildSystemMessageWithRequest = useMemoizedFn((chat: ChatMessage) => {
      const defaultSystemPromptForSend =
        customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      const baseSystemContent =
        (chat.messages[0] as ResponseMessage | undefined)?.content ||
        defaultSystemPromptForSend;
      return {
        role: Role.System,
        content: [
          {
            type: "text",
            text: baseSystemContent,
          },
        ],
      } as RequestMessage;
    });

    const buildHistoryMessages = useMemoizedFn(
      (
        chat: ChatMessage,
        options?: {
          excludeMessageIndex?: number;
        },
      ) => buildFullHistoryMessages(chat, options),
    );

    // 抽离的公共方法：处理消息发送逻辑
    const processMessageSending = useMemoizedFn(
      async (
        requestMessage: RequestMessage,
        options?: {
          shouldClearInput?: boolean;
          shouldCreateNewChat?: boolean;
          persistRequestMessage?: boolean;
          extraHistoryMessages?: RequestMessage[];
          persistedRequestMessage?: RequestMessage;
          baseChatOverride?: ChatMessage;
          toolContext?: {
            flags?: {
              forceReview?: boolean;
              feedbackProposalId?: string;
            };
          };
        },
      ) => {
        const shouldClearInput = options?.shouldClearInput ?? true;
        const shouldCreateNewChat = options?.shouldCreateNewChat ?? true;
        const persistRequestMessage = options?.persistRequestMessage ?? true;
        const persistedRequestMessage =
          options?.persistedRequestMessage ?? requestMessage;
        const extraHistoryMessages = options?.extraHistoryMessages || [];
        const perf = measurePerformance("sendMessage");
        setSendLoading(true);

        scrollToBottom();

        const responseMessage = createAssistantMessage();

        // 如果当前没有真实的对话（id为0），则先创建一个新对话
        let actualCurrentChat =
          options?.baseChatOverride || actualChatRef.current;
        if (shouldCreateNewChat && actualCurrentChat.id === 0) {
          try {
            const defaultSystemPrompt =
              customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
            const systemContent =
              (actualCurrentChat.messages[0] as ResponseMessage | undefined)
                ?.content || defaultSystemPrompt;
            const systemMessage: ResponseMessage = {
              role: Role.System,
              content: buildSessionAwareSystemPrompt(
                systemContent || defaultSystemPrompt,
              ),
            };

            const newChatMessages = [systemMessage];

            // 使用外部传入的创建对话回调
            actualCurrentChat = await onCreateChat(
              newChatMessages,
              actualCurrentChat.title || "新对话",
            );

            // 立即更新ref，确保UI使用新创建的对话
            actualChatRef.current = actualCurrentChat;
            setUpdateCounter((prev) => prev + 1);

            // 通知父组件新对话已创建
            onChatCreated?.(actualCurrentChat.id);
          } catch (error) {
            message.error("创建新对话失败");
            setSendLoading(false);
            return false;
          }
        }

        const sendMessages: RequestMessage[] = [
          buildSystemMessageWithRequest(actualCurrentChat),
          ...buildHistoryMessages(actualCurrentChat),
          ...extraHistoryMessages,
          requestMessage,
        ];
        const conversationKey = getConversationKey(actualCurrentChat.id);
        const streamId = `${conversationKey}:${++streamCounterRef.current}`;

        // 立即添加用户消息和初始的助手回复到状态中
        const chatWithNewMessages = {
          ...actualCurrentChat,
          messages: [
            ...actualCurrentChat.messages,
            ...(persistRequestMessage ? [persistedRequestMessage] : []),
            responseMessage,
          ],
        };

        // 更新当前聊天状态
        actualCurrentChat = chatWithNewMessages;
        actualChatRef.current = chatWithNewMessages;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(chatWithNewMessages);

        // 添加新消息后立即滚动到底部（重置自动滚动）
        enableAutoScroll();
        setTimeout(forceScrollToBottom, 0);

        if (shouldClearInput) {
          editTextRef.current?.clear();
        }

        if (!chatProviderConfig || !chatModelConfig) {
          message.error("请先在设置中配置对话功能的大模型");
          setSendLoading(false);
          return false;
        }

        chatLLMStream(chatProviderConfig, chatModelConfig, sendMessages, {
          enableTools: true,
          conversationKey,
          toolContext: options?.toolContext,
          skills,
          reasoningEffort: chatModelConfig?.features?.thinking
            ? effectiveReasoningEffort
            : undefined,
          onFinish: () => {},

          onAssistantTurnEnd: async ({ turnId, resultType }) => {
            activeAssistantTurnIdRef.current = null;
            const finalizedChat = produce(actualCurrentChat, (draft) => {
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                finalizeAssistantTurn(lastMessage, turnId);
              }
            });

            actualCurrentChat = finalizedChat;
            actualChatRef.current = finalizedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(finalizedChat);

            if (resultType !== "response") {
              return;
            }

            try {
              const updatedChatMessage = await updateChatMessage(finalizedChat);
              actualChatRef.current = updatedChatMessage;
              setUpdateCounter((prev) => prev + 1);
              updateCurrentChat(updatedChatMessage);
              scrollToBottom();

              try {
                if (
                  ENABLE_TITLE_SUMMARY &&
                  titleProviderConfig &&
                  titleModelConfig
                ) {
                  const titleMessages: RequestMessage[] =
                    updatedChatMessage.messages
                      .slice(1)
                      .slice(-2)
                      .map((message): RequestMessage => {
                        if (message.role === Role.User) {
                          const userMessage = message as RequestMessage;
                          const sourceContent = userMessage.content;
                          const textContent = Array.isArray(sourceContent)
                            ? sourceContent.filter(
                                (item): item is TextContent =>
                                  item.type === "text" &&
                                  item.text.trim().length > 0,
                              )
                            : sourceContent
                              ? [
                                  {
                                    type: "text",
                                    text: sourceContent,
                                  } as TextContent,
                                ]
                              : [];
                          return {
                            role: message.role,
                            content: textContent,
                          };
                        }

                        const responseMsg = message as ResponseMessage;
                        return {
                          role: message.role,
                          content: [
                            { type: "text", text: responseMsg.content },
                          ],
                        };
                      })
                      .filter(
                        (message) =>
                          Array.isArray(message.content) &&
                          message.content.length > 0 &&
                          message.content.some(
                            (item) =>
                              item.type === "text" &&
                              item.text.trim().length > 0,
                          ),
                      );

                  chatLLMStream(
                    titleProviderConfig,
                    titleModelConfig,
                    [
                      {
                        role: Role.System,
                        content: [{ type: "text", text: SUMMARY_TITLE_PROMPT }],
                      },
                      ...titleMessages,
                      {
                        role: Role.User,
                        content: [
                          {
                            type: "text",
                            text: "请根据以上对话内容生成一个简洁的标题",
                          },
                        ],
                      },
                    ],
                    {
                      onFinish: async (content) => {
                        const nextTitle = content
                          ? formatGeneratedChatTitle(content)
                          : "";
                        if (nextTitle) {
                          const updateChat = produce(
                            updatedChatMessage,
                            (draft) => {
                              draft.title = nextTitle;
                            },
                          );
                          const saved = await updateChatMessage(updateChat);
                          actualChatRef.current = saved;
                          setUpdateCounter((prev) => prev + 1);
                          updateCurrentChat(saved);
                          titleRef.current?.setValue(nextTitle);
                        }
                      },
                    },
                  );
                }
              } catch (e) {
                console.error("Failed to generate title:", e);
              }
            } catch (error) {
              message.error("Failed to update chat");
              console.error(error);
            } finally {
              setSendLoading(false);
              abortControllerRef.current = null;
              if (shouldClearInput) {
                setTimeout(() => {
                  editTextRef.current?.focusEnd();
                }, 100);
              }
            }
            perf.end();
          },

          onUpdate: (
            full: string,
            _inc: string,
            _reasoningText?: string,
            turnId?: string,
          ) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其内容
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantTextSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-text`,
                  full,
                );
              }
            });

            // 更新状态和ref
            actualCurrentChat = updatedChat;
            actualChatRef.current = updatedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(updatedChat);

            // 更新内容时滚动到底部（如果自动滚动启用）
            setTimeout(() => {
              scrollToBottom();
            }, 0);
          },

          onReasoning: (full: string, _inc: string, turnId?: string) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其推理内容
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantReasoningSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-reasoning`,
                  full,
                );
              }
            });

            // 更新状态和ref
            actualCurrentChat = updatedChat;
            actualChatRef.current = updatedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(updatedChat);

            // 推理内容更新时滚动到底部（如果自动滚动启用）
            setTimeout(() => {
              scrollToBottom();
            }, 0);
          },

          onToolCallsUpdate: (
            executions: ToolCallExecutionState[],
            turnId?: string,
            toolCalls?: ToolCallPayload[],
          ) => {
            if (turnId) {
              activeAssistantTurnIdRef.current = turnId;
            }
            // 基于当前实际聊天对象进行更新
            const updatedChat = produce(actualCurrentChat, (draft) => {
              // 找到最后一条助手消息并更新其工具执行状态
              const lastMessageIndex = draft.messages.length - 1;
              if (
                lastMessageIndex >= 0 &&
                draft.messages[lastMessageIndex].role === Role.Assistant
              ) {
                const lastMessage = draft.messages[
                  lastMessageIndex
                ] as ResponseMessage;
                applyAssistantToolCallsSnapshot(
                  lastMessage,
                  turnId || `${streamId}:fallback-tool`,
                  executions,
                  toolCalls,
                );
              }
            });

            // 更新状态和ref
            actualCurrentChat = updatedChat;
            actualChatRef.current = updatedChat;
            setUpdateCounter((prev) => prev + 1);
            updateCurrentChat(updatedChat);

            // ask-question 进入等待态时，立即持久化快照，确保应用重启后可恢复
            const pendingAskQuestionExecutions = executions.filter(
              (execution) =>
                execution.toolName === ASK_QUESTION_TOOL_NAME &&
                (execution.status === "pending" ||
                  execution.status === "executing" ||
                  execution.status === "retrying"),
            );
            const shouldPersistSnapshot = pendingAskQuestionExecutions.some(
              (execution) =>
                !persistedAskQuestionSnapshotsRef.current.has(
                  buildAskQuestionExecutionSnapshotKey(execution),
                ),
            );
            if (shouldPersistSnapshot) {
              pendingAskQuestionExecutions.forEach((execution) => {
                persistedAskQuestionSnapshotsRef.current.add(
                  buildAskQuestionExecutionSnapshotKey(execution),
                );
              });
              void updateChatMessage(updatedChat).catch((error) => {
                console.error("持久化 ask-question 快照失败:", error);
              });
            }

            // 工具执行状态更新时滚动到底部（如果自动滚动启用）
            setTimeout(() => {
              scrollToBottom();
            }, 0);
          },

          onError: (error) => {
            const isAbortError = error.name === "AbortError";
            const finalizedChat = finalizeActiveAssistantTurn();
            if (finalizedChat) {
              actualCurrentChat = finalizedChat;
            }
            updateCurrentChat(actualCurrentChat);
            setSendLoading(false);
            abortControllerRef.current = null;

            if (!isAbortError) {
              message.error("请求失败");
            }
            perf.end();
            if (shouldClearInput) {
              setTimeout(() => {
                // 从消息内容中提取文本用于恢复
                const textContent = Array.isArray(requestMessage.content)
                  ? requestMessage.content
                      .filter((item) => item.type === "text")
                      .map((item) => item.text)
                      .join("\n")
                  : typeof requestMessage.content === "string"
                    ? requestMessage.content
                    : "";
                editTextRef.current?.setValue(textContent);
                editTextRef.current?.focusEnd();
              }, 100);
            }
          },

          onController: (controller: AbortController) => {
            abortControllerRef.current = controller;
          },
        });
        return true;
      },
    );

    const submittedAskQuestionSessions = useMemo(() => {
      const activeChat = actualChatRef.current;
      const conversationKey = getConversationKey(activeChat.id);
      return Object.values(askQuestionRecords)
        .filter(
          (record) =>
            record.conversationKey === conversationKey &&
            record.status === "submitted" &&
            Boolean(record.submittedAnswers),
        )
        .sort((a, b) => a.updatedAt - b.updatedAt);
    }, [askQuestionRecords, getConversationKey, updateCounter]);

    useEffect(() => {
      if (hideInput || sendLoading) {
        return;
      }

      const pendingSession = submittedAskQuestionSessions.find(
        (session) => !resumingAskQuestionRef.current.has(session.sessionId),
      );
      if (!pendingSession || !pendingSession.submittedAnswers) {
        return;
      }
      if (!chatProviderConfig || !chatModelConfig) {
        return;
      }

      resumingAskQuestionRef.current.add(pendingSession.sessionId);

      const askQuestionResult = buildAskQuestionToolResult(
        pendingSession.payload,
        pendingSession.submittedAnswers,
      );
      const answerJson = JSON.stringify(askQuestionResult, null, 2);

      const currentChatSnapshot = actualChatRef.current;
      const resolvedChat = markAskQuestionExecutionResolved(
        currentChatSnapshot,
        pendingSession.toolCallId,
        pendingSession.rawInput,
        answerJson,
      );
      actualChatRef.current = resolvedChat;
      setUpdateCounter((prev) => prev + 1);
      updateCurrentChat(resolvedChat);
      void updateChatMessage(resolvedChat).catch((error) => {
        console.error("恢复 ask-question 快照持久化失败:", error);
      });

      completeAskQuestionSession(pendingSession.sessionId);

      const resumeToolResultMessage: RequestMessage = {
        role: Role.Tool,
        content: [
          {
            type: "text",
            text: answerJson,
          },
        ],
        tool_call_id: pendingSession.toolCallId,
        name: ASK_QUESTION_TOOL_NAME,
      };

      const historyMessages = buildHistoryMessages(actualChatRef.current);
      const hasAssistantToolCallMessage = historyMessages.some(
        (message) =>
          message.role === Role.Assistant &&
          Boolean(
            message.tool_calls?.some(
              (call) =>
                call.id === pendingSession.toolCallId &&
                call.function.name === ASK_QUESTION_TOOL_NAME,
            ),
          ),
      );
      const bridgeAssistantToolCallMessage: RequestMessage = {
        role: Role.Assistant,
        content: "",
        reasoning_content: "",
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

      void processMessageSending(resumeToolResultMessage, {
        shouldClearInput: false,
        shouldCreateNewChat: false,
        persistRequestMessage: false,
        extraHistoryMessages: hasAssistantToolCallMessage
          ? []
          : [bridgeAssistantToolCallMessage],
      });
    }, [
      hideInput,
      sendLoading,
      submittedAskQuestionSessions,
      processMessageSending,
      buildHistoryMessages,
      updateCurrentChat,
      updateChatMessage,
      completeAskQuestionSession,
      chatProviderConfig,
      chatModelConfig,
    ]);

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        if (messagesRef.current) {
          if ("scrollTo" in messagesRef.current) {
            messagesRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
      },
      focusInput: () => {
        editTextRef.current?.focusEnd();
      },
      setInputValue: (value: string) => {
        editTextRef.current?.setValue(value);
      },
      sendUserMessage: async (content: MessageContentItem[]) => {
        if (sendLoading) {
          message.warning("当前已有生成任务，请稍后再试");
          return false;
        }
        await sendMessageContent(content);
        return true;
      },
    }));

    const onSelectModel = useMemoizedFn(
      (providerId: string, modelName: string) => {
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.llmUsageSettings.chat.providerId = providerId;
            draft.setting.llmUsageSettings.chat.modelName = modelName;
          }),
        );
      },
    );

    // 模型选择菜单
    const modelSelectItems = useMemo(() => {
      return llmConfigs.map((provider) => ({
        key: provider.id,
        label: provider.name,
        children: provider.models?.map((model) => ({
          key: `${provider.id}::${model.name}`,
          label: (
            <div>
              <div>{model.name}</div>
              <div style={{ fontSize: "12px", color: "#999" }}>
                {model.description}
              </div>
            </div>
          ),
        })),
      }));
    }, [llmConfigs]);

    // 处理模型选择
    const handleModelSelect = useMemoizedFn(({ key }: { key: string }) => {
      const [providerId, modelName] = key.split("::");

      onSelectModel(providerId, modelName);

      // 更新全局配置
      useSettingStore.setState(
        produce((draft) => {
          if (!draft.setting.llmUsageSettings.chat) {
            draft.setting.llmUsageSettings.chat = {
              providerId: "",
              modelName: "",
            };
          }
          draft.setting.llmUsageSettings.chat.providerId = providerId;
          draft.setting.llmUsageSettings.chat.modelName = modelName;
        }),
      );
    });

    const visibleMessages = useMemo(() => {
      return actualChatRef.current.messages.filter(
        (message) => message.role !== Role.System,
      );
    }, [updateCounter]);

    const lastUserMessageIndex = useMemo(
      () => getLastUserMessageIndex(visibleMessages),
      [visibleMessages],
    );

    useEffect(() => {
      if (!editingDraft) {
        return;
      }

      const targetMessage = visibleMessages[editingDraft.messageIndex];
      const isEditingTargetStillValid =
        editingDraft.messageIndex === lastUserMessageIndex &&
        targetMessage?.role === Role.User;

      if (!isEditingTargetStillValid) {
        setEditingDraft(null);
      }
    }, [editingDraft, lastUserMessageIndex, visibleMessages]);

    const finalizeActiveAssistantTurn = useMemoizedFn(() => {
      const turnId = activeAssistantTurnIdRef.current;
      if (!turnId) {
        return null;
      }

      const finalizedChat = produce(actualChatRef.current, (draft) => {
        const lastMessageIndex = draft.messages.length - 1;
        if (
          lastMessageIndex >= 0 &&
          draft.messages[lastMessageIndex].role === Role.Assistant
        ) {
          finalizeAssistantTurn(
            draft.messages[lastMessageIndex] as ResponseMessage,
            turnId,
          );
        }
      });

      activeAssistantTurnIdRef.current = null;
      actualChatRef.current = finalizedChat;
      setUpdateCounter((prev) => prev + 1);
      updateCurrentChat(finalizedChat);
      return finalizedChat;
    });

    // 停止流式请求
    const stopStreaming = useMemoizedFn(() => {
      if (abortControllerRef.current) {
        const finalizedChat = finalizeActiveAssistantTurn();
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        // 立即清除 loading 状态，避免 UI 无响应
        setSendLoading(false);
        if (finalizedChat) {
          void updateChatMessage(finalizedChat).catch((error) => {
            console.error("停止生成后持久化对话失败:", error);
          });
        }
      }
    });

    // 初始加载时滚动到底部
    useEffect(() => {
      // 延迟执行确保DOM已更新
      setTimeout(() => {
        forceScrollToBottom();
      }, 100);
    }, [currentChat.id, forceScrollToBottom]);

    // 在消息列表变化时滚动到底部（仅在自动滚动启用时）
    useEffect(() => {
      if (visibleMessages.length > 0) {
        setTimeout(() => {
          scrollToBottom();
        }, 0);
      }
    }, [visibleMessages.length, scrollToBottom]);

    // 监听消息内容变化（仅在自动滚动启用时）
    useEffect(() => {
      if (visibleMessages.length > 0) {
        const lastMessage = visibleMessages[visibleMessages.length - 1];
        if (lastMessage && lastMessage.role === Role.Assistant) {
          scrollToBottom();
        }
      }
    }, [visibleMessages, scrollToBottom]);

    const sendMessageContent = useMemoizedFn(
      async (userContent: MessageContentItem[]) => {
        if (!userContent || userContent.length === 0) {
          message.warning("请输入内容");
          return;
        }

        const hasMeaningfulContent = userContent.some((item) => {
          if (item.type === "text") {
            return item.text.trim().length > 0;
          }
          return true;
        });
        if (!hasMeaningfulContent) {
          message.warning("请输入内容");
          return;
        }

        if (beforeSendUserMessage) {
          const shouldContinue = await beforeSendUserMessage(userContent);
          if (shouldContinue === false) {
            return;
          }
        }

        const newMessage: RequestMessage = {
          role: Role.User,
          content: userContent as RequestMessage["content"],
        };
        const requestMessageForModel: RequestMessage = hiddenPromptContext
          ? {
              ...newMessage,
              content: Array.isArray(newMessage.content)
                ? [
                    ...newMessage.content.map((item) =>
                      item.type === "text"
                        ? {
                            ...item,
                            text: `${hiddenPromptContext.text}\n\n用户编辑要求：${item.text}`,
                          }
                        : item,
                    ),
                  ]
                : `${hiddenPromptContext.text}\n\n用户编辑要求：${newMessage.content}`,
            }
          : newMessage;

        const resetBaseChat = editingDraft
          ? buildResetBaseChat(actualChatRef.current, editingDraft.messageIndex)
          : null;

        if (editingDraft && !resetBaseChat) {
          setEditingDraft(null);
          message.warning("只能编辑最后一条用户消息");
          return;
        }

        const sent = await processMessageSending(requestMessageForModel, {
          shouldClearInput: true,
          shouldCreateNewChat: true,
          persistedRequestMessage: newMessage,
          baseChatOverride: resetBaseChat || undefined,
        });

        if (sent) {
          setEditingDraft(null);
          setHiddenPromptContext(null);
        }
      },
    );

    // 删除消息
    const handleDeleteMessage = useMemoizedFn(async (messageIndex: number) => {
      try {
        const updatedChat = produce(actualChatRef.current, (draft) => {
          // 过滤掉要删除的消息（需要加上系统消息的偏移）
          const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
          draft.messages = draft.messages.filter(
            (_, index) => index !== actualIndex,
          );
        });

        const saved = await updateChatMessage(updatedChat);
        actualChatRef.current = saved;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(saved);
        message.success("消息已删除");
      } catch (error) {
        message.error("删除消息失败");
        console.error("Delete message error:", error);
      }
    });

    // 重新生成消息
    const handleRegenerateMessage = useMemoizedFn(
      async (messageIndex: number) => {
        const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
        const targetMessage = actualChatRef.current.messages[actualIndex];
        if (!targetMessage || targetMessage.role !== Role.User) {
          message.warning("只能重新生成用户消息");
          return;
        }

        // 删除目标消息之后的所有消息（包括目标消息本身）
        const updatedChat = produce(actualChatRef.current, (draft) => {
          draft.messages = draft.messages.slice(0, actualIndex);
        });

        actualChatRef.current = updatedChat;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChat);

        // 直接调用公共方法发送消息
        const userMessage = targetMessage as RequestMessage;
        await processMessageSending(userMessage, {
          shouldClearInput: false,
          shouldCreateNewChat: false,
        });
      },
    );

    const handleEditMessage = useMemoizedFn(
      (messageIndex: number, content: string) => {
        if (hideInput || sendLoading) {
          return;
        }

        if (messageIndex !== lastUserMessageIndex) {
          message.warning("只能编辑最后一条用户消息");
          return;
        }

        const targetMessage = visibleMessages[messageIndex];
        if (!targetMessage || targetMessage.role !== Role.User) {
          message.warning("只能编辑用户消息");
          return;
        }

        setEditingDraft({
          messageIndex,
        });
        editTextRef.current?.setValue(content);
        setTimeout(() => {
          editTextRef.current?.focusEnd();
        }, 0);
      },
    );

    // 创建分支
    const handleCreateBranch = useMemoizedFn(async (messageIndex: number) => {
      try {
        const currentChat = actualChatRef.current;
        if (currentChat.id === 0) {
          message.warning("请先保存当前对话");
          return;
        }

        // 复制从开头到指定消息的所有消息（包括系统消息）
        const actualIndex = messageIndex + 1; // +1 因为跳过了系统消息
        const branchMessages = currentChat.messages.slice(0, actualIndex + 1);

        // 使用外部传入的创建分支回调
        await onCreateBranch(currentChat.id, branchMessages);
        message.success("分支已创建");
      } catch (error) {
        message.error("创建分支失败");
        console.error("Create branch error:", error);
      }
    });

    if (!currentChat) {
      return null;
    }

    const coreMessages: CoreChatMessageType[] = visibleMessages.map(
      (message, index) => {
        let content = "";
        if (message.role === Role.User || message.role === Role.Tool) {
          const requestMessage = message as RequestMessage;
          if (typeof requestMessage.content === "string") {
            content = requestMessage.content;
          } else {
            content = requestMessage.content
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("\n");
          }
        } else {
          content = (message as ResponseMessage).content || "";
        }

        return {
          id: `${actualChatRef.current.id}-${index}-${message.role}`,
          role: message.role as CoreChatMessageType["role"],
          content,
          timestamp: actualChatRef.current.updateTime + index,
        };
      },
    );

    return (
      <ToolRendererInteractionProvider
        value={{
          setInputValue: (text) => {
            editTextRef.current?.setValue(text);
            editTextRef.current?.focusEnd();
          },
          setHiddenPromptContext: (payload) => {
            setHiddenPromptContext(payload);
          },
        }}
      >
        <ChatContainerCore
          isDark={isDark}
          isConnected={true}
          messages={coreMessages}
          isLoading={sendLoading}
          error={null}
          hideInput={hideInput}
          reasoningEffort={
            chatModelConfig?.features?.thinking
              ? effectiveReasoningEffort
              : undefined
          }
          onReasoningEffortChange={
            chatModelConfig?.features?.thinking
              ? (value) => setReasoningEffort(value)
              : undefined
          }
          reasoningEffortDisabled={!chatModelConfig?.features?.thinking}
          currentModelName={chatModelConfig?.name}
          modelSelectItems={modelSelectItems}
          onModelSelect={handleModelSelect}
          isSupportImage={supportImage}
          isSupportFile={supportFile}
          onSendMessageContent={sendMessageContent}
          onStopGeneration={stopStreaming}
          createMessageLoading={createMessageLoading}
          onCreateNewMessage={onCreateNewMessage}
          resourceSource={{
            type: "chat",
            id: actualChatRef.current.id,
          }}
          inputRef={editTextRef}
          messagesContainerRef={setMessagesContainerRef}
          messagesContainerClassName="border-t-12 border-b-12 border-transparent px-6 py-3 flex-1 min-h-0 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
          renderEmptyState={() => null}
          renderInputWrapper={(inputNode) => (
            <div
              className={classNames(
                "m-1 mt-3 flex-none px-3 py-3 box-border shadow-sm rounded-3xl",
                chatInputBg,
              )}
            >
              {editingDraft ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
                  <div className="min-w-0">
                    <div className="font-medium">正在编辑最后一条用户消息</div>
                    <div className="truncate text-xs opacity-80">
                      发送后将替换这条消息及其后的回复
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-400/10"
                    onClick={() => {
                      setEditingDraft(null);
                    }}
                  >
                    取消编辑
                  </button>
                </div>
              ) : null}
              {!editingDraft && hiddenPromptContext ? (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/8 px-4 py-3 text-sm text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
                  <div className="min-w-0">
                    <div className="font-medium">正在编辑生成图片</div>
                    <div className="truncate text-xs opacity-80">
                      输入本次图片调整要求，发送后会基于选中的图片调用编辑工具
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg px-2.5 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-400/10"
                    onClick={() => {
                      setHiddenPromptContext(null);
                    }}
                  >
                    退出编辑
                  </button>
                </div>
              ) : null}
              {inputNode}
            </div>
          )}
          renderChatInputArea={({ chatInputRef, inputProps }) => {
            const {
              services: _services,
              onMcpManagerClick: _onMcpManagerClick,
              ...desktopInputProps
            } = inputProps;

            return (
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <ChatInputArea
                    ref={chatInputRef}
                    className="flex-1 min-w-0"
                    {...desktopInputProps}
                    placeholder={
                      hiddenPromptContext?.label ||
                      desktopInputProps.placeholder
                    }
                  />
                </div>
              </div>
            );
          }}
          onDeleteMessage={handleDeleteMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onCreateBranch={handleCreateBranch}
          renderMessage={({ messageIndex }) => {
            const item = visibleMessages[messageIndex];
            if (!item) return null;

            const streamingIndex = sendLoading
              ? visibleMessages.length - 1
              : -1;
            const isStreaming =
              sendLoading &&
              messageIndex === streamingIndex &&
              item.role === Role.Assistant;

            return (
              <div key={`${item.role}-${messageIndex}`} className="py-3">
                <MessageItem
                  message={item}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible={isVisible}
                  messageIndex={messageIndex}
                  onDeleteMessage={handleDeleteMessage}
                  onRegenerateMessage={handleRegenerateMessage}
                  onEditMessage={
                    !hideInput &&
                    !sendLoading &&
                    item.role === Role.User &&
                    messageIndex === lastUserMessageIndex &&
                    getRequestMessageText(item as RequestMessage).trim()
                      .length > 0
                      ? handleEditMessage
                      : undefined
                  }
                  onCreateBranch={handleCreateBranch}
                  messageMeta={{
                    chatId: actualChatRef.current.id,
                    messageIndex,
                    isStreaming,
                  }}
                />
              </div>
            );
          }}
        />
      </ToolRendererInteractionProvider>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
