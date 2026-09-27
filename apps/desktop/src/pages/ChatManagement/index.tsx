import { memo, useRef, useState } from "react";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import ChatManagementSidebar from "@/features/chat/components/ChatManagementSidebar";
import ChatArea from "@/features/chat/components/ChatArea";
import type { ChatAreaHandle } from "@/features/chat/components/ChatArea";
import useChatSessionStore, { MAIN_CHAT_BUCKET, bucketKeyOf } from "@/stores/useChatSessionStore";

const ChatManagementContent = memo(() => {
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  // 选中项失效（被删）由 ChatArea 内的 useScopedChat 退回新对话
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    () => useChatSessionStore.getState().currentIds[bucketKeyOf(MAIN_CHAT_BUCKET)] ?? null
  );
  const [sendLoading, setSendLoading] = useState(false);

  const [hideSidebar, setHideSidebar] = useLocalStorageState("chat-management-hide-sidebar", {
    defaultValue: false,
  });

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState("chat-management-sidebar-width", {
    defaultValue: 300,
  });

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleChatSelect = useMemoizedFn((chatId: string) => {
    setSelectedChatId(chatId);
    chatAreaRef.current?.scrollToTop();
  });

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      <ResizableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        onToggle={onFoldSidebar}
        sidebarPosition="left"
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <ChatManagementSidebar selectedChatId={selectedChatId} onChatSelect={handleChatSelect} />
      </ResizableAndHideableSidebar>
      <SidebarToggleButton.Expand isHidden={!!hideSidebar} onToggle={onFoldSidebar} side="left" />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <ChatArea
          ref={chatAreaRef}
          selectedChatId={selectedChatId}
          onSelectChat={setSelectedChatId}
          draftSlot="legacy-chat-page"
          sendLoading={sendLoading}
          setSendLoading={setSendLoading}
        />
      </div>
    </div>
  );
});

const ChatManagement = memo(() => <ChatManagementContent />);

export default ChatManagement;
