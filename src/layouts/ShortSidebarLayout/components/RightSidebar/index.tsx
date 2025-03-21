import { App, Button, Select } from "antd";
import classnames from "classnames";
import { useState, useRef, useCallback, useMemo, memo, Suspense } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import "katex/dist/katex.min.css";

import EditText from "@/components/EditText";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import If from "@/components/If";

import useChatMessageStore from "@/stores/useChatMessageStore";
import useGlobalStateStore from "@/stores/useGlobalStateStore";
import useChatLLM, { chatWithGPT35 } from "@/hooks/useChatLLM";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "./hooks/usePerformanceMonitor";
import useScrollToBottom from "./hooks/useScrollToBottom";

import MermaidRenderer from "./MermaidRenderer";
import LazySyntaxHighlighter from "./LazySyntaxHighlighter";
import MessageItem from "./MessageItem";

import { ChatMessage, Message } from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";
import type { EditTextHandle } from "@/components/EditText";

import styles from "./index.module.less";

interface RightSidebarProps {
  onWidthChange: (width: number) => void;
}

const RightSidebar = ({ onWidthChange }: RightSidebarProps) => {
  const { isDark } = useTheme();
  const { message, modal } = App.useApp();
  const { chatLLMStream } = useChatLLM();

  const { chats, createChatMessage, updateChatMessage, deleteChatMessage } =
    useChatMessageStore((state) => ({
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      deleteChatMessage: state.deleteChatMessage,
    }));

  const { rightSidebarOpen } = useGlobalStateStore((state) => ({
    rightSidebarOpen: state.rightSidebarOpen,
  }));

  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState(
    "rightSidebarWidth",
    { defaultValue: 320 },
  );

  const [currentChat, setCurrentChat] = useState<ChatMessage | undefined>(
    () => {
      const previousId = localStorage.getItem("right-sidebar-chat-id") || "";
      if (!previousId) return undefined;
      return chats.find((chat) => chat.id === Number(previousId));
    },
  );

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const editTextRef = useRef<EditTextHandle>(null);
  const editTitleRef = useRef<EditTextHandle>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const { scrollDomToBottom, onChatBodyWheel, autoScroll } = useScrollToBottom(
    messagesRef,
    true,
  );

  const onCreateNewMessage = useMemoizedFn(async () => {
    const perf = measurePerformance("createNewMessage");
    const messages: Message[] = [
      {
        role: Role.System,
        content:
          "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。使用 Markdown 语法回答，如果存在数学公式的话，行内数学公式使用 $ 包裹，行间数学公式使用 $$ 包裹。如果需要绘制流程图，请使用 mermaid 语法。",
      },
    ];

    setCreateMessageLoading(true);

    try {
      const createdMessage = await createChatMessage(messages);
      setCurrentChat(createdMessage);
      localStorage.setItem("right-sidebar-chat-id", String(createdMessage.id));
    } catch (error) {
      message.error("Failed to create new chat");
      console.error(error);
    } finally {
      setCreateMessageLoading(false);
    }
    perf.end();
  });

  const onDeleteMessage = useMemoizedFn(() => {
    if (!currentChat) return;

    modal.confirm({
      title: "确定删除此对话吗？",
      content: "此操作将永久删除该对话，是否继续？",
      okButtonProps: { danger: true },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        const perf = measurePerformance("deleteMessage");
        try {
          await deleteChatMessage(currentChat.id);
          setCurrentChat(undefined);
          localStorage.removeItem("right-sidebar-chat-id");
        } catch (error) {
          message.error("Failed to delete chat");
          console.error(error);
        }
        perf.end();
      },
    });
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;

    const perf = measurePerformance("titleChange");
    try {
      const updateChat = produce(currentChat, (draft) => {
        draft.title = title;
      });
      const updatedChatMessage = await updateChatMessage(updateChat);
      setCurrentChat(updatedChatMessage);
      localStorage.setItem(
        "right-sidebar-chat-id",
        String(updatedChatMessage.id),
      );
    } catch (error) {
      message.error("Failed to update title");
      console.error(error);
    }
    perf.end();
  });

  const sendMessage = useMemoizedFn(async () => {
    if (!currentChat || !editTextRef.current) return;

    const userContent = editTextRef.current.getValue();
    if (!userContent) {
      message.warning("请输入内容");
      return;
    }

    const perf = measurePerformance("sendMessage");
    setSendLoading(true);
    if (autoScroll) {
      scrollDomToBottom();
    }

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

    setCurrentChat({
      ...currentChat,
      messages: [...currentChat.messages, newMessage, responseMessage],
    });

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
          setCurrentChat(updatedChatMessage);
          localStorage.setItem(
            "right-sidebar-chat-id",
            String(updatedChatMessage.id),
          );
          if (autoScroll) {
            scrollDomToBottom();
          }

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
              editTitleRef.current?.setValue(newTitle);
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
        setCurrentChat(newCurrentChat);
        if (autoScroll) {
          scrollDomToBottom();
        }
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
        setCurrentChat(newCurrentChat);
        if (autoScroll) {
          scrollDomToBottom();
        }
      },

      onError: () => {
        setCurrentChat(currentChat);
        setSendLoading(false);
        editTextRef.current?.setValue(userContent);
        editTextRef.current?.focusEnd();
        message.error("请求失败");
        perf.end();
      },
    });
  });

  const handleSelectChange = useCallback(
    (id: number) => {
      const chat = chats.find((chat) => chat.id === id);
      if (chat) {
        localStorage.setItem("right-sidebar-chat-id", String(chat.id));
        setCurrentChat(chat);
      }
    },
    [chats],
  );

  const visibleMessages = useMemo(() => {
    if (!currentChat) return [];
    return currentChat.messages.filter(
      (message) => message.role !== Role.System,
    );
  }, [currentChat]);

  const markdownComponents = useMemo(() => {
    return {
      code(props: any) {
        const { children, className, node, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        const mermaidMatch = match && match[1] === "mermaid";

        if (mermaidMatch) {
          return <MermaidRenderer code={String(children).replace(/\n$/, "")} />;
        }

        if (match) {
          return (
            <Suspense fallback={<div>Loading code...</div>}>
              <LazySyntaxHighlighter language={match[1]} {...rest}>
                {String(children).replace(/\n$/, "")}
              </LazySyntaxHighlighter>
            </Suspense>
          );
        }

        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      },
    };
  }, [isDark]);

  return (
    <ResizableAndHideableSidebar
      className={styles.rightSidebar}
      width={rightSidebarWidth || 400}
      open={rightSidebarOpen}
      onWidthChange={(width, actualWidth) => {
        setRightSidebarWidth(width);
        if (actualWidth !== undefined) {
          onWidthChange(actualWidth);
        }
      }}
      side={"left"}
      minWidth={320}
      maxWidth={920}
      disableResize={!rightSidebarOpen}
    >
      <div className={styles.wrapContainer}>
        <div
          className={classnames(styles.innerContainer, {
            [styles.dark]: isDark,
          })}
        >
          <div className={styles.header}>
            <div className={styles.title}>
              {currentChat && (
                <EditText
                  key={currentChat.id}
                  ref={editTitleRef}
                  defaultValue={currentChat.title}
                  onChange={onTitleChange}
                  contentEditable={!sendLoading}
                />
              )}
            </div>
            <div className={styles.operations}>
              <Button
                disabled={sendLoading || createMessageLoading}
                icon={<PlusOutlined />}
                onClick={onCreateNewMessage}
              >
                新建对话
              </Button>
              <If condition={!!currentChat}>
                <Button
                  danger
                  disabled={sendLoading || createMessageLoading}
                  icon={<DeleteOutlined />}
                  onClick={onDeleteMessage}
                >
                  删除对话
                </Button>
              </If>
              {chats.length > 0 && (
                <Select
                  style={{
                    minWidth: 120,
                  }}
                  value={currentChat?.id}
                  onChange={handleSelectChange}
                  options={chats.map((chat) => ({
                    label: chat.title,
                    value: chat.id,
                  }))}
                />
              )}
            </div>
          </div>

          <div
            className={styles.messages}
            ref={messagesRef}
            onWheel={(e) => {
              if (messagesRef.current) {
                onChatBodyWheel(messagesRef.current, e);
              }
            }}
          >
            {currentChat && visibleMessages.length > 0 && (
              <div className={styles.messagesList}>
                {visibleMessages.map((message, index) => (
                  <MessageItem
                    key={index}
                    message={message}
                    isDark={isDark}
                    markdownComponents={markdownComponents}
                  />
                ))}
              </div>
            )}
          </div>

          {currentChat ? (
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
          ) : (
            <Button
              size="large"
              loading={createMessageLoading}
              onClick={onCreateNewMessage}
            >
              创建新对话
            </Button>
          )}
        </div>
      </div>
    </ResizableAndHideableSidebar>
  );
};

export default memo(RightSidebar);
