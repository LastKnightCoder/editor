import {
  memo,
  useMemo,
  lazy,
  Suspense,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { App, Empty, Spin, Dropdown } from "antd";
import { GitBranch, ChevronDown } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import classnames from "classnames";
import "katex/dist/katex.min.css";

import EditText from "@/components/EditText";
import type { EditTextHandle } from "@/components/EditText";
import { openExternal } from "@/commands";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "@/layouts/ContentLayout/components/ChatSidebar/hooks/usePerformanceMonitor";
import LazySyntaxHighlighter from "@/layouts/ContentLayout/components/ChatSidebar/LazySyntaxHighlighter";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { ResponseMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import BlockCard from "@/components/BlockCard";
import { blockRegistry } from "@/utils/blockRegistry";
import type { BlockData } from "@/types/block-preview";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

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
  promptId: null,
};

// 简单的字符串hash函数
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export type ChatAreaHandle = {
  scrollToTop: () => void;
};

type ChatAreaProps = {
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
};

const ChatArea = memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(
    ({ sendLoading, setSendLoading }, ref) => {
      const { isDark } = useTheme();
      const { message } = App.useApp();
      const editTitleRef = useRef<EditTextHandle>(null);
      const chatContainerRef = useRef<ChatContainerHandle>(null);

      const {
        currentChatId,
        chats,
        createChatMessage,
        updateChatMessage,
        updateCurrentChat,
      } = useChatMessageStore(
        useShallow((state) => ({
          currentChatId: state.currentChatId,
          chats: state.chats,
          createChatMessage: state.createChatMessage,
          updateChatMessage: state.updateChatMessage,
          updateCurrentChat: state.updateCurrentChat,
        })),
      );

      const [createMessageLoading, setCreateMessageLoading] = useState(false);

      const currentChat = useMemo(() => {
        return chats.find((chat) => chat.id === currentChatId);
      }, [chats, currentChatId]);

      // 获取相关分支（主干 + 兄弟分支 + 子分支）
      const siblingBranches = useMemo(() => {
        if (!currentChat) return [];

        const result: typeof chats = [];

        // 找到根对话（主干）
        const findRoot = (chat: typeof currentChat): typeof currentChat => {
          if (!chat.parentChatId) return chat;
          const parent = chats.find((c) => c.id === chat.parentChatId);
          return parent ? findRoot(parent) : chat;
        };

        const root = findRoot(currentChat);

        // 如果当前不是根，添加根作为主干
        if (root.id !== currentChat.id) {
          result.push(root);
        }

        // 获取兄弟分支（同一父级下的所有分支，包括自己）
        if (currentChat.parentChatId) {
          const siblings = chats
            .filter((c) => c.parentChatId === currentChat.parentChatId)
            .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
          result.push(...siblings);
        } else {
          // 当前是根，把自己加入
          result.push(currentChat);
        }

        // 获取自己的子分支
        const children = chats
          .filter((c) => c.parentChatId === currentChat.id)
          .sort((a, b) => (a.branchIndex ?? 0) - (b.branchIndex ?? 0));
        result.push(...children);

        // 如果只有自己一个，不显示切换器
        if (result.length <= 1) {
          return [];
        }

        return result;
      }, [currentChat, chats]);

      // 当前分支在同级分支中的索引
      const currentBranchIndex = useMemo(() => {
        if (!currentChat) return 0;
        return siblingBranches.findIndex((c) => c.id === currentChat.id);
      }, [siblingBranches, currentChat]);

      // 分支切换菜单
      const branchMenuItems = useMemo(() => {
        if (!currentChat) return [];

        return siblingBranches.map((chat) => {
          let prefix = "";
          if (!chat.parentChatId) {
            prefix = "主干: ";
          } else if (chat.parentChatId === currentChat.id) {
            prefix = "↳ "; // 子分支
          }

          return {
            key: chat.id.toString(),
            label: prefix + chat.title,
            disabled: chat.id === currentChat.id,
            onClick: () => {
              useChatMessageStore.setState({ currentChatId: chat.id });
            },
          };
        });
      }, [siblingBranches, currentChat]);

      const onCreateNewMessage = useMemoizedFn(async () => {
        const messages: ResponseMessage[] = [
          {
            role: Role.System,
            content: DEFAULT_SYSTEM_PROMPT,
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

      const handleLinkClick = useMemoizedFn(
        (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
          if (href) {
            event.preventDefault();
            openExternal(href).catch((err) => {
              console.error("打开链接失败:", err);
            });
          }
        },
      );

      const markdownComponents = useMemo(() => {
        const CodeBlockRenderer: React.FC<{
          children?: React.ReactNode;
          className?: string;
        }> = ({ children, className, ...rest }) => {
          const { messageMeta } = useMarkdownContext();
          const isGenerating = !!messageMeta?.isStreaming;
          const sourceChatId = messageMeta?.chatId ?? 0;
          const sourceMessageIndex = messageMeta?.messageIndex ?? 0;
          const blockIndex = messageMeta?.blockIndex;
          const messageKey = `${sourceChatId}-${sourceMessageIndex}`;

          // 修改正则以支持连字符（如 mind-map）
          const match = /language-([\w-]+)/.exec(className || "");
          const language = match ? match[1] : undefined;
          const code = String(children).replace(/\n$/, "");

          // 检查是否是可预览的块类型
          if (language && blockRegistry.isPreviewable(language)) {
            // 使用内容hash生成稳定的block ID
            const stableContent = code.slice(0, 200);
            const idSuffix =
              blockIndex != null
                ? `idx-${blockIndex}`
                : `hash-${simpleHash(stableContent)}`;
            const blockData: BlockData = {
              id: `block-${language}-${messageKey}-${idSuffix}`,
              type: language,
              content: code,
              metadata: {
                type: language,
                language,
                timestamp: Date.now(),
                sourceChatId,
                sourceMessageIndex,
                blockIndex,
                isGenerating,
              },
            };

            // 提取元数据
            const renderer = blockRegistry.getRenderer(language);
            if (renderer?.extractMetadata) {
              Object.assign(blockData.metadata, renderer.extractMetadata(code));
            }

            return <BlockCard block={blockData} />;
          }

          // 代码高亮（对于未注册的语言）
          if (match) {
            return (
              <Suspense fallback={<div>Loading code...</div>}>
                <LazySyntaxHighlighter language={match[1]} {...rest}>
                  {code}
                </LazySyntaxHighlighter>
              </Suspense>
            );
          }

          return (
            <code {...rest} className={className}>
              {children}
            </code>
          );
        };

        return {
          code: CodeBlockRenderer,
          a: ({
            children,
            href,
            ...props
          }: {
            children?: React.ReactNode;
            href?: string;
          }) => {
            return (
              <a
                {...props}
                href={href}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                  handleLinkClick(e, href)
                }
              >
                {children}
              </a>
            );
          },
        };
      }, [handleLinkClick]);

      // 检查是否有消息内容（排除系统消息）
      const hasMessages = useMemo(() => {
        if (!currentChat) return false;
        return (
          currentChat.messages.filter((m) => m.role !== Role.System).length > 0
        );
      }, [currentChat]);

      useImperativeHandle(ref, () => ({
        scrollToTop: () => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollToTop();
          }
        },
      }));

      if (!currentChat) {
        return (
          <div className="flex-1 h-full flex overflow-hidden">
            <div className="flex-1 flex items-center justify-center">
              <Empty description="请选择一个对话" />
            </div>
          </div>
        );
      }

      return (
        <MarkdownProvider isDark={isDark} isVisible={true}>
          <div className="flex-1 min-w-0 h-full flex overflow-hidden">
            {hasMessages ? (
              <div
                className={classnames("flex-1 flex flex-col overflow-hidden")}
              >
                <div className="w-full px-10 py-4 flex justify-between items-center shrink-0">
                  <div className="font-bold flex-1 flex items-center gap-2 min-w-0">
                    <EditText
                      className="px-2"
                      key={currentChat.id}
                      ref={editTitleRef}
                      defaultValue={currentChat.title}
                      onChange={onTitleChange}
                      contentEditable={!sendLoading}
                    />
                  </div>
                  {/* 分支切换器 */}
                  {siblingBranches.length > 1 && (
                    <Dropdown
                      menu={{ items: branchMenuItems }}
                      placement="bottomRight"
                    >
                      <div className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer text-sm text-text-secondary transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                        <GitBranch size={14} />
                        <span>
                          {currentBranchIndex === 0 &&
                          !currentChat?.parentChatId
                            ? "主干"
                            : `分支 ${currentBranchIndex}`}
                        </span>
                        <span className="text-xs opacity-60">
                          ({currentBranchIndex + 1}/{siblingBranches.length})
                        </span>
                        <ChevronDown size={14} />
                      </div>
                    </Dropdown>
                  )}
                </div>

                <div className="flex-1 flex justify-center overflow-hidden mb-3">
                  <div className="w-full max-w-6xl mx-20 flex flex-col overflow-hidden mb-3">
                    {(currentChat ||
                      (!currentChat && !createMessageLoading)) && (
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center h-full">
                            <Spin indicator={<LoadingOutlined />} />
                          </div>
                        }
                      >
                        <ChatContainer
                          ref={chatContainerRef}
                          currentChat={currentChat || DEFAULT_CHAT}
                          isDark={isDark}
                          markdownComponents={markdownComponents}
                          isVisible={true}
                          updateChatMessage={updateChatMessage}
                          updateCurrentChat={updateCurrentChat}
                          sendLoading={sendLoading}
                          setSendLoading={setSendLoading}
                          titleRef={editTitleRef}
                          onCreateNewMessage={onCreateNewMessage}
                          createMessageLoading={createMessageLoading}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // 无消息时：垂直居中，输入框限宽
              <div
                className={classnames(
                  "w-full flex-1 min-h-0 flex flex-col justify-center items-center overflow-hidden px-20",
                )}
              >
                <div className="w-full max-w-6xl">
                  {(currentChat || (!currentChat && !createMessageLoading)) && (
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center h-full">
                          <Spin indicator={<LoadingOutlined />} />
                        </div>
                      }
                    >
                      <ChatContainer
                        ref={chatContainerRef}
                        currentChat={currentChat || DEFAULT_CHAT}
                        isDark={isDark}
                        markdownComponents={markdownComponents}
                        isVisible={true}
                        updateChatMessage={updateChatMessage}
                        updateCurrentChat={updateCurrentChat}
                        sendLoading={sendLoading}
                        setSendLoading={setSendLoading}
                        titleRef={editTitleRef}
                        onCreateNewMessage={onCreateNewMessage}
                        createMessageLoading={createMessageLoading}
                      />
                    </Suspense>
                  )}
                </div>
              </div>
            )}
          </div>
        </MarkdownProvider>
      );
    },
  ),
);

ChatArea.displayName = "ChatArea";

export default ChatArea;
