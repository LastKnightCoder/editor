import { useState, useMemo, memo, lazy, Suspense, useRef } from "react";
import { Loading, cn, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";
import type { EditTextHandle } from "@/components/EditText";
import ChatDropdownSelector from "@/components/ChatDropdownSelector";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import { buildVideoNoteSystemPrompt } from "@/tools/videoNoteSearchTool";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(() => import("@/components/ChatSidebar/ChatContainer"));

interface VideoNoteChatPanelProps {
  videoNoteId: number;
  mainDbName: string;
  transcript: string;
  /** 停靠在右栏（窄）：水平留白收紧、输入区紧凑 */
  docked?: boolean;
}

/** 新对话的建议提问：总结不再是独立功能，交给对话 */
const SUGGESTED_PROMPTS = ["总结这个视频的核心观点", "按章节列出要点和时间点", "出 5 道自测题"];

function ChatEmptyState({
  hasTranscript,
  onPick,
}: {
  hasTranscript: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
      <h2 className="text-tau-title text-ink-1 font-semibold">问问这个视频</h2>
      {hasTranscript ? (
        <div className="mt-4 flex w-full max-w-[320px] flex-col gap-2">
          {SUGGESTED_PROMPTS.map(prompt => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPick(prompt)}
              className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm ease-tau-out border px-3 py-2 text-left transition-colors duration-[160ms]"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-tau-meta text-ink-3 mt-2">转录完成后，AI 才能基于视频内容回答</p>
      )}
    </div>
  );
}

const VideoNoteChatPanel: React.FC<VideoNoteChatPanelProps> = ({
  videoNoteId,
  mainDbName,
  transcript,
  docked = false,
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
      <div className={cn("box-border flex h-full min-h-0 flex-col pb-3", docked ? "px-3" : "px-5")}>
        <div className="flex h-[52px] shrink-0 items-center justify-between">
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
            compact={docked}
            contentMaxWidth={docked ? undefined : 760}
            emptyState={
              <ChatEmptyState
                hasTranscript={!!transcript}
                onPick={prompt => {
                  void chatContainerRef.current?.sendUserMessage([{ type: "text", text: prompt }]);
                }}
              />
            }
          />
        </Suspense>
      </div>
    </MarkdownProvider>
  );
};

const VideoNoteChatPanelMemo = memo(VideoNoteChatPanel);
export default VideoNoteChatPanelMemo;
