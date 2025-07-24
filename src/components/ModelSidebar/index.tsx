import React, { useState, useEffect, useMemo } from "react";
import { Button, List, Typography, Space, Tooltip, App } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  MessageOutlined,
  ClockCircleOutlined,
  MenuFoldOutlined,
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

const { Title } = Typography;

interface ModelSidebarProps {
  visible: boolean;
  onChatSelect?: (chatId: number) => void;
  selectedChatId?: number;
  onCreateChat?: () => void;
  onClose?: () => void;
}

const ModelSidebar: React.FC<ModelSidebarProps> = ({
  visible,
  onChatSelect,
  selectedChatId,
  onCreateChat,
  onClose,
}) => {
  const { message: messageApi, modal } = App.useApp();

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

  // 编辑对话
  const handleEditChat = (chat: ChatMessage) => {
    setChatAction("edit");
    setEditingChat(chat);
    setChatModalVisible(true);
  };

  // 删除对话
  const handleDeleteChat = async (chatId: number) => {
    modal.confirm({
      title: "确定删除这个对话吗？",
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        await deleteChatMessage(chatId);
        messageApi.success("对话删除成功");
      },
    });
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
        className={classnames(
          "cursor-pointer rounded-lg p-3 mb-2 border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in-out group",
          "hover:bg-slate-100 dark:hover:bg-slate-700",
          {
            "bg-slate-200 dark:bg-slate-900": isSelected,
            "bg-white dark:bg-stone-900": !isSelected,
          },
        )}
        onClick={() => onChatSelect?.(chat.id)}
      >
        <div className="w-full">
          <div
            className={classnames(
              "font-medium text-sm leading-tight mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-full",
            )}
          >
            {chat.title}
          </div>
          <div className="flex items-center justify-between text-xs text-black dark:text-white">
            <div className="flex items-center flex-1">
              <ClockCircleOutlined className={classnames("mr-1 text-xs")} />
              <span className={classnames("text-xs")}>{formattedTime}</span>
            </div>
            <Space
              size="small"
              className={classnames(
                "opacity-0 transition-opacity duration-200",
                "group-hover:opacity-100",
                {
                  "opacity-100": isSelected,
                },
              )}
            >
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
              <Tooltip title="删除">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  danger
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id);
                  }}
                />
              </Tooltip>
            </Space>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <div
      className={classnames(
        "absolute left-0 top-0 h-full w-[300px] max-w-[80%] bg-white dark:bg-stone-800 border-l border-gray-200 dark:border-gray-600",
        "transform transition-transform duration-300 ease-in-out z-50 overflow-hidden",
        {
          "translate-x-0": visible,
          "-translate-x-full": !visible,
        },
      )}
    >
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-500 flex justify-between items-center min-h-15">
          <div className="flex items-center gap-2 flex-1">
            <MessageOutlined className="text-blue-500 text-base" />
            <Title level={4} className="m-0 text-gray-900 mb-0!">
              对话列表
            </Title>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              icon={<MenuFoldOutlined />}
              className="border-none! bg-transparent! hover:bg-gray-100! dark:hover:bg-gray-700! hover:text-black! dark:hover:text-white!"
              onClick={onClose}
            />
            <Tooltip title="新建对话">
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={onCreateChat}
                className="border-none! bg-transparent! hover:bg-gray-100! dark:hover:bg-gray-700! hover:text-black! dark:hover:text-white!"
              />
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 px-4">
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
