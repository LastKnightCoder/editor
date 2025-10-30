import { memo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";

const ChatManagement = memo(() => {
  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

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

  return (
    <div className="flex w-full h-full overflow-hidden">
      <ChatManagementSidebar />
      <ChatArea />
    </div>
  );
});

export default ChatManagement;
