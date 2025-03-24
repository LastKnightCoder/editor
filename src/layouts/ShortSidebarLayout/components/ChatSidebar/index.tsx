import { App, Button, Select } from "antd";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useState, useMemo, memo, lazy, Suspense, useRef } from "react";
import {
  DeleteOutlined,
  LoadingOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import If from "@/components/If";
import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";

import useChatMessageStore from "@/stores/useChatMessageStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "./hooks/usePerformanceMonitor";

import MermaidRenderer from "./MermaidRenderer";
import LazySyntaxHighlighter from "./LazySyntaxHighlighter";
import { MarkdownProvider } from "./MarkdownContext";

import { Message } from "@/types";
import { Role } from "@/constants";

import styles from "./index.module.less";

const ChatContainer = lazy(() => import("./ChatContainer"));

const ChatSidebar = memo(() => {
  const { isDark } = useTheme();
  const { message, modal } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);

  const {
    open,
    width,
    currentChatId,
    chats,
    createChatMessage,
    updateChatMessage,
    deleteChatMessage,
    updateCurrentChat,
  } = useChatMessageStore(
    useShallow((state) => ({
      open: state.open,
      width: state.width,
      currentChatId: state.currentChatId,
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      deleteChatMessage: state.deleteChatMessage,
      updateCurrentChat: state.updateCurrentChat,
    })),
  );

  const currentChat = useMemo(() => {
    return chats.find((chat) => chat.id === currentChatId);
  }, [chats, currentChatId]);

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

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
      await createChatMessage(messages);
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
        } catch (error) {
          message.error("Failed to delete chat");
          console.error(error);
        }
        perf.end();
      },
    });
  });

  const handleSelectChange = useMemoizedFn((id: number) => {
    const chat = chats.find((chat) => chat.id === id);
    if (chat) {
      useChatMessageStore.setState({ currentChatId: chat.id });
    }
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;

    const perf = measurePerformance("titleChange");
    try {
      const updatedChat = { ...currentChat, title };
      await updateChatMessage(updatedChat);
    } catch (error) {
      message.error("Failed to update title");
      console.error(error);
    }
    perf.end();
  });

  // 只有在侧边栏打开时才需要渲染Markdown组件
  const markdownComponents = useMemo(() => {
    if (!open) return null;

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
  }, [isDark, open]);

  return (
    <ResizableAndHideableSidebar
      className={styles.rightSidebar}
      width={width}
      open={open}
      onWidthChange={(width) => {
        useChatMessageStore.setState({ width });
      }}
      side={"left"}
      minWidth={320}
      maxWidth={920}
      disableResize={!open}
    >
      <MarkdownProvider isDark={isDark} isVisible={open}>
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

            {currentChat && open && (
              <Suspense
                fallback={
                  <div className={styles.loading}>
                    <LoadingOutlined />
                  </div>
                }
              >
                <ChatContainer
                  currentChat={currentChat}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible={open}
                  updateChatMessage={updateChatMessage}
                  updateCurrentChat={updateCurrentChat}
                  sendLoading={sendLoading}
                  setSendLoading={setSendLoading}
                  titleRef={editTitleRef}
                />
              </Suspense>
            )}
          </div>
        </div>
      </MarkdownProvider>
    </ResizableAndHideableSidebar>
  );
});

export default ChatSidebar;
