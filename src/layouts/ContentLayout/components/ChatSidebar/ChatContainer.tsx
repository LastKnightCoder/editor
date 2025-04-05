import React, { useRef, useMemo, memo, useEffect } from "react";
import { App, Button } from "antd";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";

import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";

import { measurePerformance } from "./hooks/usePerformanceMonitor";
import MessageItem from "./MessageItem";

import { ChatMessage, Message } from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";
import useChatLLM, { chatWithGPT35 } from "@/hooks/useChatLLM";

import styles from "./index.module.less";

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
}

const ChatContainer: React.FC<ChatContainerProps> = memo(
  ({
    currentChat,
    isDark,
    markdownComponents,
    isVisible,
    updateChatMessage,
    updateCurrentChat,
    sendLoading,
    setSendLoading,
    titleRef,
  }) => {
    const { message } = App.useApp();
    const { chatLLMStream } = useChatLLM();

    const editTextRef = useRef<EditTextHandle>(null);
    const messagesRef = useRef<HTMLDivElement>(null);

    const visibleMessages = useMemo(() => {
      return currentChat.messages.filter(
        (message) => message.role !== Role.System,
      );
    }, [currentChat]);

    // 优化的滚动到底部函数
    const scrollToBottom = useMemoizedFn(() => {
      if (!messagesRef.current || visibleMessages.length === 0) return;
      setTimeout(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 10);
    });

    // 初始加载时滚动到底部
    useEffect(() => {
      // 延迟执行确保DOM已更新
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }, [currentChat.id, scrollToBottom]);

    // 在消息列表变化时滚动到底部
    useEffect(() => {
      // 如果消息数量增加，滚动到底部
      if (visibleMessages.length > 0) {
        setTimeout(() => {
          scrollToBottom();
        }, 0);
      }
    }, [visibleMessages.length, scrollToBottom]);

    // 监听消息内容变化
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
      if (!userContent) {
        message.warning("请输入内容");
        return;
      }

      const perf = measurePerformance("sendMessage");
      setSendLoading(true);

      scrollToBottom();

      const newMessage: Message = {
        role: Role.User,
        content: userContent,
      };

      const responseMessage: Message = {
        role: Role.Assistant,
        content: "...",
      };

      // Prepare messages for the API
      const sendMessages = [
        currentChat.messages[0], // System Prompt
        ...currentChat.messages
          .slice(1)
          .slice(-10)
          .map((message) => ({
            content: message.content,
            role: message.role,
          })),
        newMessage,
      ];

      updateCurrentChat({
        ...currentChat,
        messages: [...currentChat.messages, newMessage, responseMessage],
      });

      // 添加新消息后立即滚动到底部
      setTimeout(() => {
        if (messagesRef.current) {
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }
      }, 0);

      editTextRef.current.clear();

      chatLLMStream(sendMessages, {
        onFinish: async (content, reasoning_content) => {
          try {
            const newCurrentChat = produce(currentChat, (draft) => {
              draft.messages.push(newMessage);
              draft.messages.push({
                role: Role.Assistant,
                content,
                reasoning_content,
              });
            });

            const updatedChatMessage = await updateChatMessage(newCurrentChat);
            editTextRef.current?.focusEnd();

            // 确保消息结束时滚动到底部
            scrollToBottom();

            try {
              const newTitle = await chatWithGPT35([
                {
                  role: Role.System,
                  content: SUMMARY_TITLE_PROMPT,
                },
                ...updatedChatMessage.messages
                  .slice(1)
                  .slice(-10)
                  .map((message) => ({
                    content: message.content,
                    role: message.role,
                  })),
              ]);

              if (newTitle) {
                const updateChat = produce(updatedChatMessage, (draft) => {
                  draft.title = newTitle.slice(0, 20);
                });
                await updateChatMessage(updateChat);
                titleRef.current?.setValue(newTitle.slice(0, 20));
              }
            } catch (e) {
              console.error("Failed to generate title:", e);
            }
          } catch (error) {
            message.error("Failed to update chat");
            console.error(error);
          } finally {
            setSendLoading(false);
          }
          perf.end();
        },

        onUpdate: (full, _inc, reasoningText) => {
          const newCurrentChat = produce(currentChat, (draft) => {
            draft.messages.push(newMessage);
            draft.messages.push({
              role: Role.Assistant,
              reasoning_content: reasoningText,
              content: full,
            });
          });
          updateCurrentChat(newCurrentChat);

          // 更新内容时滚动到底部
          setTimeout(() => {
            scrollToBottom();
          }, 0);
        },

        onReasoning: (full) => {
          const newCurrentChat = produce(currentChat, (draft) => {
            draft.messages.push(newMessage);
            draft.messages.push({
              role: Role.Assistant,
              content: "",
              reasoning_content: full,
            });
          });
          updateCurrentChat(newCurrentChat);

          // 推理内容更新时滚动到底部
          setTimeout(() => {
            scrollToBottom();
          }, 0);
        },

        onError: () => {
          updateCurrentChat(currentChat);
          setSendLoading(false);
          editTextRef.current?.setValue(userContent);
          editTextRef.current?.focusEnd();
          message.error("请求失败");
          perf.end();
        },
      });
    });

    return (
      <>
        <div className={styles.messages} ref={messagesRef}>
          {visibleMessages.length > 0 && (
            <div className={styles.messagesList}>
              {visibleMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={styles.messageWrapper}
                >
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

        <div className={styles.input}>
          <EditText
            className={styles.inputContent}
            contentEditable={!sendLoading}
            ref={editTextRef}
            onPressEnter={sendMessage}
          />
          <Button
            className={styles.btn}
            loading={sendLoading}
            onClick={sendMessage}
          >
            确定
          </Button>
        </div>
      </>
    );
  },
);

ChatContainer.displayName = "ChatContainer";

export default ChatContainer;
