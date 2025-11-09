import { memo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Breadcrumb } from "antd";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import Titlebar from "@/components/Titlebar";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";

const ChatManagement = memo(() => {
  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const navigate = useNavigate();

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

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "对话管理", path: "/chat-management" },
  ];

  return (
    <div className="flex w-full h-full overflow-hidden">
      <ChatManagementSidebar onChatSelect={handleChatSelect} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Titlebar className="h-[60px] flex-shrink-0 w-full">
          <div
            className="h-[60px] pl-10 flex items-center"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <Breadcrumb
              items={breadcrumbItems.map((item) => ({
                title: (
                  <span
                    className="cursor-pointer transition-all duration-300 px-2 py-1 rounded hover:bg-[var(--common-hover-bg)]"
                    onClick={() => navigate(item.path)}
                  >
                    {item.title}
                  </span>
                ),
              }))}
            />
          </div>
        </Titlebar>
        <ChatArea ref={chatAreaRef} />
      </div>
    </div>
  );
});

export default ChatManagement;
