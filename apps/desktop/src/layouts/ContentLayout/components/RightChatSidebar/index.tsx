import classnames from "classnames";
import { useShallow } from "zustand/react/shallow";
import { useState, memo, lazy, Suspense, useRef, type ReactNode } from "react";
import { Loading, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";

import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import type { EditTextHandle } from "@/components/EditText";
import type { BlockData } from "@/types/block-preview";
import { TabType } from "@/types/tab";
import useTabStore from "@/stores/useTabStore";

import useRightChatSidebarStore from "@/stores/useRightChatSidebarStore";
import { MAIN_CHAT_BUCKET } from "@/stores/useChatSessionStore";
import { useScopedChat } from "@/hooks/useScopedChat";
import useTheme from "@/hooks/useTheme";

import { MarkdownProvider } from "../ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";

import type { ChatContainerHandle } from "../ChatSidebar/ChatContainer";
import ChatDropdownSelector from "./ChatDropdownSelector";

const ChatContainer = lazy(() => import("../ChatSidebar/ChatContainer"));

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

    // 停靠栏与对话页同属主聊天（同一份目录），各自有自己的新对话草稿；列表由应用启动时加载
    const { rows, currentChat, select, newChat, rename, remove } = useScopedChat(MAIN_CHAT_BUCKET, {
      draftSlot: "dock",
      selectedId: currentChatId,
      onSelect: setCurrentChatId,
      autoLoad: false,
    });

    const [sendLoading, setSendLoading] = useState(false);

    const onTitleChange = useMemoizedFn(async (title: string) => {
      try {
        await rename(currentChat.id, title);
      } catch (error) {
        message.error("标题更新失败");
        console.error(error);
      }
    });

    const handleChatSelect = useMemoizedFn((chatId: string) => {
      chatContainerRef.current?.scrollToTop();
      select(chatId);
    });

    // 失败反馈统一由 ChatDropdownSelector 的 onConfirm 弹出，避免双 toast
    const handleChatDelete = useMemoizedFn((chatId: string) => remove(chatId));

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
                chats={rows}
                currentChat={currentChat}
                onChatSelect={handleChatSelect}
                onTitleChange={onTitleChange}
                onChatDelete={handleChatDelete}
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
                currentChat={currentChat}
                isDark={isDark}
                markdownComponents={markdownComponents}
                isVisible={open}
                sendLoading={sendLoading}
                setSendLoading={setSendLoading}
                titleRef={editTitleRef}
                onCreateNewMessage={newChat}
                createMessageLoading={false}
                preserveScrollPosition
                scrollPositionScope="right-chat-sidebar"
                onChatCreated={select}
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
