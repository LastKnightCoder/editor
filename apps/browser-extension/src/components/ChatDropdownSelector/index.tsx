import { memo, useMemo, useState, useRef } from "react";
import { DownOutlined, PlusOutlined, MoreOutlined, DeleteOutlined } from "@ant-design/icons";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { SelectDropDown, EditText } from "@tau/shared";
import type { EditTextHandle } from "@tau/shared";
import type { ChatSession } from "../../types/chat-session";
import styles from "./index.module.css";

interface ChatDropdownSelectorProps {
  chats: ChatSession[];
  currentChat: ChatSession;
  onChatSelect: (chatId: string) => void;
  onTitleChange: (title: string) => void;
  onCreateNewChat: () => void;
  onChatDelete?: (chatId: string) => void;
  disabled?: boolean;
  titleRef?: React.RefObject<EditTextHandle>;
}

interface MenuItem {
  key: string;
  type: "new" | "chat";
  chatId?: string;
  title: string;
  isCurrentChat?: boolean;
}

const ChatDropdownSelector = memo(
  ({
    chats,
    currentChat,
    onChatSelect,
    onTitleChange,
    onCreateNewChat,
    onChatDelete,
    disabled,
    titleRef,
  }: ChatDropdownSelectorProps) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const { modal, message } = App.useApp();

    // 构建菜单项（分支在对话内部的会话树上，在用户消息的 ‹ i/n › 切换，M4-d）
    const menuItems: MenuItem[] = useMemo(() => {
      const items: MenuItem[] = [];

      // 新建对话选项
      items.push({
        key: "new",
        type: "new",
        title: "新建对话",
      });

      // 按更新时间排序的对话列表
      [...chats]
        .sort((a, b) => b.updateTime - a.updateTime)
        .forEach(chat => {
          items.push({
            key: `chat-${chat.id}`,
            type: "chat",
            chatId: chat.id,
            title: chat.title,
            isCurrentChat: currentChat.id === chat.id,
          });
        });

      return items;
    }, [chats, currentChat]);

    const handleSelect = (item: MenuItem) => {
      if (item.type === "new") {
        onCreateNewChat();
      } else if (item.chatId) {
        onChatSelect(item.chatId);
      }
    };

    const handleDeleteClick = (chatId: string) => {
      if (!onChatDelete) return;
      modal.confirm({
        title: "确定删除这个对话吗？",
        content: "对话里的所有版本会一起删除。",
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await onChatDelete(chatId);
            message.success("对话删除成功");
          } catch (error) {
            message.error("删除对话失败");
            console.error(error);
          }
        },
      });
    };

    const headerMenuItems: MenuProps["items"] = useMemo(() => {
      if (!onChatDelete || currentChat.draft) {
        return [];
      }

      return [
        {
          key: "delete",
          danger: true,
          icon: <DeleteOutlined />,
          label: "删除对话",
        },
      ];
    }, [currentChat.draft, onChatDelete]);

    const handleHeaderMenuClick: MenuProps["onClick"] = ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "delete" && !currentChat.draft) {
        handleDeleteClick(currentChat.id);
      }
    };

    const renderMenuItem = (item: MenuItem) => {
      if (item.type === "new") {
        return (
          <div className="flex items-center gap-2">
            <PlusOutlined style={{ fontSize: 14 }} />
            <span>{item.title}</span>
          </div>
        );
      }

      return (
        <div className={`group flex w-full items-center justify-between gap-2 ${styles.menuItem}`}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={`truncate ${item.isCurrentChat ? `font-medium text-blue-500 ${styles.currentChat}` : ""}`}
            >
              {item.title}
            </span>
          </div>
        </div>
      );
    };

    return (
      <div
        className={`flex w-full items-center justify-between gap-2 ${styles.chatDropdownSelector}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            ref={triggerRef}
            className={`flex cursor-pointer items-center gap-1 ${styles.dropdownTrigger}`}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <DownOutlined
              style={{ fontSize: 15 }}
              className={`shrink-0 opacity-60 ${styles.icon}`}
            />
          </div>

          <SelectDropDown<MenuItem>
            items={menuItems}
            selectedKey={`chat-${currentChat.id}`}
            show={showDropdown}
            onClose={() => setShowDropdown(false)}
            onSelect={handleSelect}
            triggerElement={triggerRef.current}
            getKey={(item: MenuItem) => item.key}
            renderItem={renderMenuItem}
            width={220}
            maxHeight={360}
            preferredPlacement="bottom"
          />

          <div className={`min-w-0 flex-1 font-bold ${styles.titleEditor}`}>
            {!currentChat.draft ? (
              <EditText
                key={currentChat.id}
                ref={titleRef}
                defaultValue={currentChat.title}
                onChange={onTitleChange}
                contentEditable={!disabled}
              />
            ) : (
              <span className="text-gray-500 dark:text-gray-400">新对话</span>
            )}
          </div>

          {onChatDelete && !currentChat.draft && (
            <Dropdown
              menu={{
                items: headerMenuItems,
                onClick: handleHeaderMenuClick,
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <button
                className={`shrink-0 rounded p-1 text-gray-500 dark:text-gray-400 ${styles.headerActionButton}`}
                title="更多操作"
                onClick={e => e.stopPropagation()}
              >
                <MoreOutlined style={{ fontSize: 14 }} />
              </button>
            </Dropdown>
          )}
        </div>
      </div>
    );
  }
);

ChatDropdownSelector.displayName = "ChatDropdownSelector";

export default ChatDropdownSelector;
