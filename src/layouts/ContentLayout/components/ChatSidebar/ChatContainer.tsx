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
} from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";
import useChatLLM from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import useEmbeddingConfig from "@/hooks/useEmbeddingConfig";
import { createChatMessage } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import type { EditTextHandle } from "@/components/EditText";
import { InfoCircleOutlined } from "@ant-design/icons";
import { LuBrain } from "react-icons/lu";
import classNames from "classnames";
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

    const llmConfigs = useSettingStore((state) => state.setting.llmConfigs);
    const embeddingModelInfo = useEmbeddingConfig();

    const [ragEnabled, setRagEnabled] = useLocalStorageState("ragEnabled", {
      defaultValue: false,
    });

    const [enableThinking, setEnableThinking] = useLocalStorageState(
      "enableThinking",
      {
        defaultValue: chatModelConfig?.features?.thinking ?? false,
      },
    );

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

    // 跟踪实际使用的聊天对象，解决新建对话时的状态同步问题
    const actualChatRef = useRef<ChatMessage>(currentChat);

    // 强制更新计数器，用于触发visibleMessages重新计算
    const [updateCounter, setUpdateCounter] = useState(0);

    const abortControllerRef = useRef<AbortController | null>(null);

    // 当 currentChat prop 变化时更新 ref
    useEffect(() => {
      actualChatRef.current = currentChat;
      setUpdateCounter((prev) => prev + 1);
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
            const systemMessage: ResponseMessage = {
              role: Role.System,
              content:
                "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
            };

            const newChatMessages = [systemMessage];
            actualCurrentChat = await createChatMessage(newChatMessages);

            // 立即更新ref，确保UI使用新创建的对话
            actualChatRef.current = actualCurrentChat;
            setUpdateCounter((prev) => prev + 1);
          } catch (error) {
            message.error("创建新对话失败");
            setSendLoading(false);
            return;
          }
        }

        // 准备发送的消息（只包含 RequestMessage）
        const systemMessage: RequestMessage = {
          role: actualCurrentChat.messages[0]?.role || Role.System,
          content:
            actualCurrentChat.messages[0]?.role === Role.System
              ? (actualCurrentChat.messages[0] as ResponseMessage).content
                ? [
                    {
                      type: "text",
                      text: (actualCurrentChat.messages[0] as ResponseMessage)
                        .content,
                    },
                  ]
                : [{ type: "text", text: "" }]
              : [{ type: "text", text: "" }],
        };

        const sendMessages: RequestMessage[] = [
          systemMessage,
          ...actualCurrentChat.messages
            .slice(1)
            .slice(-10)
            .map((message): RequestMessage => {
              if (message.role === Role.User) {
                return message as RequestMessage;
              } else {
                // 将 ResponseMessage 转换为 RequestMessage 格式
                const responseMsg = message as ResponseMessage;
                return {
                  role: message.role,
                  content: [{ type: "text", text: responseMsg.content }],
                };
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
            enableThinking: chatModelConfig.features?.thinking
              ? enableThinking
              : undefined,
            onFinish: async () => {
              try {
                const updatedChatMessage =
                  await updateChatMessage(actualCurrentChat);
                updateCurrentChat(updatedChatMessage);

                // 确保消息结束时滚动到底部（如果自动滚动启用）
                scrollToBottom();

                try {
                  if (titleProviderConfig && titleModelConfig) {
                    // 为标题生成准备消息
                    const titleMessages: RequestMessage[] =
                      updatedChatMessage.messages
                        .slice(1)
                        .slice(-2)
                        .map((message): RequestMessage => {
                          if (message.role === Role.User) {
                            return message as RequestMessage;
                          } else {
                            const responseMsg = message as ResponseMessage;
                            return {
                              role: message.role,
                              content: [
                                { type: "text", text: responseMsg.content },
                              ],
                            };
                          }
                        });

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
                            await updateChatMessage(updateChat);
                            updateCurrentChat(updateChat);
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
                  lastMessage.content = full;
                  if (reasoningText) {
                    lastMessage.reasoning_content = reasoningText;
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
                  lastMessage.reasoning_content = full;
                  if (!lastMessage.content) {
                    lastMessage.content = "";
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

            onError: () => {
              updateCurrentChat(actualCurrentChat);
              setSendLoading(false);
              abortControllerRef.current = null;

              message.error("请求失败");
              perf.end();
              if (shouldClearInput) {
                setTimeout(() => {
                  // 从消息内容中提取文本用于恢复
                  const textContent = userMessage.content
                    .filter((item) => item.type === "text")
                    .map((item) => item.text)
                    .join("\n");
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

        await updateChatMessage(updatedChat);
        actualChatRef.current = updatedChat;
        setUpdateCounter((prev) => prev + 1);
        updateCurrentChat(updatedChat);
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

    return (
      <>
        <div
          className="relative border-t-[12px] border-b-[12px] border-transparent px-6 py-3 flex-1 box-border overflow-y-auto relative will-change-transform [-webkit-overflow-scrolling:touch]"
          ref={messagesRef}
        >
          {visibleMessages.length > 0 && (
            <div className="flex flex-col gap-6 overflow-y-auto">
              {visibleMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className="py-3">
                  <MessageItem
                    message={message}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                    isVisible={isVisible}
                    messageIndex={index}
                    onDeleteMessage={handleDeleteMessage}
                    onRegenerateMessage={handleRegenerateMessage}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {embeddingModelInfo && (
          <div className="flex-none flex items-center gap-2 flex-wrap">
            {chatModelConfig?.features?.thinking && (
              <div
                className={classNames(
                  "rounded-full border border-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 w-fit px-2 py-1 text-sm flex items-center gap-2 cursor-pointer transition-all duration-300",
                  {
                    "bg-[#3b82f6]/10 text-blue-600 border-[#3b82f6]! text-blue-600 dark:text-blue-400 dark:border-blue-300":
                      enableThinking,
                    "bg-transparent border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700":
                      !enableThinking,
                  },
                )}
                onClick={() => setEnableThinking(!enableThinking)}
              >
                <LuBrain />
                思考
              </div>
            )}
            <div
              className={classNames(
                "rounded-full border border-gray-200 dark:border-gray-600 dark:hover:bg-gray-700 w-fit px-2 py-1 text-sm flex items-center gap-2 cursor-pointer transition-all duration-300",
                {
                  "bg-[#3b82f6]/10 text-blue-600 border-[#3b82f6]! text-blue-600 dark:text-blue-400 dark:border-blue-300":
                    ragEnabled,
                  "bg-transparent border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700":
                    !ragEnabled,
                },
              )}
              onClick={() => setRagEnabled(!ragEnabled)}
            >
              <InfoCircleOutlined />
              知识库增强
            </div>
          </div>
        )}

        <div className="mt-3 flex-none px-3 py-3 box-border bg-[#fafafa] dark:bg-[#222222] shadow-sm rounded-3xl">
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
                isSupportMultiModal={chatModelConfig?.features?.multimodal}
              />
            </div>
          </div>
        </div>
      </>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
