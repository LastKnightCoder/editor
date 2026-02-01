import React, {
  useRef,
  useMemo,
  memo,
  useEffect,
  useState,
  useCallback,
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
  KnowledgeOptions,
  TextContent,
  ReasoningEffort,
  ToolCallExecutionState,
} from "@/types";
import {
  Role,
  SUMMARY_TITLE_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  MIND_MAP_PROMPT,
  WHITE_BOARD_PROMPT,
  buildSkillPromptSync,
} from "@/constants";
import useChatLLM from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import useSettingStore from "@/stores/useSettingStore";
import usePromptStore from "@/stores/usePromptStore";
import useSkillStore from "@/stores/useSkillStore";
import type { EditTextHandle } from "@/components/EditText";
import { CheckOutlined, InfoCircleOutlined } from "@ant-design/icons";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

const ENABLE_TITLE_SUMMARY = true;
interface ChatContainerProps {
  currentChat: ChatMessage;
  isDark: boolean;
  markdownComponents: any;
  isVisible: boolean; // 控制是否应该渲染内容
  updateChatMessage: (chat: ChatMessage) => Promise<ChatMessage>;
  updateCurrentChat: (chat: ChatMessage) => void;
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  titleRef: React.RefObject<EditTextHandle>;
  onCreateNewMessage: () => void;
  createMessageLoading: boolean;
  hideInput?: boolean; // 控制是否隐藏输入框
  onChatCreated?: (chatId: number) => void; // 新对话创建后的回调
  // 扩展配置项
  hideRagToggle?: boolean; // 隐藏 RAG 知识库增强开关
  hidePromptSelect?: boolean; // 隐藏 Prompt 选择器
  customSystemPrompt?: string; // 自定义系统提示（覆盖默认）
  // 创建对话的回调（必传，由外部统一控制）
  onCreateChat: (
    messages: ChatMessage["messages"],
    title?: string,
  ) => Promise<ChatMessage>;
  // 创建分支的回调（必传，由外部统一控制）
  onCreateBranch: (
    parentChatId: number,
    messages: ChatMessage["messages"],
  ) => Promise<ChatMessage>;
}

export type ChatContainerHandle = {
  scrollToTop: () => void;
};

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
      onChatCreated,
      hideRagToggle = false,
      hidePromptSelect = false,
      customSystemPrompt,
      onCreateChat,
      onCreateBranch,
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

    const { hoverClass, activeClass, borderClass, chatInputBg } =
      useThemeColors();

    const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);
    const embeddingModelInfo = useEmbeddingConfig();
    const prompts = usePromptStore((state) => state.prompts);
    const skills = useSkillStore((state) => state.skills);
    const loadSkills = useSkillStore((state) => state.loadSkills);

    // 加载 Skills 数据（用于注入系统 Prompt）
    useEffect(() => {
      loadSkills();
    }, [loadSkills]);

    const [ragEnabled, setRagEnabled] = useLocalStorageState("ragEnabled", {
      defaultValue: false,
    });

    const [reasoningEffort, setReasoningEffort] =
      useLocalStorageState<ReasoningEffort>("reasoningEffort", {
        defaultValue: "none",
      });
    const effectiveReasoningEffort = reasoningEffort ?? "none";

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

    // 跟踪实际使用的聊天对象，解决新建对话时的状态同步问题
    const actualChatRef = useRef<ChatMessage>(currentChat);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    const canChangePrompt = useMemo(() => {
      return actualChatRef.current.messages.length <= 1;
    }, [updateCounter]);

    const currentPrompt = useMemo(() => {
      if (!actualChatRef.current.promptId) {
        return null;
      }
      return (
        prompts.find((item) => item.id === actualChatRef.current.promptId) ||
        null
      );
    }, [prompts, updateCounter]);

    const promptSelectItems = useMemo(() => {
      const createPromptMenuItem = (
        key: string,
        title: string,
        tags: string[],
        description: string,
        isActive: boolean,
      ) => ({
        key,
        label: (
          <div className="flex items-center justify-between gap-3 min-w-[200px] max-w-[240px]">
            <div className="flex-1 min-w-0 flex flex-col gap-1 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={classNames("font-medium truncate", {
                    "text-blue-600": isActive,
                    "text-text-primary": !isActive,
                  })}
                >
                  {title}
                </span>
                <div className="flex flex-wrap gap-1 text-xs text-gray-500 truncate">
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <span key={tag} className="shrink-0">
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="shrink-0 text-gray-400">未添加标签</span>
                  )}
                </div>
              </div>
              <span
                className="text-xs text-text-secondary leading-relaxed"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
                title={description}
              >
                {description}
              </span>
            </div>
            {isActive && <CheckOutlined className="text-blue-500 shrink-0" />}
          </div>
        ),
      });

      const defaultPromptDescription =
        customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      const defaultItem = createPromptMenuItem(
        "default",
        customSystemPrompt ? "项目 Prompt" : "默认 Prompt",
        [customSystemPrompt ? "项目默认" : "系统默认"],
        defaultPromptDescription,
        !currentPrompt,
      );

      const promptItems = prompts.map((prompt) =>
        createPromptMenuItem(
          String(prompt.id),
          prompt.name,
          prompt.tags,
          prompt.content,
          currentPrompt?.id === prompt.id,
        ),
      );

      return [defaultItem, ...promptItems];
    }, [prompts, currentPrompt]);

    const promptTooltip = currentPrompt?.name ?? "默认 Prompt";

    const modelFeatureSupport = chatModelConfig?.features;
    const supportImage =
      modelFeatureSupport?.image ?? modelFeatureSupport?.multimodal ?? false;
    const supportFile = modelFeatureSupport?.file ?? false;

    const abortControllerRef = useRef<AbortController | null>(null);

    // 当切换聊天或持久化数据有更新时同步 ref
    // 注意：通过 updateTime 防止用旧数据覆盖本地变更
    useEffect(() => {
      const actualChat = actualChatRef.current;
      const isDifferentChat = currentChat.id !== actualChat.id;
      const hasNewerUpdate =
        currentChat.id === actualChat.id &&
        currentChat.updateTime > actualChat.updateTime;

      if (isDifferentChat || hasNewerUpdate) {
        actualChatRef.current = currentChat;
        setUpdateCounter((prev) => prev + 1);
      }
    }, [currentChat]);

    // 抽离的公共方法：处理消息发送逻辑
    const processMessageSending = useMemoizedFn(
      async (
        userMessage: RequestMessage,
        shouldClearInput = true,
        shouldCreateNewChat = true,
      ) => {
        const perf = measurePerformance("sendMessage");
        setSendLoading(true);

        scrollToBottom();

        const responseMessage: ResponseMessage = {
          role: Role.Assistant,
          content: "...",
        };

        // 如果当前没有真实的对话（id为0），则先创建一个新对话
        let actualCurrentChat = actualChatRef.current;
        if (shouldCreateNewChat && actualCurrentChat.id === 0) {
          try {
            const defaultSystemPrompt =
              customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
            const systemContent =
              (actualCurrentChat.messages[0] as ResponseMessage | undefined)
                ?.content || defaultSystemPrompt;
            const systemMessage: ResponseMessage = {
              role: Role.System,
              content: systemContent || defaultSystemPrompt,
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
            return;
          }
        }

        // 准备发送的消息（只包含 RequestMessage）
        // 在用户的系统 Prompt 后追加思维导图语法说明和 Skill 元信息
        const defaultSystemPromptForSend =
          customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
        const baseSystemContent =
          (actualCurrentChat.messages[0] as ResponseMessage | undefined)
            ?.content || defaultSystemPromptForSend;

        // 构建 Skill 元信息 Prompt（减少工具调用次数）
        const skillPrompt = buildSkillPromptSync(skills);

        const systemContent =
          baseSystemContent +
          MIND_MAP_PROMPT +
          WHITE_BOARD_PROMPT +
          skillPrompt;

        const systemMessage: RequestMessage = {
          role: Role.System,
          content: [
            {
              type: "text",
              text: systemContent,
            },
          ],
        };

        const sendMessages: RequestMessage[] = [
          systemMessage,
          ...actualCurrentChat.messages
            .slice(1)
            .slice(-20)
            .map((message): RequestMessage => {
              if (message.role === Role.User) {
                return message as RequestMessage;
              } else if (message.role === Role.Tool) {
                // 工具执行结果消息直接传递
                return message as RequestMessage;
              } else {
                // 将 ResponseMessage 转换为 RequestMessage 格式
                const responseMsg = message as ResponseMessage;
                const requestMessage: RequestMessage = {
                  role: message.role,
                  content: [{ type: "text", text: responseMsg.content }],
                };

                // 保留工具调用信息，避免模型重复调用
                if (
                  responseMsg.tool_calls &&
                  responseMsg.tool_calls.length > 0
                ) {
                  requestMessage.tool_calls = responseMsg.tool_calls;
                }

                return requestMessage;
              }
            }),
          userMessage,
        ];

        // 立即添加用户消息和初始的助手回复到状态中
        const chatWithNewMessages = {
          ...actualCurrentChat,
          messages: [
            ...actualCurrentChat.messages,
            userMessage,
            responseMessage,
          ],
          promptId: actualCurrentChat.promptId ?? null,
        };

        // 更新当前聊天状态
        actualCurrentChat = chatWithNewMessages;
        actualChatRef.current = chatWithNewMessages;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(chatWithNewMessages);

        // 添加新消息后立即滚动到底部（重置自动滚动）
        setIsAutoScrollEnabled(true);
        setTimeout(() => {
          if (messagesRef.current) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        }, 0);

        if (shouldClearInput) {
          editTextRef.current?.clear();
        }

        if (!chatProviderConfig || !chatModelConfig) {
          message.error("请先在设置中配置对话功能的大模型");
          setSendLoading(false);
          return;
        }

        const knowledgeOptions: KnowledgeOptions | undefined =
          ragEnabled && embeddingModelInfo
            ? {
                enable: true,
                modelInfo: embeddingModelInfo,
                limit: 5,
              }
            : undefined;

        chatLLMStream(
          chatProviderConfig,
          chatModelConfig,
          sendMessages,
          {
            enableTools: true,
            reasoningEffort: chatModelConfig?.features?.thinking
              ? effectiveReasoningEffort
              : undefined,
            onFinish: async () => {
              try {
                const updatedChatMessage =
                  await updateChatMessage(actualCurrentChat);
                actualChatRef.current = updatedChatMessage;
                setUpdateCounter((prev) => prev + 1);
                updateCurrentChat(updatedChatMessage);

                // 确保消息结束时滚动到底部（如果自动滚动启用）
                scrollToBottom();

                try {
                  if (
                    ENABLE_TITLE_SUMMARY &&
                    titleProviderConfig &&
                    titleModelConfig
                  ) {
                    // 为标题生成准备消息
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
                          content: [
                            { type: "text", text: SUMMARY_TITLE_PROMPT },
                          ],
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
                          if (content) {
                            const updateChat = produce(
                              updatedChatMessage,
                              (draft) => {
                                draft.title = content.slice(0, 20);
                              },
                            );
                            const saved = await updateChatMessage(updateChat);
                            actualChatRef.current = saved;
                            setUpdateCounter((prev) => prev + 1);
                            updateCurrentChat(saved);
                            titleRef.current?.setValue(content.slice(0, 20));
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

            onUpdate: (full: string, _inc: string, reasoningText?: string) => {
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

                  // 向后兼容：保留旧字段
                  lastMessage.content = full;
                  if (reasoningText) {
                    lastMessage.reasoning_content = reasoningText;
                  }

                  // 新逻辑：使用 content_blocks
                  if (!lastMessage.content_blocks) {
                    lastMessage.content_blocks = [];
                  }

                  const blocks = lastMessage.content_blocks;
                  const lastBlock = blocks[blocks.length - 1];

                  // 如果要添加新的 text 块，检查是否需要标记前面的 reasoning 块为完成
                  if (
                    lastBlock?.type === "reasoning" &&
                    !lastBlock.endTime &&
                    full.trim()
                  ) {
                    const now = Date.now();
                    lastBlock.endTime = now;
                    if (lastBlock.startTime) {
                      lastBlock.duration = now - lastBlock.startTime;
                    }
                  }

                  // 如果最后一个块是 text 类型，更新它
                  if (lastBlock?.type === "text") {
                    lastBlock.content = full;
                  } else if (full.trim()) {
                    // 最后一个块不是 text 类型，检查是否需要创建新块
                    // 查找是否已经存在内容相同的 text 块（避免重复）
                    const existingTextBlock = blocks.find(
                      (block) =>
                        block.type === "text" &&
                        block.content.trim() === full.trim(),
                    );

                    if (existingTextBlock) {
                      // 已经存在相同内容的 text 块，更新它而不是创建新的
                      if (existingTextBlock.type === "text") {
                        existingTextBlock.content = full;
                      }
                    } else {
                      // 不存在相同内容的块，创建新的
                      blocks.push({ type: "text", content: full });
                    }
                  }
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

            onReasoning: (full: string) => {
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

                  // 向后兼容：保留旧字段
                  lastMessage.reasoning_content = full;
                  if (!lastMessage.content) {
                    lastMessage.content = "";
                  }

                  // 新逻辑：使用 content_blocks
                  if (!lastMessage.content_blocks) {
                    lastMessage.content_blocks = [];
                  }

                  const blocks = lastMessage.content_blocks;
                  const lastBlock = blocks[blocks.length - 1];

                  // 如果最后一个块是 reasoning 类型，更新它
                  if (lastBlock?.type === "reasoning") {
                    lastBlock.content = full;
                    // 保留已有的 startTime，不重复设置
                  } else if (full.trim()) {
                    // 只有内容非空时才追加新的 reasoning 块
                    // 同时检查是否与之前的任何 reasoning 块重复
                    const hasDuplicateReasoning = blocks.some(
                      (block) =>
                        block.type === "reasoning" &&
                        block.content.trim() === full.trim(),
                    );

                    if (!hasDuplicateReasoning) {
                      blocks.push({
                        type: "reasoning",
                        content: full,
                        startTime: Date.now(), // 记录开始思考的时间戳
                      });
                    }
                  }
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

            onToolCallsUpdate: (executions: ToolCallExecutionState[]) => {
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

                  // 向后兼容：保留旧字段
                  lastMessage.tool_executions = executions;

                  // 新逻辑：使用 content_blocks
                  if (!lastMessage.content_blocks) {
                    lastMessage.content_blocks = [];
                  }

                  const blocks = lastMessage.content_blocks;

                  // 查找最近的未完成的 reasoning 块并标记为完成
                  for (let i = blocks.length - 1; i >= 0; i--) {
                    if (blocks[i].type === "reasoning") {
                      const reasoningBlock = blocks[i];
                      if (
                        reasoningBlock.type === "reasoning" &&
                        !reasoningBlock.endTime
                      ) {
                        const now = Date.now();
                        reasoningBlock.endTime = now;
                        if (reasoningBlock.startTime) {
                          reasoningBlock.duration =
                            now - reasoningBlock.startTime;
                        }
                      }
                      break; // 只处理最近的一个 reasoning 块
                    }
                  }

                  // 查找最近的 tool_calls 块（从后往前查找）
                  let lastToolCallsBlockIndex = -1;
                  for (let i = blocks.length - 1; i >= 0; i--) {
                    if (blocks[i].type === "tool_calls") {
                      lastToolCallsBlockIndex = i;
                      break;
                    }
                  }

                  // 判断是否应该创建新块：
                  // 如果找到了 tool_calls 块，且它不是最后一个块（之后有其他块），
                  // 说明上一轮工具调用已经完成，这是新一轮
                  const shouldCreateNewBlock =
                    lastToolCallsBlockIndex !== -1 &&
                    lastToolCallsBlockIndex < blocks.length - 1;

                  if (shouldCreateNewBlock) {
                    // 新一轮工具调用：在创建新块之前，强制完成上一轮所有工具调用
                    const lastToolCallsBlock = blocks[lastToolCallsBlockIndex];
                    if (lastToolCallsBlock.type === "tool_calls") {
                      lastToolCallsBlock.executions =
                        lastToolCallsBlock.executions.map((execution) => {
                          // 如果还处于进行中的状态，强制标记为成功
                          if (
                            execution.status === "pending" ||
                            execution.status === "executing"
                          ) {
                            return {
                              ...execution,
                              status: "success" as const,
                              output: execution.output || "",
                              duration:
                                execution.duration ||
                                Date.now() - execution.timestamp,
                            };
                          }
                          return execution;
                        });
                    }

                    // 收集所有已存在于之前 tool_calls 块中的执行 ID
                    const existingExecutionIds = new Set<string>();
                    blocks.forEach((block) => {
                      if (block.type === "tool_calls") {
                        block.executions.forEach((exec) => {
                          existingExecutionIds.add(exec.toolCallId);
                        });
                      }
                    });

                    // 只添加新的执行到新块中
                    const newExecutions = executions.filter(
                      (exec) => !existingExecutionIds.has(exec.toolCallId),
                    );

                    // 创建新的 tool_calls 块（只包含新的执行）
                    if (newExecutions.length > 0) {
                      blocks.push({
                        type: "tool_calls",
                        executions: newExecutions,
                      });
                    }
                  } else if (lastToolCallsBlockIndex !== -1) {
                    // 同一轮工具调用：更新现有块
                    const block = blocks[lastToolCallsBlockIndex];
                    if (block.type === "tool_calls") {
                      // 收集之前所有 tool_calls 块（不包括当前块）中的执行 ID
                      const previousExecutionIds = new Set<string>();
                      blocks.forEach((b, idx) => {
                        if (
                          b.type === "tool_calls" &&
                          idx < lastToolCallsBlockIndex
                        ) {
                          b.executions.forEach((exec) => {
                            previousExecutionIds.add(exec.toolCallId);
                          });
                        }
                      });

                      // 只保留属于当前轮次的执行
                      block.executions = executions.filter(
                        (exec) => !previousExecutionIds.has(exec.toolCallId),
                      );
                    }
                  } else {
                    // 第一次工具调用：创建新块
                    blocks.push({ type: "tool_calls", executions });
                  }
                }
              });

              // 更新状态和ref
              actualCurrentChat = updatedChat;
              actualChatRef.current = updatedChat;
              setUpdateCounter((prev) => prev + 1);
              updateCurrentChat(updatedChat);

              // 工具执行状态更新时滚动到底部（如果自动滚动启用）
              setTimeout(() => {
                scrollToBottom();
              }, 0);
            },

            onError: () => {
              updateCurrentChat(actualCurrentChat);
              setSendLoading(false);
              abortControllerRef.current = null;

              message.error("请求失败");
              perf.end();
              if (shouldClearInput) {
                setTimeout(() => {
                  // 从消息内容中提取文本用于恢复
                  const textContent = Array.isArray(userMessage.content)
                    ? userMessage.content
                        .filter((item) => item.type === "text")
                        .map((item) => item.text)
                        .join("\n")
                    : typeof userMessage.content === "string"
                      ? userMessage.content
                      : "";
                  editTextRef.current?.setValue(textContent);
                  editTextRef.current?.focusEnd();
                }, 100);
              }
            },

            onController: (controller: AbortController) => {
              abortControllerRef.current = controller;
            },
          },
          knowledgeOptions,
        );
      },
    );

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        if (messagesRef.current) {
          if ("scrollTo" in messagesRef.current) {
            messagesRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }
        }
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

    const handlePromptSelect = useMemoizedFn(({ key }: { key: string }) => {
      if (!canChangePrompt) {
        message.warning("对话开始后无法修改 Prompt");
        return;
      }

      const defaultSystemPromptForSelect =
        customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
      let systemContent = defaultSystemPromptForSelect;
      let promptId: number | null = null;

      if (key !== "default") {
        const targetPrompt = prompts.find((item) => String(item.id) === key);
        if (!targetPrompt) {
          return;
        }
        systemContent = targetPrompt.content;
        promptId = targetPrompt.id;
      }

      const updatedChat = produce(actualChatRef.current, (draft) => {
        const systemMessage: ResponseMessage = {
          role: Role.System,
          content: systemContent,
        };
        draft.messages = [systemMessage];
        draft.promptId = promptId;
      });

      if (actualChatRef.current.id === 0) {
        actualChatRef.current = updatedChat;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChat);
        return;
      }

      updateChatMessage(updatedChat)
        .then((saved) => {
          actualChatRef.current = saved;
          setUpdateCounter((prev) => prev + 1);
          updateCurrentChat(saved);
          message.success("系统 Prompt 已更新");
        })
        .catch((error) => {
          message.error("更新 Prompt 失败");
          console.error(error);
        });
    });

    const visibleMessages = useMemo(() => {
      return actualChatRef.current.messages.filter(
        (message) => message.role !== Role.System,
      );
    }, [updateCounter]);

    // 检查是否滚动到底部
    const isScrolledToBottom = useCallback(() => {
      if (!messagesRef.current) return true;
      const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
      // 允许10px的误差
      return scrollTop + clientHeight >= scrollHeight - 10;
    }, []);

    // 优化的滚动到底部函数
    const scrollToBottom = useMemoizedFn(() => {
      if (!messagesRef.current || visibleMessages.length === 0) return;
      if (!isAutoScrollEnabled) return;
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    });

    // 处理滚动事件
    const handleScroll = useMemoizedFn(() => {
      if (!messagesRef.current) return;

      const isAtBottom = isScrolledToBottom();

      // 如果用户滚动到了底部，重新启用自动滚动
      if (isAtBottom) {
        setIsAutoScrollEnabled(true);
      } else {
        // 如果用户向上滚动，禁用自动滚动
        setIsAutoScrollEnabled(false);
      }
    });

    // 停止流式请求
    const stopStreaming = useMemoizedFn(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        // 立即清除 loading 状态，避免 UI 无响应
        setSendLoading(false);
      }
    });

    useEffect(() => {
      const messagesContainer = messagesRef.current;
      if (!messagesContainer) return;

      messagesContainer.addEventListener("scroll", handleScroll);
      return () => {
        messagesContainer.removeEventListener("scroll", handleScroll);
      };
    }, [handleScroll]);

    // 初始加载时滚动到底部
    useEffect(() => {
      // 延迟执行确保DOM已更新
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }, [currentChat.id, scrollToBottom]);

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

    const sendMessage = useMemoizedFn(async () => {
      if (!editTextRef.current) return;

      const userContent = editTextRef.current.getValue();
      if (!userContent || userContent.length === 0) {
        message.warning("请输入内容");
        return;
      }

      const newMessage: RequestMessage = {
        role: Role.User,
        content: userContent,
      };

      await processMessageSending(newMessage, true, true);
    });

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
        await processMessageSending(userMessage, false, false);
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

    return (
      <>
        <div
          className="border-t-12 border-b-12 border-transparent px-6 py-3 flex-1 min-h-0 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
          ref={messagesRef}
        >
          {visibleMessages.length > 0 && (
            <div className="flex flex-col gap-6 overflow-y-auto">
              {visibleMessages.map((message, index) => {
                const streamingIndex = sendLoading
                  ? visibleMessages.length - 1
                  : -1;
                const isStreaming =
                  sendLoading &&
                  index === streamingIndex &&
                  message.role === Role.Assistant;

                return (
                  <div key={`${message.role}-${index}`} className="py-3">
                    <MessageItem
                      message={message}
                      isDark={isDark}
                      markdownComponents={markdownComponents}
                      isVisible={isVisible}
                      messageIndex={index}
                      onDeleteMessage={handleDeleteMessage}
                      onRegenerateMessage={handleRegenerateMessage}
                      onCreateBranch={handleCreateBranch}
                      messageMeta={{
                        chatId: actualChatRef.current.id,
                        messageIndex: index,
                        isStreaming,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!hideInput && (
          <>
            {!hideRagToggle && embeddingModelInfo && (
              <div className="flex-none flex items-center gap-2 flex-wrap">
                <div
                  className={classNames(
                    "rounded-full border w-fit px-2 py-1 text-sm flex items-center gap-2 cursor-pointer transition-all duration-300",
                    {
                      [activeClass]: ragEnabled,
                      [`${borderClass} ${hoverClass}`]: !ragEnabled,
                    },
                  )}
                  onClick={() => setRagEnabled(!ragEnabled)}
                >
                  <InfoCircleOutlined />
                  知识库增强
                </div>
              </div>
            )}

            <div
              className={classNames(
                "m-1 mt-3 flex-none px-3 py-3 box-border shadow-sm rounded-3xl",
                chatInputBg,
              )}
            >
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <ChatInputArea
                    className="flex-1 min-w-0"
                    contentEditable={!sendLoading}
                    ref={editTextRef}
                    onPressEnter={sendMessage}
                    onStop={stopStreaming}
                    sendLoading={sendLoading}
                    createMessageLoading={createMessageLoading}
                    onCreateNewMessage={onCreateNewMessage}
                    modelSelectItems={modelSelectItems}
                    onModelSelect={handleModelSelect}
                    currentModelName={chatModelConfig?.name}
                    isSupportImage={supportImage}
                    isSupportFile={supportFile}
                    promptSelectItems={
                      hidePromptSelect ? undefined : promptSelectItems
                    }
                    onPromptSelect={
                      hidePromptSelect ? undefined : handlePromptSelect
                    }
                    currentPromptName={
                      hidePromptSelect ? undefined : promptTooltip
                    }
                    promptSelectDisabled={
                      hidePromptSelect || !canChangePrompt || sendLoading
                    }
                    resourceSource={{
                      type: "chat",
                      id: actualChatRef.current.id,
                    }}
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
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
