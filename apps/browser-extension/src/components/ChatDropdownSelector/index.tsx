import { memo, useMemo, useState, useRef } from "react";
import { ChevronDown, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Menu, toast } from "@tau/ui";
import { SelectDropDown, EditText } from "@tau/shared";
import { useConfirmPrompt } from "../../hooks/useConfirmPrompt";
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
    const { confirm: confirmPrompt, confirmDialog } = useConfirmPrompt();

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

    const handleDeleteClick = async (chatId: string) => {
      if (!onChatDelete) return;
      const ok = await confirmPrompt({
        title: "删除对话",
        description: "对话里的所有版本会一起删除。",
        danger: true,
        confirmText: "删除",
      });
      if (!ok) return;
      try {
        await onChatDelete(chatId);
        toast.success("对话删除成功");
      } catch (error) {
        toast.error("删除对话失败");
        console.error(error);
      }
    };

    const renderMenuItem = (item: MenuItem) => {
      if (item.type === "new") {
        return (
          <div className="flex items-center gap-2">
            <Plus size={14} />
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
        {confirmDialog}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            ref={triggerRef}
            className={`flex cursor-pointer items-center gap-1 ${styles.dropdownTrigger}`}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            <ChevronDown
              size={15}
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
            <Menu
              align="end"
              trigger={
                <button
                  className={`shrink-0 rounded p-1 text-gray-500 dark:text-gray-400 ${styles.headerActionButton}`}
                  title="更多操作"
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal size={14} />
                </button>
              }
            >
              <Menu.Item
                danger
                icon={<Trash2 size={14} />}
                onSelect={() => {
                  if (!currentChat.draft) void handleDeleteClick(currentChat.id);
                }}
              >
                删除对话
              </Menu.Item>
            </Menu>
          )}
        </div>
      </div>
    );
  }
);

ChatDropdownSelector.displayName = "ChatDropdownSelector";

export default ChatDropdownSelector;
