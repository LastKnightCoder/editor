import { useState, useMemo, memo, lazy, Suspense, useRef } from "react";
import { Loading, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";
import type { EditTextHandle } from "@/components/EditText";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import { buildVideoNoteSystemPrompt } from "@/tools/videoNoteSearchTool";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

interface VideoNoteChatPanelProps {
  videoNoteId: number;
  mainDbName: string;
  transcript: string;
}

const VideoNoteChatPanel: React.FC<VideoNoteChatPanelProps> = ({
  videoNoteId,
  mainDbName,
  transcript,
}) => {
  const { isDark } = useTheme();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const isConnected = useDatabaseConnected();

  const toolScope = useVideoNoteChat(videoNoteId, mainDbName);

  const systemPrompt = useMemo(() => buildVideoNoteSystemPrompt({ transcript }), [transcript]);

  // 本视频笔记的对话（统一会话 store 按 video-note-chat + videoNoteId 分桶）
  const bucket = useMemo(
    () => ({ scope: "video-note-chat" as const, domainRef: String(videoNoteId) }),
    [videoNoteId]
  );
  const { rows, loaded, currentChat, select, newChat, rename, remove } = useScopedChat(bucket, {
    draftSlot: "video-note",
    autoLoad: isConnected,
  });

  const [sendLoading, setSendLoading] = useState(false);

  const onTitleChange = useMemoizedFn(async (title: string) => {
    try {
      await rename(currentChat.id, title);
    } catch (error) {
      toast.error("更新标题失败");
      console.error(error);
    }
  });

  const handleChatSelect = useMemoizedFn((chatId: string) => {
    chatContainerRef.current?.scrollToTop();
    select(chatId);
  });

  // 代码 / 链接渲染与对话页共用（D-048）
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "video-note-block" });

  if (!loaded) {
    return <Loading minHeight={0} />;
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className="box-border flex h-full flex-col p-4">
        <div className="mb-2 flex items-center justify-between">
          <ChatDropdownSelector
            chats={rows}
            currentChat={currentChat}
            onChatSelect={handleChatSelect}
            onTitleChange={onTitleChange}
            onChatDelete={remove}
            titleRef={editTitleRef}
          />
        </div>

        <Suspense fallback={<Loading minHeight={0} />}>
          <ChatContainer
            ref={chatContainerRef}
            currentChat={currentChat}
            isDark={isDark}
            markdownComponents={markdownComponents}
            isVisible={true}
            chatScope={`video-note-chat:${videoNoteId}`}
            toolScope={toolScope}
            sendLoading={sendLoading}
            setSendLoading={setSendLoading}
            titleRef={editTitleRef}
            onCreateNewMessage={newChat}
            createMessageLoading={false}
            onChatCreated={select}
            customSystemPrompt={systemPrompt}
          />
        </Suspense>
      </div>
    </MarkdownProvider>
  );
};

const VideoNoteChatPanelMemo = memo(VideoNoteChatPanel);
export default VideoNoteChatPanelMemo;
