import { memo, useState, useMemo, useEffect, lazy, Suspense } from "react";
import { Input, Empty, Spin, ConfigProvider, theme } from "antd";
import {
  FolderOutlined,
  FolderOpenOutlined,
  MessageOutlined,
  SearchOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import dayjs from "dayjs";
import { useShallow } from "zustand/react/shallow";

import useChatMessageStore from "@/stores/useChatMessageStore";
import { ChatMessage, ChatGroup } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import useTheme from "@/hooks/useTheme";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import { openExternal } from "@/commands";
import CustomModal from "@/components/CustomModal";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

interface IChatSelectorModalProps {
  open: boolean;
  onCancel: () => void;
  onSelect: (chatId: number, title: string) => void;
}

const DEFAULT_CHAT = {
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: DEFAULT_SYSTEM_PROMPT,
      reasoning_content: "",
    },
  ],
  title: "新对话",
};

const ChatSelectorModal = memo(({ open, onCancel, onSelect }: IChatSelectorModalProps) => {
  const { isDark } = useTheme();
  const mermaidRenderPreference = useMermaidRenderPreference();
  const [searchText, setSearchText] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);

  const { chats, groups, initChatMessage, initChatGroups } = useChatMessageStore(
    useShallow(state => ({
      chats: state.chats,
      groups: state.groups,
      initChatMessage: state.initChatMessage,
      initChatGroups: state.initChatGroups,
    }))
  );

  useEffect(() => {
    if (open) {
      initChatMessage();
      initChatGroups();
    }
  }, [open, initChatMessage, initChatGroups]);

  const toggleGroup = useMemoizedFn((groupId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  });

  // Filter chats by search text
  const filteredChats = useMemo(() => {
    if (!searchText.trim()) return chats;
    const lowerSearch = searchText.toLowerCase();
    return chats.filter(chat => chat.title.toLowerCase().includes(lowerSearch));
  }, [chats, searchText]);

  // Get current selected chat
  const selectedChat = useMemo(() => {
    return filteredChats.find(chat => chat.id === selectedChatId);
  }, [filteredChats, selectedChatId]);

  const handleChatSelect = useMemoizedFn((chatId: number) => {
    setSelectedChatId(chatId);
  });

  const handleConfirm = useMemoizedFn(() => {
    if (selectedChat) {
      onSelect(selectedChat.id, selectedChat.title);
      setSelectedChatId(null);
      setSearchText("");
    }
  });

  const handleCancel = useMemoizedFn(() => {
    setSelectedChatId(null);
    setSearchText("");
    onCancel();
  });

  const handleLinkClick = useMemoizedFn(
    (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (href) {
        event.preventDefault();
        openExternal(href).catch(err => {
          console.error("打开链接失败:", err);
        });
      }
    }
  );

  const markdownComponents = useMemo(() => {
    return {
      code(props: { children?: React.ReactNode; className?: string }) {
        const { children, className, ...rest } = props;
        const match = /language-(\w+)/.exec(className || "");
        const mermaidMatch = match && match[1] === "mermaid";

        if (mermaidMatch) {
          return (
            <MermaidRenderer
              code={String(children).replace(/\n$/, "")}
              isDark={isDark}
              renderPreference={mermaidRenderPreference}
            />
          );
        }

        if (match) {
          return (
            <LazySyntaxHighlighter language={match[1]} isDark={isDark} {...rest}>
              {String(children).replace(/\n$/, "")}
            </LazySyntaxHighlighter>
          );
        }

        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      },
      a: ({ children, href, ...props }: { children?: React.ReactNode; href?: string }) => {
        return (
          <a
            {...props}
            href={href}
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => handleLinkClick(e, href)}
          >
            {children}
          </a>
        );
      },
    };
  }, [handleLinkClick, isDark, mermaidRenderPreference]);

  const renderChatItem = (chat: ChatMessage) => {
    const isSelected = selectedChatId === chat.id;
    const isArchived = chat.archived;

    return (
      <div
        key={chat.id}
        className={classnames(
          "mx-2 my-0.5 flex cursor-pointer items-center rounded-md px-3 py-2 transition-all duration-200",
          {
            "bg-[var(--th-accent-soft)] text-[var(--th-active-text)]": isSelected,
            "dark:hover: hover:bg-[var(--th-accent-soft)]": !isSelected,
            "text-gray-400 opacity-50": isArchived,
          }
        )}
        onClick={() => handleChatSelect(chat.id)}
      >
        <MessageOutlined
          className={classnames("mr-2 shrink-0 text-base", {
            "text-[var(--th-accent)]": isSelected,
            "text-gray-400": isArchived && !isSelected,
          })}
        />
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
            {chat.title}
          </span>
          <span className={classnames("ml-2 shrink-0 text-xs")}>
            {dayjs(chat.updateTime).format("MM-DD HH:mm")}
          </span>
        </div>
      </div>
    );
  };

  // Render group
  const renderGroup = (group: ChatGroup, level = 0) => {
    const isExpanded = expandedGroups.has(group.id);
    const groupChats = filteredChats
      .filter(c => c.groupId === group.id)
      .sort((a, b) => b.updateTime - a.updateTime);
    const childGroups = groups.filter(g => g.parentId === group.id);

    return (
      <div key={group.id} className="my-1">
        <div
          className="mx-2 my-0.5 flex cursor-pointer items-center rounded-md px-3 py-2 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-zinc-800"
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={() => toggleGroup(group.id)}
        >
          {isExpanded ? (
            <FolderOpenOutlined className="mr-2 text-base text-gray-500" />
          ) : (
            <FolderOutlined className="mr-2 text-base text-gray-500" />
          )}
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
              {group.name}
            </span>
            <span className="ml-2 text-xs text-gray-500">
              ({groupChats.length + childGroups.length})
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="ml-0">
            {childGroups.map(childGroup => renderGroup(childGroup, level + 1))}
            {groupChats.map(chat => (
              <div key={chat.id} style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}>
                {renderChatItem(chat)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Get ungrouped chats
  const ungroupedChats = filteredChats
    .filter(c => !c.groupId)
    .sort((a, b) => b.updateTime - a.updateTime);

  // Get root level groups
  const rootGroups = groups.filter(g => g.parentId === null);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <CustomModal
        title="选择对话"
        open={open}
        onCancel={handleCancel}
        onOk={handleConfirm}
        width={1080}
        okText="确定"
        cancelText="取消"
        centered
        okButtonProps={{ disabled: !selectedChat }}
        contentClassName="p-0 h-[min(760px,calc(100vh-120px))]"
        bodyClassName="flex-1 min-h-0 flex flex-col p-6"
      >
        <div className="flex h-full flex-col">
          <div className="mb-4">
            <Input
              size="large"
              placeholder="搜索对话标题..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </div>

          <div className="flex min-h-0 flex-1 gap-4">
            <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-[#f0f0f0] p-2 dark:border-[#2a2a2a]">
              <div className="py-2">
                {rootGroups.map(group => renderGroup(group))}
                {ungroupedChats.map(chat => renderChatItem(chat))}
              </div>
              {filteredChats.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <Empty description="没有找到对话" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[#f0f0f0] dark:border-[#2a2a2a]">
              {selectedChat ? (
                <MarkdownProvider isDark={isDark} isVisible={true}>
                  <div className="flex h-full flex-col bg-white dark:bg-zinc-900">
                    <div className="border-b border-[#f0f0f0] px-4 py-3 dark:border-[#2a2a2a]">
                      <h3 className="m-0 text-base font-semibold">{selectedChat.title}</h3>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <Suspense
                        fallback={
                          <div className="flex h-full items-center justify-center">
                            <Spin indicator={<LoadingOutlined />} />
                          </div>
                        }
                      >
                        <ChatContainer
                          currentChat={selectedChat || DEFAULT_CHAT}
                          isDark={isDark}
                          markdownComponents={markdownComponents}
                          isVisible={true}
                          updateChatMessage={async () => selectedChat || DEFAULT_CHAT}
                          updateCurrentChat={() => {
                            // do nothing
                            return;
                          }}
                          sendLoading={false}
                          setSendLoading={() => {
                            // do nothing
                            return;
                          }}
                          titleRef={{ current: null }}
                          onCreateNewMessage={() => Promise.resolve()}
                          createMessageLoading={false}
                          hideInput={true}
                          onCreateChat={async () => selectedChat || DEFAULT_CHAT}
                          onCreateBranch={async () => selectedChat || DEFAULT_CHAT}
                        />
                      </Suspense>
                    </div>
                  </div>
                </MarkdownProvider>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Empty description="请选择一个对话" />
                </div>
              )}
            </div>
          </div>
        </div>
      </CustomModal>
    </ConfigProvider>
  );
});

ChatSelectorModal.displayName = "ChatSelectorModal";

export default ChatSelectorModal;
