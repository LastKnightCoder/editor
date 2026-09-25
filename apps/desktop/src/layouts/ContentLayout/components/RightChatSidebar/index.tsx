import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useState, useMemo, memo, lazy, Suspense, useRef, type ReactNode } from "react";
import { Loading, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import type { EditTextHandle } from "@/components/EditText";
import type { BlockData } from "@/types/block-preview";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

import useChatMessageStore from "@/stores/useChatMessageStore";
import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import useTheme from "@/hooks/useTheme";
import { measurePerformance } from "../ChatSidebar/hooks/usePerformanceMonitor";

import { MarkdownProvider } from "../ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";

import { ResponseMessage, ChatMessage, ChatSessionMessage } from "@/types";
import { Role, DEFAULT_SYSTEM_PROMPT } from "@/constants";
import type { ChatContainerHandle } from "../ChatSidebar/ChatContainer";
import ChatDropdownSelector from "./ChatDropdownSelector";

const ChatContainer = lazy(() => import("../ChatSidebar/ChatContainer"));

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

export interface RightChatPanelProps {
  /** 面板是否可见（收起时不渲染对话流，保留滚动位置） */
  open: boolean;
  /** 可预览块的打开方式；缺省在 legacy 标签页中打开 */
  onOpenBlock?: (block: BlockData) => void;
  /** 标题行右侧的附加操作（新壳层停靠栏的开页 / 关闭按钮） */
  headerActions?: ReactNode;
  /** 会话列表末行「全部会话…」 */
  onOpenLibrary?: () => void;
}

/**
 * 右侧对话面板主体：会话下拉 + ChatContainer。legacy 右侧栏与新壳层停靠栏共用，
 * 当前会话统一记在 useRightChatSidebarStore.currentChatId。
 */
export const RightChatPanel = memo(
  ({ open, onOpenBlock, headerActions, onOpenLibrary }: RightChatPanelProps) => {
    const { isDark } = useTheme();
    const message = toast;
    const editTitleRef = useRef<EditTextHandle>(null);
    const chatContainerRef = useRef<ChatContainerHandle>(null);

    const { currentChatId, setCurrentChatId } = useRightChatSidebarStore(
      useShallow(state => ({
        currentChatId: state.currentChatId,
        setCurrentChatId: state.setCurrentChatId,
      }))
    );

    const {
      chats,
      updateChatMessage,
      updateCurrentChat,
      createChatBranch,
      deleteChatMessage,
      getChildBranchesCount,
    } = useChatMessageStore(
      useShallow(state => ({
        chats: state.chats,
        updateChatMessage: state.updateChatMessage,
        updateCurrentChat: state.updateCurrentChat,
        createChatBranch: state.createChatBranch,
        deleteChatMessage: state.deleteChatMessage,
        getChildBranchesCount: state.getChildBranchesCount,
      }))
    );

    const currentChat = useMemo(() => {
      if (!currentChatId) return null;
      return chats.find(chat => chat.id === currentChatId);
    }, [chats, currentChatId]);

    const [createMessageLoading, setCreateMessageLoading] = useState(false);
    const [sendLoading, setSendLoading] = useState(false);

    const onCreateNewMessage = useMemoizedFn(async () => {
      const messages: ResponseMessage[] = [
        {
          role: Role.System,
          content: DEFAULT_SYSTEM_PROMPT,
        },
      ];

      setCreateMessageLoading(true);

      try {
        const { createChatMessage } = useChatMessageStore.getState();
        const newChat = await createChatMessage(messages, undefined, undefined, false);
        setCurrentChatId(newChat.id);
      } catch (error) {
        message.error("新建对话失败");
        console.error(error);
      } finally {
        setCreateMessageLoading(false);
      }
    });

    const onTitleChange = useMemoizedFn(async (title: string) => {
      if (!currentChat) return;

      const perf = measurePerformance("titleChange");
      try {
        const updatedChat = { ...currentChat, title, titleDirty: true };
        await updateChatMessage(updatedChat);
      } catch (error) {
        message.error("标题更新失败");
        console.error(error);
      }
      perf.end();
    });

    const handleChatSelect = useMemoizedFn((chatId: number) => {
      chatContainerRef.current?.scrollToTop();
      setCurrentChatId(chatId);
    });

    const handleChatDelete = useMemoizedFn(async (chatId: number) => {
      try {
        await deleteChatMessage(chatId);
        // 如果删除的是当前对话，需要切换到其他对话或清空
        if (currentChatId === chatId) {
          const remainingChats = chats.filter(c => c.id !== chatId);
          if (remainingChats.length > 0) {
            setCurrentChatId(remainingChats[0].id);
          } else {
            setCurrentChatId(null);
          }
        }
      } catch (error) {
        // 失败反馈统一由 ChatDropdownSelector 的 onConfirm 弹出，避免双 toast
        console.error(error);
        throw error;
      }
    });

    const handleChatCreated = useMemoizedFn((chatId: number) => {
      setCurrentChatId(chatId);
    });

    // ChatContainer 需要的创建对话回调
    const handleCreateChat = useMemoizedFn(
      async (messages: ChatSessionMessage[], title?: string) => {
        const { createChatMessage } = useChatMessageStore.getState();
        return await createChatMessage(messages, title, currentChat?.groupId ?? null, false);
      }
    );

    // ChatContainer 需要的创建分支回调
    const handleCreateBranch = useMemoizedFn(
      async (parentChatId: number, messages: ChatSessionMessage[]) => {
        return await createChatBranch(parentChatId, messages);
      }
    );

    // 在主内容区新标签页打开预览
    const handleOpenInTab = useMemoizedFn((block: BlockData) => {
      if (onOpenBlock) {
        onOpenBlock(block);
        return;
      }
      const { createTab } = useTabStore.getState();
      // 使用 createTab 直接创建新标签页，而不是 openInNewTab（会检查重复）
      createTab(
        TabType.BlockPreview,
        { block },
        undefined,
        block.metadata.title || `${block.type} 预览`
      );
    });

    const markdownComponents = useChatMarkdownComponents({
      isDark,
      onOpenBlock: handleOpenInTab,
      idPrefix: "dock-block",
      liveChat: true,
    });

    return (
      <MarkdownProvider isDark={isDark} isVisible={open}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-11 flex-none items-center gap-0.5 pl-3 pr-2">
            <div className="min-w-0 flex-1">
              <ChatDropdownSelector
                chats={chats}
                currentChat={currentChat || DEFAULT_CHAT}
                onChatSelect={handleChatSelect}
                onTitleChange={onTitleChange}
                onChatDelete={handleChatDelete}
                getChildBranchesCount={getChildBranchesCount}
                titleRef={editTitleRef}
                onOpenLibrary={onOpenLibrary}
              />
            </div>
            {headerActions}
          </div>

          <div className={open ? "min-h-0 flex-1" : "hidden"}>
            <Suspense fallback={<Loading minHeight={0} className="h-full" />}>
              <ChatContainer
                ref={chatContainerRef}
                currentChat={currentChat || DEFAULT_CHAT}
                isDark={isDark}
                markdownComponents={markdownComponents}
                isVisible={open}
                updateChatMessage={updateChatMessage}
                updateCurrentChat={updateCurrentChat}
                sendLoading={sendLoading}
                setSendLoading={setSendLoading}
                titleRef={editTitleRef}
                onCreateNewMessage={onCreateNewMessage}
                createMessageLoading={createMessageLoading}
                preserveScrollPosition
                scrollPositionScope="right-chat-sidebar"
                onChatCreated={handleChatCreated}
                onCreateChat={handleCreateChat}
                onCreateBranch={handleCreateBranch}
                compact
              />
            </Suspense>
          </div>
        </div>
      </MarkdownProvider>
    );
  }
);

const RightChatSidebar = memo(() => {
  const { activePanel, width, setWidth } = useRightChatSidebarStore(
    useShallow(state => ({
      activePanel: state.activePanel,
      width: state.width,
      setWidth: state.setWidth,
    }))
  );
  const open = activePanel === "chat";

  return (
    <ResizableAndHideableSidebar
      className={classnames(
        "relative box-border h-full flex-none",
        open && "ml-3 rounded-2xl border shadow-lg",
        open && "border-[var(--th-border)] bg-[var(--th-card-bg)]"
      )}
      width={width}
      open={open}
      onWidthChange={newWidth => {
        setWidth(newWidth);
      }}
      resizeHandleSide="left"
      minWidth={400}
      maxWidth={800}
      disableResize={!open}
      handleOffset={9}
    >
      <RightChatPanel open={open} />
    </ResizableAndHideableSidebar>
  );
});

export default RightChatSidebar;
