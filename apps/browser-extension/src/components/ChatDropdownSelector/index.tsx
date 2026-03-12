import { memo, useMemo, useState, useRef } from "react";
import {
  DownOutlined,
  BranchesOutlined,
  PlusOutlined,
  MoreOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
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
  getChildBranchesCount?: (chatId: string) => Promise<number>;
  disabled?: boolean;
  titleRef?: React.RefObject<EditTextHandle>;
}

interface MenuItem {
  key: string;
  type: "new" | "chat";
  chatId?: string;
  title: string;
  isCurrentChat?: boolean;
  hasBranches?: boolean;
}

interface BranchItem {
  key: string;
  chatId: string;
  title: string;
  isCurrentChat: boolean;
}

const ChatDropdownSelector = memo(
  ({
    chats,
    currentChat,
    onChatSelect,
    onTitleChange,
    onCreateNewChat,
    onChatDelete,
    getChildBranchesCount,
    disabled,
    titleRef,
  }: ChatDropdownSelectorProps) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const triggerRef = useRef<HTMLDivElement>(null);
    const { modal, message } = App.useApp();

    // 获取相关分支
    const siblingBranches = useMemo(() => {
      if (!currentChat || currentChat.id === "0") return [];

      const result: typeof chats = [];

      const findRoot = (chat: typeof currentChat): typeof currentChat => {
        if (!chat.parentChatId) return chat;
        const parent = chats.find((c) => c.id === chat.parentChatId);
        return parent ? findRoot(parent) : chat;
      };

      const root = findRoot(currentChat);

      if (root.id !== currentChat.id) {
        result.push(root);
      }

      if (currentChat.parentChatId) {
        const siblings = chats
          .filter((c) => c.parentChatId === currentChat.parentChatId)
          .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
        result.push(...siblings);
      } else {
        result.push(currentChat);
      }

      const children = chats
        .filter((c) => c.parentChatId === currentChat.id)
        .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
      result.push(...children);

      if (result.length <= 1) {
        return [];
      }

      return result;
    }, [currentChat, chats]);

    const currentBranchIndex = useMemo(() => {
      if (!currentChat || currentChat.id === "0") return 0;
      return siblingBranches.findIndex((c) => c.id === currentChat.id);
    }, [siblingBranches, currentChat]);

    // 构建菜单项
    const menuItems: MenuItem[] = useMemo(() => {
      const items: MenuItem[] = [];

      // 新建对话选项
      items.push({
        key: "new",
        type: "new",
        title: "新建对话",
      });

      // 按更新时间排序的对话列表
      const sortedChats = [...chats]
        .filter((c) => !c.archived)
        .sort((a, b) => b.updateTime - a.updateTime);

      // 只显示根对话（不显示分支，分支通过右侧切换器访问）
      const rootChats = sortedChats.filter((c) => !c.parentChatId);

      rootChats.forEach((root) => {
        const branches = sortedChats.filter((c) => c.parentChatId === root.id);
        const isCurrentChat = currentChat.id === root.id;

        items.push({
          key: `chat-${root.id}`,
          type: "chat",
          chatId: root.id,
          title: root.title,
          isCurrentChat,
          hasBranches: branches.length > 0,
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

      // 检查是否有子分支
      let childBranchesCount = 0;
      if (getChildBranchesCount) {
        try {
          childBranchesCount = await getChildBranchesCount(chatId);
        } catch (error) {
          console.error("Failed to get child branches count:", error);
        }
      }

      // 构建确认对话框的标题和内容
      const title = "确定删除这个对话吗？";
      const content =
        childBranchesCount > 0
          ? `此对话包含 ${childBranchesCount} 个子分支，删除后将同时删除所有子分支。`
          : undefined;

      modal.confirm({
        title,
        content,
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
      if (!onChatDelete || currentChat.id === "0") {
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
    }, [currentChat.id, onChatDelete]);

    const handleHeaderMenuClick: MenuProps["onClick"] = ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "delete" && currentChat.id !== "0") {
        void handleDeleteClick(currentChat.id);
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
        <div
          className={`flex items-center justify-between gap-2 group w-full ${styles.menuItem}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {item.hasBranches && (
              <BranchesOutlined
                style={{ fontSize: 14 }}
                className={`opacity-60 shrink-0 ${styles.icon}`}
              />
            )}
            <span
              className={`truncate ${item.isCurrentChat ? `font-medium text-blue-500 ${styles.currentChat}` : ""}`}
            >
              {item.title}
            </span>
          </div>
        </div>
      );
    };

    // 分支切换下拉
    const [showBranchDropdown, setShowBranchDropdown] = useState(false);
    const branchTriggerRef = useRef<HTMLDivElement>(null);

    const branchItems: BranchItem[] = useMemo(() => {
      return siblingBranches.map((chat) => {
        let prefix = "";
        if (!chat.parentChatId) {
          prefix = "主干: ";
        } else if (chat.parentChatId === currentChat.id) {
          prefix = "↳ ";
        }

        return {
          key: chat.id.toString(),
          chatId: chat.id,
          title: prefix + chat.title,
          isCurrentChat: chat.id === currentChat.id,
        };
      });
    }, [siblingBranches, currentChat]);

    const handleBranchSelect = (item: BranchItem) => {
      if (item.chatId !== currentChat.id) {
        onChatSelect(item.chatId);
      }
    };

    return (
      <div
        className={`flex items-center justify-between gap-2 w-full ${styles.chatDropdownSelector}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            ref={triggerRef}
            className={`flex items-center gap-1 cursor-pointer ${styles.dropdownTrigger}`}
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

          <div className={`flex-1 min-w-0 font-bold ${styles.titleEditor}`}>
            {currentChat.id !== "0" ? (
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

          {onChatDelete && currentChat.id !== "0" && (
            <Dropdown
              menu={{
                items: headerMenuItems,
                onClick: handleHeaderMenuClick,
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <button
                className={`shrink-0 p-1 rounded text-gray-500 dark:text-gray-400 ${styles.headerActionButton}`}
                title="更多操作"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreOutlined style={{ fontSize: 14 }} />
              </button>
            </Dropdown>
          )}
        </div>

        {/* 分支切换器 - 右侧 */}
        {siblingBranches.length > 1 && (
          <>
            <div
              ref={branchTriggerRef}
              className={`shrink-0 flex items-center text-gray-600 dark:text-gray-400 ${styles.branchSwitcher}`}
              onClick={() => setShowBranchDropdown(true)}
            >
              <BranchesOutlined
                style={{ fontSize: 14 }}
                className={styles.icon}
              />
              <span>
                {currentBranchIndex === 0 && !currentChat?.parentChatId
                  ? "主干"
                  : `分支 ${currentBranchIndex}`}
              </span>
              <span className="text-xs opacity-60">
                ({currentBranchIndex + 1}/{siblingBranches.length})
              </span>
              <DownOutlined style={{ fontSize: 14 }} className={styles.icon} />
            </div>

            <SelectDropDown<BranchItem>
              items={branchItems}
              selectedKey={currentChat.id.toString()}
              show={showBranchDropdown}
              onClose={() => setShowBranchDropdown(false)}
              onSelect={handleBranchSelect}
              triggerElement={branchTriggerRef.current}
              getKey={(item: BranchItem) => item.key}
              renderItem={(item: BranchItem) => (
                <span
                  className={`truncate ${item.isCurrentChat ? `font-medium text-blue-500 ${styles.currentChat}` : ""}`}
                >
                  {item.title}
                </span>
              )}
              width={200}
              maxHeight={300}
            />
          </>
        )}
      </div>
    );
  },
);

ChatDropdownSelector.displayName = "ChatDropdownSelector";

export default ChatDropdownSelector;
