import { memo, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";

const ChatManagement = memo(() => {
  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();
  const chatAreaRef = useRef<ChatAreaHandle>(null);

  const { initChatMessage, initChatGroups } = useChatMessageStore(
    useShallow((state) => ({
      initChatMessage: state.initChatMessage,
      initChatGroups: state.initChatGroups,
    })),
  );

  useEffect(() => {
    if (isConnected) {
      initChatMessage();
      initChatGroups();
    }
  }, [initChatMessage, initChatGroups, isConnected, database]);

  const handleChatSelect = useMemoizedFn(() => {
    chatAreaRef.current?.scrollToTop();
  });

  return (
    <div className="flex w-full h-full overflow-hidden">
      <ChatManagementSidebar onChatSelect={handleChatSelect} />
      <ChatArea ref={chatAreaRef} />
    </div>
  );
});

export default ChatManagement;
