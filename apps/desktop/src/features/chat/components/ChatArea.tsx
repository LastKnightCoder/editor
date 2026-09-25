import {
  memo,
  useMemo,
  lazy,
  Suspense,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import { AtSign, CornerDownLeft, FileText } from "lucide-react";
import { Loading, toast } from "@tau/ui";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@/components/EditText";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useTheme from "@/hooks/useTheme";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import { ChatMessage, ResponseMessage, ChatSessionMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import type { BlockData } from "@/types/block-preview";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

/** 阅读列宽：消息、提示条与输入框同一列（D-048，同文章正文 ~72ch 口径） */
const READING_WIDTH = 760;

const DEFAULT_CHAT: ChatMessage = {
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
  titleDirty: false,
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
};

export type ChatAreaHandle = {
  scrollToTop: () => void;
};

type ChatAreaProps = {
  selectedChatId: number | null;
  onSelectChat: (chatId: number | null) => void;
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  /** 可预览块的打开方式（缺省走块预览上下文） */
  onOpenBlock?: (block: BlockData) => void;
  onOpenLibrary?: () => void;
  /** 标题行右侧的附加操作 */
  headerActions?: ReactNode;
};

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
      <h2 className="text-tau-title-lg text-ink-1 font-semibold">想聊点什么？</h2>
      <p className="text-tau-meta text-ink-3 mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft size={13} strokeWidth={1.75} />
          ⌘/Ctrl + Enter 发送
        </span>
        <span className="inline-flex items-center gap-1">
          <AtSign size={13} strokeWidth={1.75} />
          引用卡片、文章、项目文档
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText size={13} strokeWidth={1.75} />
          拖入内容作为上下文
        </span>
      </p>
    </div>
  );
}

/**
 * 对话页纸面（D-048）：标题行（会话切换 / 分支 / 更多）+ ChatContainer（760 阅读列居中）。
 * 会话选择由页面参数驱动，本组件只回调 onSelectChat。
 */
const ChatArea = memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(
    (
      {
        selectedChatId,
        onSelectChat,
        sendLoading,
        setSendLoading,
        onOpenBlock,
        onOpenLibrary,
        headerActions,
      },
      ref
    ) => {
      const { isDark } = useTheme();
      const editTitleRef = useRef<EditTextHandle>(null);
      const chatContainerRef = useRef<ChatContainerHandle>(null);

      const {
        chats,
        createChatMessage,
        updateChatMessage,
        updateCurrentChat,
        createChatBranch,
        deleteChatMessage,
        getChildBranchesCount,
      } = useChatMessageStore(
        useShallow(state => ({
          chats: state.chats,
          createChatMessage: state.createChatMessage,
          updateChatMessage: state.updateChatMessage,
          updateCurrentChat: state.updateCurrentChat,
          createChatBranch: state.createChatBranch,
          deleteChatMessage: state.deleteChatMessage,
          getChildBranchesCount: state.getChildBranchesCount,
        }))
      );

      const [createMessageLoading, setCreateMessageLoading] = useState(false);

      const currentChat = useMemo(
        () => chats.find(chat => chat.id === selectedChatId),
        [chats, selectedChatId]
      );
      const chatToUse = currentChat || DEFAULT_CHAT;

      const onCreateNewMessage = useMemoizedFn(async () => {
        const messages: ResponseMessage[] = [{ role: Role.System, content: DEFAULT_SYSTEM_PROMPT }];
        setCreateMessageLoading(true);
        try {
          const newChat = await createChatMessage(messages, "新对话", null, false);
          onSelectChat(newChat.id);
        } catch (error) {
          toast.error("新建对话失败");
          console.error(error);
        } finally {
          setCreateMessageLoading(false);
        }
      });

      const onTitleChange = useMemoizedFn(async (title: string) => {
        if (!currentChat) return;
        try {
          await updateChatMessage({ ...currentChat, title, titleDirty: true });
        } catch (error) {
          toast.error("标题更新失败");
          console.error(error);
        }
      });

      const onChatDelete = useMemoizedFn(async (chatId: number) => {
        await deleteChatMessage(chatId);
        if (chatId === selectedChatId) onSelectChat(null);
      });

      // ChatContainer 需要的创建对话回调
      const handleCreateChat = useMemoizedFn(
        async (messages: ChatSessionMessage[], title?: string) =>
          await createChatMessage(messages, title, currentChat?.groupId ?? null, false)
      );

      // ChatContainer 需要的创建分支回调
      const handleCreateBranch = useMemoizedFn(
        async (parentChatId: number, messages: ChatSessionMessage[]) =>
          await createChatBranch(parentChatId, messages)
      );

      const markdownComponents = useChatMarkdownComponents({
        isDark,
        onOpenBlock,
        idPrefix: "page-block",
      });

      useImperativeHandle(ref, () => ({
        scrollToTop: () => chatContainerRef.current?.scrollToTop(),
      }));

      return (
        <MarkdownProvider isDark={isDark} isVisible={true}>
          <div className="flex h-full min-w-0 flex-col overflow-hidden">
            <div className="flex h-12 flex-none items-center gap-1 pl-5 pr-3">
              <div className="min-w-0 flex-1">
                <ChatDropdownSelector
                  chats={chats}
                  currentChat={chatToUse}
                  onChatSelect={onSelectChat}
                  onTitleChange={onTitleChange}
                  onChatDelete={onChatDelete}
                  getChildBranchesCount={getChildBranchesCount}
                  titleRef={editTitleRef}
                  disabled={sendLoading}
                  onOpenLibrary={onOpenLibrary}
                />
              </div>
              {headerActions}
            </div>

            <div className="min-h-0 flex-1">
              <Suspense fallback={<Loading minHeight={0} className="h-full" />}>
                <ChatContainer
                  ref={chatContainerRef}
                  currentChat={chatToUse}
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
                  onChatCreated={chatId => onSelectChat(chatId)}
                  onCreateChat={handleCreateChat}
                  onCreateBranch={handleCreateBranch}
                  contentMaxWidth={READING_WIDTH}
                  emptyState={<EmptyHint />}
                />
              </Suspense>
            </div>
          </div>
        </MarkdownProvider>
      );
    }
  )
);

ChatArea.displayName = "ChatArea";

export default ChatArea;
