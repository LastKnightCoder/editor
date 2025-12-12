import { memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import usePromptStore from "@/stores/usePromptStore";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";

const ChatManagement = memo(() => {
  const chatAreaRef = useRef<ChatAreaHandle>(null);

  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "chat-management-hide-sidebar",
    {
      defaultValue: false,
    },
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "chat-management-sidebar-width",
    {
      defaultValue: 300,
    },
  );

  const { initChatMessage, initChatGroups } = useChatMessageStore(
    useShallow((state) => ({
      initChatMessage: state.initChatMessage,
      initChatGroups: state.initChatGroups,
    })),
  );
  const initPrompts = usePromptStore((state) => state.initPrompts);

  // 在数据库连接或切换时加载聊天数据
  useDatabaseChangeEffect(() => {
    initChatMessage();
    initChatGroups();
    initPrompts();
  });

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleChatSelect = useMemoizedFn(() => {
    chatAreaRef.current?.scrollToTop();
  });

  return (
    <div className="flex w-full h-full overflow-hidden relative">
      <ResizeableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <ChatManagementSidebar
          onChatSelect={handleChatSelect}
          onFoldSidebar={onFoldSidebar}
        />
      </ResizeableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={!!hideSidebar}
        onToggle={onFoldSidebar}
        side="left"
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ChatArea ref={chatAreaRef} />
      </div>
    </div>
  );
});

export default ChatManagement;
