import {
  useState,
  useMemo,
  memo,
  lazy,
  Suspense,
  useRef,
  forwardRef,
  useCallback,
  useImperativeHandle,
} from "react";
import { PanelRightClose, SquarePen, X } from "lucide-react";
import { IconButton, Loading, cn, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import "katex/dist/katex.min.css";
import type { EditTextHandle } from "@tau/ui";
import ChatDropdownSelector from "@/components/ChatDropdownSelector";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useScopedChat } from "@/hooks/useScopedChat";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import { buildVideoNoteSystemPrompt } from "@/tools/videoNoteSearchTool";
import type { MessageContentItem } from "@tau/shared";
import { formatTimestamp } from "./extensions/VideoTimestamp";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(() => import("@/components/ChatSidebar/ChatContainer"));

interface VideoNoteChatPanelProps {
  videoNoteId: number;
  mainDbName: string;
  transcript: string;
  /** 停靠在右栏（窄）：水平留白收紧、输入区紧凑 */
  docked?: boolean;
  /** 传入即在栏头显示「新对话」与「收起」 */
  onClose?: () => void;
}

/** 从转录带过来的原句：随下一条消息作为引用发出 */
export interface TranscriptQuote {
  text: string;
  /** 秒 */
  time: number;
}

export interface VideoNoteChatPanelHandle {
  attachQuote: (quote: TranscriptQuote) => void;
}

const QUICK_ASKS = [
  { label: "解释", prompt: "解释一下这句话" },
  { label: "展开讲讲", prompt: "结合视频前后内容展开讲讲这里" },
  { label: "举个例子", prompt: "举个例子说明这句话" },
];

const applyQuote = (content: MessageContentItem[], quote: TranscriptQuote) => {
  const lines = `> 视频 ${formatTimestamp(quote.time)}\n> ${quote.text}`;
  const index = content.findIndex(item => item.type === "text");
  if (index < 0) return [{ type: "text" as const, text: lines }, ...content];
  const next = [...content];
  const item = next[index] as Extract<MessageContentItem, { type: "text" }>;
  next[index] = { ...item, text: `${lines}\n\n${item.text}` };
  return next;
};

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

const VideoNoteChatPanel = forwardRef<VideoNoteChatPanelHandle, VideoNoteChatPanelProps>(
  function VideoNoteChatPanel(
    { videoNoteId, mainDbName, transcript, docked = false, onClose },
    ref
  ) {
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

    const [quote, setQuote] = useState<TranscriptQuote | null>(null);
    const quoteRef = useRef(quote);
    quoteRef.current = quote;
    useImperativeHandle(ref, () => ({
      attachQuote: next => {
        setQuote(next);
        window.setTimeout(() => chatContainerRef.current?.focusInput(), 60);
      },
    }));
    // 引用随这一条消息发出，发出即清掉
    const prepareUserContent = useCallback((content: MessageContentItem[]) => {
      const current = quoteRef.current;
      if (!current) return content;
      setQuote(null);
      return applyQuote(content, current);
    }, []);
    const fillInput = (text: string) => {
      chatContainerRef.current?.setInputValue(text);
      chatContainerRef.current?.focusInput();
    };

    const accessory = quote ? (
      <div className="mb-2 flex flex-col gap-1.5">
        <div className="bg-surface border-line-1 rounded-tau-md flex items-start gap-2 border px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-tau-meta text-ink-3 tabular-nums">
              视频 {formatTimestamp(quote.time)}
            </div>
            <div className="text-tau-sm text-ink-2 line-clamp-2">{quote.text}</div>
          </div>
          <IconButton
            title="移除引用"
            aria-label="移除引用"
            onClick={() => setQuote(null)}
            className="-mt-0.5 -mr-1 size-6"
          >
            <X size={13} strokeWidth={1.75} />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ASKS.map(ask => (
            <button
              key={ask.label}
              type="button"
              onClick={() => fillInput(ask.prompt)}
              className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out h-6 rounded-full border px-2.5 transition-colors duration-[160ms]"
            >
              {ask.label}
            </button>
          ))}
        </div>
      </div>
    ) : null;

    if (!loaded) {
      return <Loading minHeight={0} />;
    }

    return (
      <MarkdownProvider isDark={isDark} isVisible={true}>
        <div
          className={cn("box-border flex h-full min-h-0 flex-col pb-3", docked ? "px-3" : "px-5")}
        >
          <div className="flex h-[52px] shrink-0 items-center gap-1">
            <div className="min-w-0 flex-1">
              <ChatDropdownSelector
                chats={rows}
                currentChat={currentChat}
                onChatSelect={handleChatSelect}
                onTitleChange={onTitleChange}
                onChatDelete={remove}
                titleRef={editTitleRef}
              />
            </div>
            {onClose && (
              <>
                <IconButton title="新对话" aria-label="新对话" onClick={newChat} className="size-7">
                  <SquarePen size={15} strokeWidth={1.75} />
                </IconButton>
                <IconButton
                  title="收起对话 (Ctrl/⌘ J)"
                  aria-label="收起对话"
                  onClick={onClose}
                  className="size-7"
                >
                  <PanelRightClose size={15} strokeWidth={1.75} />
                </IconButton>
              </>
            )}
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
              composerAccessory={accessory}
              prepareUserContent={prepareUserContent}
              compact={docked}
              contentMaxWidth={docked ? undefined : 760}
              emptyState={
                <ChatEmptyState
                  hasTranscript={!!transcript}
                  onPick={prompt => {
                    void chatContainerRef.current?.sendUserMessage([
                      { type: "text", text: prompt },
                    ]);
                  }}
                />
              }
            />
          </Suspense>
        </div>
      </MarkdownProvider>
    );
  }
);

const VideoNoteChatPanelMemo = memo(VideoNoteChatPanel);
export default VideoNoteChatPanelMemo;
