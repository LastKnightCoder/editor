import { memo, useRef, useState } from "react";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import ResizableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import ResizablePanel from "@/components/ResizablePanel";
import {
  BlockPreviewProvider,
  useBlockPreview,
} from "@/contexts/BlockPreviewContext";
import BlockPreviewSidebar from "@/components/BlockPreviewSidebar";
import ChatManagementSidebar from "./components/ChatManagementSidebar";
import ChatArea from "./components/ChatArea";
import type { ChatAreaHandle } from "./components/ChatArea";

const ChatManagementContent = memo(() => {
  const chatAreaRef = useRef<ChatAreaHandle>(null);
  const { state: previewState } = useBlockPreview();
  const [sendLoading, setSendLoading] = useState(false);

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

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const handleChatSelect = useMemoizedFn(() => {
    chatAreaRef.current?.scrollToTop();
  });

  return (
    <div className="flex w-full h-full overflow-hidden relative">
      <ResizableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        onToggle={onFoldSidebar}
        sidebarPosition="left"
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <ChatManagementSidebar onChatSelect={handleChatSelect} />
      </ResizableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={!!hideSidebar}
        onToggle={onFoldSidebar}
        side="left"
      />
      {/* 始终使用 ResizablePanel，右侧面板根据 isOpen 状态显示 */}
      <ResizablePanel
        id="chat-preview-panel"
        className="flex h-full flex-1 min-w-0"
        left={
          <div className="flex flex-col h-full overflow-hidden">
            <ChatArea
              ref={chatAreaRef}
              sendLoading={sendLoading}
              setSendLoading={setSendLoading}
            />
          </div>
        }
        right={previewState.isOpen ? <BlockPreviewSidebar /> : null}
        initialLeftRatio={0.5}
        minLeft={400}
        minRight={400}
      />
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
