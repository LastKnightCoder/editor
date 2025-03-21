import { App, Button, Select } from "antd";
import classnames from "classnames";
import { useMemo, useRef, useState } from "react";
import { produce } from "immer";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneDark,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import For from "@/components/For";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import If from "@/components/If";

import "katex/dist/katex.css";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useChatLLM, { chatWithGPT35 } from "@/hooks/useChatLLM.ts";
import useTheme from "@/hooks/useTheme.ts";
import useScrollToBottom from "./useScrollToBottom";

import { ChatMessage, Message } from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";

import styles from "./index.module.less";

interface RightSidebarProps {
  onWidthChange: (width: number) => void;
}

const rehypePlugins = [rehypeKatex];
const remarkPlugins = [remarkMath, remarkGfm];

const RightSidebar = (props: RightSidebarProps) => {
  const { onWidthChange } = props;
  const { chatLLMStream } = useChatLLM();
  const { isDark } = useTheme();
  const { message, modal } = App.useApp();

  const { chats, createChatMessage, updateChatMessage, deleteChatMessage } =
    useChatMessageStore((state) => ({
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      deleteChatMessage: state.deleteChatMessage,
    }));

  const editTextRef = useRef<EditTextHandle>(null);
  const editTitleRef = useRef<EditTextHandle>(null);
  const [currentChat, setCurrentChat] = useState<ChatMessage | undefined>(
    () => {
      const previousId = localStorage.getItem("right-sidebar-chat-id") || "";
      if (!previousId) return undefined;
      return chats.find((chat) => chat.id === Number(previousId));
    },
  );
  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const isScrolledToBottom = messagesRef.current
    ? Math.abs(
        messagesRef.current.scrollHeight -
          (messagesRef.current.scrollTop + messagesRef.current.clientHeight),
      ) <= 1
    : false;
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    messagesRef,
    isScrolledToBottom,
  );

  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState(
    "rightSidebarWidth",
    {
      defaultValue: 320,
    },
  );

  const { rightSidebarOpen } = useGlobalStateStore((state) => ({
    rightSidebarOpen: state.rightSidebarOpen,
  }));

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const isHitBottom = bottomHeight >= e.scrollHeight - 10;

    setAutoScroll(isHitBottom);
  };

  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: Message[] = [
      {
        role: Role.System,
        content:
          "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。使用 Markdown 语法回答，如果存在数学公式的话，行内数学公式使用 $ 包裹，行间数学公式使用 $$ 包裹。",
      },
    ];
    setCreateMessageLoading(true);
    const createdMessage = await createChatMessage(messages).finally(() => {
      setCreateMessageLoading(false);
    });
    setCurrentChat(createdMessage);
    localStorage.setItem("right-sidebar-chat-id", String(createdMessage.id));
  });

  const onDeleteMessage = useMemoizedFn(() => {
    if (!currentChat) {
      return;
    }
    modal.confirm({
      title: "确定删除此对话吗？",
      content: "此操作将永久删除该对话，是否继续？",
      okButtonProps: {
        danger: true,
      },
      okText: "删除",
      cancelText: "取消",
      onOk: async () => {
        await deleteChatMessage(currentChat.id);
        setCurrentChat(undefined);
        localStorage.removeItem("right-sidebar-chat-id");
      },
    });
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;
    const updateChat = produce(currentChat, (draft) => {
      draft.title = title;
    });
    const updatedChatMessage = await updateChatMessage(updateChat);
    setCurrentChat(updatedChatMessage);
    localStorage.setItem(
      "right-sidebar-chat-id",
      String(updatedChatMessage.id),
    );
  });

  const sendMessage = useMemoizedFn(async () => {
    if (!currentChat || !editTextRef.current) return;
    const userContent = editTextRef.current.getValue();
    if (!userContent) {
      message.warning("请输入内容");
      return;
    }
    setSendLoading(true);
    setAutoScroll(true);
    scrollDomToBottom();

    const newMessage: Message = {
      role: Role.User,
      content: userContent,
    };
    const responseMessage = {
      role: Role.Assistant,
      content: "...",
    };

    const sendMessages = [
      currentChat.messages[0], // System Prompt
      // 最近十条对话，去掉 reason_content
      ...currentChat.messages
        .slice(1)
        .slice(-10)
        .map((message) => ({
          content: message.content,
          role: message.role,
        })),
      newMessage,
    ];
    console.log("sendMessages", sendMessages);
    setCurrentChat({
      ...currentChat,
      messages: [...currentChat.messages, newMessage, responseMessage],
    });
    editTextRef.current.clear();

    chatLLMStream(sendMessages, {
      onFinish: async (content, reasoning_content) => {
        setSendLoading(false);
        const newCurrentChat = produce(currentChat, (draft) => {
          draft.messages.push(newMessage);
          draft.messages.push({
            role: Role.Assistant,
            content,
            reasoning_content,
          });
        });
        const updatedChatMessage = await updateChatMessage(
          newCurrentChat,
        ).finally(() => {
          setSendLoading(false);
        });
        editTextRef.current?.focusEnd();
        setCurrentChat(updatedChatMessage);
        localStorage.setItem(
          "right-sidebar-chat-id",
          String(updatedChatMessage.id),
        );
        scrollDomToBottom();
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
          console.error(e);
        }
      },
      onUpdate: (full, _inc, reasoningText?: string) => {
        const newCurrentChat = produce(currentChat, (draft) => {
          draft.messages.push(newMessage);
          draft.messages.push({
            role: Role.Assistant,
            reasoning_content: reasoningText,
            content: full,
          });
        });
        setCurrentChat(newCurrentChat);
        scrollDomToBottom();
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
        scrollDomToBottom();
      },
      onError: () => {
        setCurrentChat(currentChat);
        setSendLoading(false);
        editTextRef.current?.setValue(userContent);
        editTextRef.current?.focusEnd();
        message.error("请求失败");
      },
    });
  });

  const markdownComponents = useMemo(() => {
    return {
      code(props: any) {
        const { children, className, node, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        return match ? (
          // @ts-ignore
          <SyntaxHighlighter
            {...rest}
            PreTag="div"
            children={String(children).replace(/\n$/, "")}
            language={match[1]}
            style={isDark ? oneDark : oneLight}
          />
        ) : (
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
                  onChange={(id) => {
                    const chat = chats.find((chat) => chat.id === id);
                    if (chat) {
                      localStorage.setItem(
                        "right-sidebar-chat-id",
                        String(chat.id),
                      );
                      setCurrentChat(chat);
                    }
                  }}
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
            onScroll={(e) => onChatBodyScroll(e.currentTarget)}
          >
            {currentChat && (
              <For
                data={currentChat.messages.filter(
                  (message) => message.role !== Role.System,
                )}
                renderItem={(message, index) => {
                  const { role, content, reasoning_content } = message;
                  return (
                    <div
                      key={index}
                      className={classnames(styles.message, {
                        [styles.dark]: isDark,
                      })}
                      style={{
                        maxWidth: "80%",
                        alignSelf:
                          role === Role.User ? "flex-start" : "flex-end",
                      }}
                    >
                      {role === Role.Assistant && reasoning_content && (
                        <blockquote className={styles.reasoningContent}>
                          <Markdown
                            rehypePlugins={rehypePlugins}
                            remarkPlugins={remarkPlugins}
                            components={markdownComponents}
                          >
                            {reasoning_content}
                          </Markdown>
                        </blockquote>
                      )}
                      <Markdown
                        className={styles.markdown}
                        rehypePlugins={rehypePlugins}
                        remarkPlugins={remarkPlugins}
                        components={markdownComponents}
                      >
                        {content}
                      </Markdown>
                    </div>
                  );
                }}
              />
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
              size={"large"}
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

export default RightSidebar;
