import { App, Button, Select } from "antd";
import classnames from "classnames";
import { useRef, useState } from "react";
import { produce } from "immer";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import EditText, { EditTextHandle } from "@/components/EditText";
import For from "@/components/For";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import If from "@/components/If";

import MarkdownPreview from "@uiw/react-markdown-preview";
import { useLocalStorageState, useMemoizedFn } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore.ts";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import useChatLLM, { chatWithGPT35 } from "@/hooks/useChatLLM.ts";
import useTheme from "@/hooks/useTheme.ts";

import { ChatMessage, Message } from "@/types";
import { Role, SUMMARY_TITLE_PROMPT } from "@/constants";

import styles from "./index.module.less";

const RightSidebar = () => {
  const chatLLM = useChatLLM();
  const { isDark } = useTheme();
  const { message, modal } = App.useApp();

  const {
    chats,
    createChatMessage,
    updateChatMessage,
    deleteChatMessage
  } = useChatMessageStore(state => ({
    chats: state.chats,
    createChatMessage: state.createChatMessage,
    updateChatMessage: state.updateChatMessage,
    deleteChatMessage: state.deleteChatMessage,
  }));

  const editTextRef = useRef<EditTextHandle>(null);
  const editTitleRef = useRef<EditTextHandle>(null);
  const [currentChat, setCurrentChat] = useState<ChatMessage | undefined>(() => {
    const previousId = localStorage.getItem('right-sidebar-chat-id') || '';
    if (!previousId) return undefined;
    return chats.find(chat => chat.id === Number(previousId));
  });
  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  
  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState('rightSidebarWidth', {
    defaultValue: 320
  });

  const {
    rightSidebarOpen
  } = useGlobalStateStore(state => ({
    rightSidebarOpen: state.rightSidebarOpen
  }));

  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: Message[] = [{
      role: Role.System,
      content: "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。"
    }];
    setCreateMessageLoading(true);
    const createdMessage = await createChatMessage(messages).finally(() => {
      setCreateMessageLoading(false);
    });
    setCurrentChat(createdMessage);
    localStorage.setItem('right-sidebar-chat-id', String(createdMessage.id));
  })

  const onDeleteMessage = useMemoizedFn(() => {
    if (!currentChat) {
      return;
    }
    modal.confirm({
      title: '确定删除此对话吗？',
      content: '此操作将永久删除该对话，是否继续？',
      okButtonProps: {
        danger: true
      },
      okText: '删除',
      cancelText: '取消',
      onOk: async () => {
        await deleteChatMessage(currentChat.id);
        setCurrentChat(undefined);
        localStorage.removeItem('right-sidebar-chat-id');
      }
    })
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;
    const updateChat = produce(currentChat, draft => {
      draft.title = title;
    });
    const updatedChatMessage = await updateChatMessage(updateChat);
    setCurrentChat(updatedChatMessage);
    localStorage.setItem('right-sidebar-chat-id', String(updatedChatMessage.id));
  })

  const sendMessage = useMemoizedFn(async () => {
    if (!currentChat || !editTextRef.current) return;
    const userContent = editTextRef.current.getValue();
    if (!userContent) {
      message.warning('请输入内容');
      return;
    }
    setSendLoading(true);
    const newMessage: Message = {
      role: Role.User,
      content: userContent
    };
    const sendMessages = [...currentChat.messages, newMessage];
    const assistantContent = await chatLLM(sendMessages.slice(-5)).catch(() => {
      return '';
    });
    if (!assistantContent) {
      message.error('请求失败');
      setSendLoading(false);
      return;
    }
    const newCurrentChat = produce(currentChat, draft => {
      draft.messages.push(newMessage);
      draft.messages.push({
        role: Role.Assistant,
        content: assistantContent
      });
    });
    const updatedChatMessage = await updateChatMessage(newCurrentChat).finally(() => {
      setSendLoading(false);
    });
    editTextRef.current.clear();
    editTextRef.current.focus();
    setCurrentChat(updatedChatMessage);
    localStorage.setItem('right-sidebar-chat-id', String(updatedChatMessage.id));
    try {
      const newTitle = await chatWithGPT35([{
        role: Role.System,
        content: SUMMARY_TITLE_PROMPT
      }, ...updatedChatMessage.messages.slice(1).slice(-5)]);
      if (newTitle) {
        const updateChat = produce(updatedChatMessage, draft => {
          draft.title = newTitle;
        });
        await updateChatMessage(updateChat);
        editTitleRef.current?.setValue(newTitle);
      }
    } catch (e) {
      console.error(e);
    }
  })

  return (
    <ResizableAndHideableSidebar
      className={styles.rightSidebar}
      width={rightSidebarWidth || 400}
      style={{
        height: '100%',
      }}
      open={rightSidebarOpen}
      onWidthChange={(width) => {
        setRightSidebarWidth(width);
      }}
      side={'left'}
      minWidth={360}
      maxWidth={920}
    >
      <div className={styles.wrapContainer}>
        <div className={classnames(styles.innerContainer, { [styles.dark]: isDark })}>
          <div className={styles.header}>
            <div className={styles.title}>
              {
                currentChat && (
                  <EditText
                    key={currentChat.id}
                    ref={editTitleRef}
                    defaultValue={currentChat.title}
                    onChange={onTitleChange}
                    contentEditable={!sendLoading}
                  />
                )
              }
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
              {
                chats.length > 0 && (
                  <Select
                    style={{
                      minWidth: 120
                    }}
                    value={currentChat?.id}
                    onChange={id => {
                      const chat = chats.find(chat => chat.id === id);
                      if (chat) {
                        localStorage.setItem('right-sidebar-chat-id', String(chat.id));
                        setCurrentChat(chat);
                      }
                    }}
                    options={chats.map(chat =>({
                      label: chat.title,
                      value: chat.id,
                    }))}
                  />
                )
              }
            </div>

          </div>
          <div className={styles.messages}>
            {
              currentChat && (
                <For
                  data={currentChat.messages.filter(message => message.role !== Role.System)}
                  renderItem={(message, index) => {
                    const { role, content } = message;
                    return (
                      <div
                        key={index}
                        className={styles.message}
                        style={{ maxWidth: '90%', alignSelf: role === Role.User ? 'flex-start' : 'flex-end' }}
                      >
                        <MarkdownPreview
                          source={content}
                          wrapperElement={{
                            "data-color-mode": isDark ? 'dark' : 'light'
                          }}
                          style={{ padding: 16, borderRadius: 12, boxShadow: '0 2px 12px 0 rgba(0, 0, 0, 0.1)' }}
                        />
                      </div>
                    )
                  }}
                />
              )
            }
          </div>
          {
            currentChat ? (
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
              <Button size={'large'} loading={createMessageLoading} onClick={onCreateNewMessage}>创建新对话</Button>
            )
          }
        </div>

      </div>
    </ResizableAndHideableSidebar>
  )
}

export default RightSidebar;
