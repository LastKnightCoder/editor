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
import { useMemoizedFn } from "ahooks";

import ChatInputArea from "@/components/ChatInputArea";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import { ChatMessage, RequestMessage, ResponseMessage } from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";
import useChatLLM from "@/hooks/useChatLLM";
import useLLMConfig from "@/hooks/useLLMConfig";
import { chat, createChatMessage } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import type { EditTextHandle } from "@/components/EditText";

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

    const editTextRef = useRef<ChatInputAreaHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);

    useImperativeHandle(ref, () => ({
      scrollToTop: () => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = 0;
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
      return currentChat.messages.filter(
        (message) => message.role !== Role.System,
      );
    }, [currentChat]);

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

      const perf = measurePerformance("sendMessage");
      setSendLoading(true);

      scrollToBottom();

      const newMessage: RequestMessage = {
        role: Role.User,
        content: userContent,
      };

      const responseMessage: ResponseMessage = {
        role: Role.Assistant,
        content: "...",
      };

      // 如果当前没有真实的对话（id为0），则先创建一个新对话
      let actualCurrentChat = currentChat;
      if (currentChat.id === 0) {
        try {
          const systemMessage: ResponseMessage = {
            role: Role.System,
            content:
              "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
          };

          const newChatMessages = [systemMessage];
          actualCurrentChat = await createChatMessage(newChatMessages);
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
        newMessage,
      ];

      updateCurrentChat({
        ...actualCurrentChat,
        messages: [...actualCurrentChat.messages, newMessage, responseMessage],
      });

      // 添加新消息后立即滚动到底部（重置自动滚动）
      setIsAutoScrollEnabled(true);
      setTimeout(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 0);

      editTextRef.current.clear();

      if (!chatProviderConfig || !chatModelConfig) {
        message.error("请先在设置中配置对话功能的大模型");
        setSendLoading(false);
        return;
      }

      chatLLMStream(chatProviderConfig, chatModelConfig, sendMessages, {
        onFinish: async (content: string, reasoning_content: string) => {
          try {
            const newCurrentChat = produce(actualCurrentChat, (draft) => {
              draft.messages.push(newMessage);
              draft.messages.push({
                role: Role.Assistant,
                content,
                reasoning_content,
              } as ResponseMessage);
            });

            const updatedChatMessage = await updateChatMessage(newCurrentChat);

            // 确保消息结束时滚动到底部（如果自动滚动启用）
            scrollToBottom();

            try {
              if (titleProviderConfig && titleModelConfig) {
                // 为标题生成准备消息
                const titleMessages: RequestMessage[] =
                  updatedChatMessage.messages
                    .slice(1)
                    .slice(-10)
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

                const newTitle = await chat(
                  titleProviderConfig.apiKey,
                  titleProviderConfig.baseUrl,
                  titleModelConfig.name,
                  [
                    {
                      role: Role.System,
                      content: [{ type: "text", text: SUMMARY_TITLE_PROMPT }],
                    },
                    ...titleMessages,
                  ],
                );

                if (newTitle) {
                  const updateChat = produce(updatedChatMessage, (draft) => {
                    draft.title = newTitle.slice(0, 20);
                  });
                  await updateChatMessage(updateChat);
                  titleRef.current?.setValue(newTitle.slice(0, 20));
                }
              }
            } catch (e) {
              console.error("Failed to generate title:", e);
            }
          } catch (error) {
            message.error("Failed to update chat");
            console.error(error);
          } finally {
            setSendLoading(false);
            setTimeout(() => {
              editTextRef.current?.focusEnd();
            }, 100);
          }
          perf.end();
        },

        onUpdate: (full: string, _inc: string, reasoningText?: string) => {
          const newCurrentChat = produce(actualCurrentChat, (draft) => {
            draft.messages.push(newMessage);
            draft.messages.push({
              role: Role.Assistant,
              reasoning_content: reasoningText,
              content: full,
            } as ResponseMessage);
          });
          updateCurrentChat(newCurrentChat);

          // 更新内容时滚动到底部（如果自动滚动启用）
          setTimeout(() => {
            scrollToBottom();
          }, 0);
        },

        onReasoning: (full: string) => {
          const newCurrentChat = produce(actualCurrentChat, (draft) => {
            draft.messages.push(newMessage);
            draft.messages.push({
              role: Role.Assistant,
              content: "",
              reasoning_content: full,
            } as ResponseMessage);
          });
          updateCurrentChat(newCurrentChat);

          // 推理内容更新时滚动到底部（如果自动滚动启用）
          setTimeout(() => {
            scrollToBottom();
          }, 0);
        },

        onError: () => {
          updateCurrentChat(actualCurrentChat);
          setSendLoading(false);

          message.error("请求失败");
          perf.end();
          setTimeout(() => {
            // 从消息内容中提取文本用于恢复
            const textContent = userContent
              .filter((item) => item.type === "text")
              .map((item) => item.text)
              .join("\n");
            editTextRef.current?.setValue(textContent);
            editTextRef.current?.focusEnd();
          }, 100);
        },
      });
    });

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
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex-none px-3 py-3 box-border bg-[var(--main-bg-color)] rounded-3xl">
          <ChatInputArea
            className="flex-1 min-w-0"
            contentEditable={!sendLoading}
            ref={editTextRef}
            onPressEnter={sendMessage}
            sendLoading={sendLoading}
            createMessageLoading={createMessageLoading}
            onCreateNewMessage={onCreateNewMessage}
            modelSelectItems={modelSelectItems}
            onModelSelect={handleModelSelect}
            currentModelName={chatModelConfig?.name}
            isSupportMultiModal={chatModelConfig?.features?.multimodal}
          />
        </div>
      </>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default memo(ChatContainer);
