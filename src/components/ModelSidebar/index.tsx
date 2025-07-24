import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  List,
  Typography,
  Space,
  Tooltip,
  Popconfirm,
  App,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  MessageOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import dayjs from "dayjs";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import { ChatMessage } from "@/types/chat-message";
import { ResponseMessage } from "@/types";
import { Role } from "@/constants";
import ChatModal from "./ChatModal";
import styles from "./index.module.less";

const { Title } = Typography;

interface ModelSidebarProps {
  visible: boolean;
  onChatSelect?: (chatId: number) => void;
  selectedChatId?: number;
}

const ModelSidebar: React.FC<ModelSidebarProps> = ({
  visible,
  onChatSelect,
  selectedChatId,
}) => {
  const { message: messageApi } = App.useApp();

  // 对话相关状态
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [chatAction, setChatAction] = useState<"create" | "edit">("create");
  const [editingChat, setEditingChat] = useState<ChatMessage | null>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  // 对话存储
  const {
    initChatMessage,
    chats,
    createChatMessage,
    updateChatMessage,
    deleteChatMessage,
  } = useChatMessageStore(
    useShallow((state) => ({
      initChatMessage: state.initChatMessage,
      chats: state.chats,
      createChatMessage: state.createChatMessage,
      updateChatMessage: state.updateChatMessage,
      deleteChatMessage: state.deleteChatMessage,
    })),
  );

  // 初始化对话数据
  useEffect(() => {
    if (isConnected && visible) {
      initChatMessage();
    }
  }, [initChatMessage, isConnected, database, visible]);

  // 按时间排序的对话列表
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => b.updateTime - a.updateTime);
  }, [chats]);

  // 新建对话
  const handleAddChat = () => {
    setChatAction("create");
    setEditingChat(null);
    setChatModalVisible(true);
  };

  // 编辑对话
  const handleEditChat = (chat: ChatMessage) => {
    setChatAction("edit");
    setEditingChat(chat);
    setChatModalVisible(true);
  };

  // 删除对话
  const handleDeleteChat = async (chatId: number) => {
    try {
      await deleteChatMessage(chatId);
      messageApi.success("对话删除成功");
    } catch (error) {
      messageApi.error("删除对话失败");
      console.error(error);
    }
  };

  // 处理对话弹窗提交
  const handleChatModalFinish = async (data: {
    title: string;
    id?: number;
  }) => {
    try {
      if (chatAction === "create") {
        const messages: ResponseMessage[] = [
          {
            role: Role.System,
            content:
              "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。",
          },
        ];
        await createChatMessage(messages, data.title);
        messageApi.success("对话创建成功");
      } else if (data.id) {
        const chatToUpdate = chats.find((chat) => chat.id === data.id);
        if (chatToUpdate) {
          await updateChatMessage({
            ...chatToUpdate,
            title: data.title,
          });
          messageApi.success("对话更新成功");
        }
      }
      setChatModalVisible(false);
      setEditingChat(null);
    } catch (error) {
      messageApi.error(
        chatAction === "create" ? "创建对话失败" : "更新对话失败",
      );
      console.error(error);
    }
  };

  // 处理对话弹窗取消
  const handleChatModalCancel = () => {
    setChatModalVisible(false);
    setEditingChat(null);
  };

  // 渲染对话列表项
  const renderChatItem = (chat: ChatMessage) => {
    const isSelected = chat.id === selectedChatId;
    const formattedTime = dayjs(chat.updateTime).format("MM-DD HH:mm");

    return (
      <List.Item
        key={chat.id}
        className={classnames(styles.chatItem, {
          [styles.selected]: isSelected,
        })}
        onClick={() => onChatSelect?.(chat.id)}
      >
        <div className={styles.chatInfo}>
          <div className={styles.chatTitle}>{chat.title}</div>
          <div className={styles.chatMeta}>
            <ClockCircleOutlined className={styles.timeIcon} />
            <span className={styles.chatTime}>{formattedTime}</span>
            <Space size="small" className={styles.chatActions}>
              <Tooltip title="编辑">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditChat(chat);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="确定删除这个对话吗？"
                onConfirm={() => handleDeleteChat(chat.id)}
                okText="确定"
                cancelText="取消"
              >
                <Tooltip title="删除">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                    onClick={(e) => e.stopPropagation()}
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <div
      className={classnames(styles.sidebar, {
        [styles.visible]: visible,
      })}
    >
      <div className={styles.sidebarContent}>
        <div className={styles.sidebarHeader}>
          <div className={styles.titleSection}>
            <MessageOutlined className={styles.headerIcon} />
            <Title level={4} style={{ margin: 0 }}>
              对话列表
            </Title>
          </div>
          <div className={styles.headerActions}>
            <Tooltip title="新建对话">
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddChat}
              >
                新建对话
              </Button>
            </Tooltip>
          </div>
        </div>

        <div className={styles.chatsList}>
          <List
            size="small"
            dataSource={sortedChats}
            renderItem={renderChatItem}
            locale={{ emptyText: "暂无对话" }}
          />
        </div>

        <ChatModal
          open={chatModalVisible}
          action={chatAction}
          initialData={editingChat || undefined}
          onFinish={handleChatModalFinish}
          onCancel={handleChatModalCancel}
        />
      </div>
    </div>
  );
};

export default ModelSidebar;
