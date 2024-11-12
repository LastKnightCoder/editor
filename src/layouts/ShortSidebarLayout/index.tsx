import { Outlet, Routes, Route } from 'react-router-dom';

import Titlebar from '../components/Titlebar';
import SettingModal from "../components/SettingModal";
import Sidebar from './components/Sidebar';
import CardTitlebar from './components/Titlebar/CardTitlebar';
import ArticleTitlebar from "./components/Titlebar/ArticleTitlebar";
import WhiteBoardTitlebar from "./components/Titlebar/WhiteBoardTitlebar";
import DocumentTitlebar from "./components/Titlebar/DocumentTitlebar";
import ProjectTitlebar from "./components/Titlebar/ProjectTitlebar";

import useInitDatabase from "@/hooks/useInitDatabase.ts";

import styles from './index.module.less';
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useLocalStorageState } from "ahooks";
import { CSSProperties, useRef, useState } from "react";
import useGlobalStateStore from "@/stores/useGlobalStateStore.ts";
import { Button, message, Select } from "antd";
import useChatMessageStore from "@/stores/useChatMessageStore.ts";
import { ChatMessage, Message } from "@/types";
import For from "@/components/For";
import { Role } from "@/constants";
import EditText, { EditTextHandle } from "@/components/EditText";
import { produce } from "immer";
import useChatLLM from "@/hooks/useChatLLM.ts";
import MarkdownPreview from '@uiw/react-markdown-preview';
import { PlusOutlined } from "@ant-design/icons";
import useTheme from "@/hooks/useTheme.ts";

const ShortSidebarLayout = () => {
  useInitDatabase();

  const chatLLM = useChatLLM();
  const { isDark } = useTheme();

  const {
    chats,
    createChatMessage,
    updateChatMessage
  } = useChatMessageStore(state => ({
    chats: state.chats,
    createChatMessage: state.createChatMessage,
    updateChatMessage: state.updateChatMessage
  }));
  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [currentChat, setCurrentChat] = useState<ChatMessage>();
  const editTextRef = useRef<EditTextHandle>(null);

  const [rightSidebarWidth, setRightSidebarWidth] = useLocalStorageState('rightSidebarWidth', {
    defaultValue: 320
  });

  const {
    rightSidebarOpen
  } = useGlobalStateStore(state => ({
    rightSidebarOpen: state.rightSidebarOpen
  }));

  const onCreateNewMessage = async () => {
    const messages: Message[] = [{
      role: Role.System,
      content: "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。"
    }];
    setCreateMessageLoading(true);
    const createdMessage = await createChatMessage(messages).finally(() => {
      setCreateMessageLoading(false);
    });
    setCurrentChat(createdMessage);
  }

  const onTitleChange = async (title: string) => {
    if (!currentChat) return;
    const updateChat = produce(currentChat, draft => {
      draft.title = title;
    });
    const updatedChatMessage = await updateChatMessage(updateChat);
    setCurrentChat(updatedChatMessage);
  }

  const sendMessage = async () => {
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
  }

  const containerStyle = {
    '--right-sidebar-width': `${rightSidebarWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={styles.container}
      style={containerStyle}
    >
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route path='/' element={<Titlebar showColumns={false} showSelectDatabase={true} showFocusMode={false} />}>
              <Route path="cards/*" element={<CardTitlebar />} />
              <Route path="articles/" element={<ArticleTitlebar />} />
              <Route path="white-boards/*" element={<WhiteBoardTitlebar />} />
              <Route path="documents/:id" element={<DocumentTitlebar />} />
              <Route path="projects/:id" element={<ProjectTitlebar />} />
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </div>
        <div className={styles.main}>
          <div className={styles.mainContent}>
            <Outlet />
          </div>
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
            maxWidth={920}
          >
            <div className={styles.wrapContainer}>
              <div className={styles.innerContainer}>
                <div className={styles.header}>
                  <Button disabled={sendLoading || createMessageLoading} icon={<PlusOutlined />} onClick={onCreateNewMessage} />
                  {
                    chats.length > 0 && (
                      <Select
                        style={{
                          minWidth: 120
                        }}
                        value={currentChat?.id}
                        onChange={id => {
                          setCurrentChat(chats.find(chat => chat.id === id));
                        }}
                        options={chats.map(chat =>({
                          label: chat.title,
                          value: chat.id,
                        }))}
                      />
                    )
                  }
                  {
                    currentChat && (
                      <EditText
                        key={currentChat.id}
                        defaultValue={currentChat.title}
                        onChange={onTitleChange}
                        contentEditable={!sendLoading}
                      />
                    )
                  }
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
                                warpperElement={{
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
                    <Button loading={createMessageLoading} onClick={onCreateNewMessage}>创建新对话</Button>
                  )
                }
              </div>

            </div>
          </ResizableAndHideableSidebar>
        </div>
      </div>
      <SettingModal />
    </div>
  )
}

export default ShortSidebarLayout;
