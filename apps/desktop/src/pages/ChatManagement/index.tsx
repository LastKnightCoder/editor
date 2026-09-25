import { memo, useEffect, useRef, useState } from "react";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import ChatManagementSidebar from "@/features/chat/components/ChatManagementSidebar";
import ChatArea from "@/features/chat/components/ChatArea";
import type { ChatAreaHandle } from "@/features/chat/components/ChatArea";
import useChatMessageStore from "@/stores/useChatMessageStore";

const ChatManagementContent = memo(() => {
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const chats = useChatMessageStore(state => state.chats);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(
    () => useChatMessageStore.getState().currentChatId
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

  const handleChatSelect = useMemoizedFn((chatId: number) => {
    setSelectedChatId(chatId);
    chatAreaRef.current?.scrollToTop();
  });

  useEffect(() => {
    if (selectedChatId !== null && !chats.some(chat => chat.id === selectedChatId)) {
      setSelectedChatId(null);
    }
  }, [chats, selectedChatId]);

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
          sendLoading={sendLoading}
          setSendLoading={setSendLoading}
        />
      </div>
    </div>
  );
});

const ChatManagement = memo(() => <ChatManagementContent />);

export default ChatManagement;
