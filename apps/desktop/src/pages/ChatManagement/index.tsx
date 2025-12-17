import { memo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import useChatMessageStore from "@/stores/useChatMessageStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import usePromptStore from "@/stores/usePromptStore";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import ResizablePanel from "@/components/ResizablePanel";
import {
  BlockPreviewProvider,
  useBlockPreview,
} from "@/contexts/BlockPreviewContext";
import BlockPreviewSidebar from "@/components/BlockPreviewSidebar";

const ChatManagementContent = memo(() => {
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const { state: previewState } = useBlockPreview();

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

  // 根据预览面板是否打开来决定布局
  if (previewState.isOpen) {
    return (
      <div className="flex w-full h-full overflow-hidden relative">
        <ResizableAndHideableSidebar
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
        </ResizableAndHideableSidebar>
        <SidebarToggleButton.Expand
          isHidden={!!hideSidebar}
          onToggle={onFoldSidebar}
          side="left"
        />
        {/* 使用 ResizablePanel 分隔聊天区域和预览面板 */}
        <ResizablePanel
          id="chat-preview-panel"
          left={
            <div className="flex flex-col h-full overflow-hidden">
              <ChatArea ref={chatAreaRef} />
            </div>
          }
          right={<BlockPreviewSidebar />}
          initialLeftRatio={0.5}
          minLeft={400}
          minRight={400}
        />
      </div>
    );
  }

  // 预览面板未打开时的布局
  return (
    <div className="flex w-full h-full overflow-hidden relative">
      <ResizableAndHideableSidebar
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
      </ResizableAndHideableSidebar>
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

const ChatManagement = memo(() => {
  return (
    <BlockPreviewProvider>
      <ChatManagementContent />
    </BlockPreviewProvider>
  );
});

export default ChatManagement;
