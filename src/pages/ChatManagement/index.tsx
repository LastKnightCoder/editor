import { memo, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import usePromptStore from "@/stores/usePromptStore";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import { AnimatePresence, motion } from "framer-motion";

const ChatManagement = memo(() => {
  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();
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

  useEffect(() => {
    if (isConnected) {
      initChatMessage();
      initChatGroups();
      initPrompts();
    }
  }, [initChatMessage, initChatGroups, initPrompts, isConnected, database]);

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleChatSelect = useMemoizedFn(() => {
    chatAreaRef.current?.scrollToTop();
  });

  return (
    <div className="flex w-full h-full overflow-hidden">
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
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ChatArea ref={chatAreaRef} />
      </div>
      <AnimatePresence>
        {hideSidebar && (
          <motion.div
            className="absolute top-5 left-5 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SVG
              className="cursor-pointer"
              src={rightSidebarIcon}
              onClick={onFoldSidebar}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ChatManagement;
