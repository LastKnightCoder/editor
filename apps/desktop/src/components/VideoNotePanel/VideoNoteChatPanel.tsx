import { useState, useMemo, memo, lazy, Suspense, useRef, useEffect } from "react";
import { Loading, cn, toast } from "@tau/ui";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";
import type { EditTextHandle } from "@/components/EditText";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useSettingStore from "@/stores/useSettingStore";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import { ResponseMessage, ChatMessage } from "@/types";
import { Role, buildSessionAwareSystemPrompt } from "@/constants";
import useVideoNoteChatStore, { EVideoNoteChatStatus } from "@/stores/useVideoNoteChatStore";
import { buildVideoNoteSystemPrompt } from "@/tools/videoNoteSearchTool";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer")
);

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
              className="bg-sunken text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 rounded-tau-sm ease-tau-out px-3 py-2 text-left transition-colors duration-[160ms]"
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

const createDefaultChat = (systemPrompt: string): ChatMessage => ({
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: buildSessionAwareSystemPrompt(systemPrompt),
      reasoning_content: "",
    },
  ],
  title: "新对话",
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
});

const VideoNoteChatPanel: React.FC<VideoNoteChatPanelProps> = ({
  videoNoteId,
  mainDbName,
  transcript,
  docked = false,
}) => {
  const { isDark } = useTheme();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore(state => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  const toolScope = useVideoNoteChat(videoNoteId, mainDbName);

  const systemPrompt = useMemo(() => buildVideoNoteSystemPrompt({ transcript }), [transcript]);

  const {
    initChats,
    chats,
    currentChatId,
    status,
    createChat,
    updateChat,
    updateCurrentChat,
    createChatBranch,
    deleteChat,
    getChildBranchesCount,
  } = useVideoNoteChatStore(
    useShallow(state => ({
      initChats: state.initChats,
      chats: state.chats,
      currentChatId: state.currentChatId,
      status: state.status,
      createChat: state.createChat,
      updateChat: state.updateChat,
      updateCurrentChat: state.updateCurrentChat,
      createChatBranch: state.createChatBranch,
      deleteChat: state.deleteChat,
      getChildBranchesCount: state.getChildBranchesCount,
    }))
  );

  useEffect(() => {
    if (isConnected && videoNoteId) {
      initChats(videoNoteId);
    }
  }, [initChats, isConnected, database, videoNoteId]);

  const currentChat = useMemo(
    () => chats.find(chat => chat.id === currentChatId),
    [chats, currentChatId]
  );

  const currentChatAsMessage = useMemo((): ChatMessage => {
    if (!currentChat) {
      return createDefaultChat(systemPrompt);
    }
    return {
      id: currentChat.id,
      createTime: currentChat.createTime,
      updateTime: currentChat.updateTime,
      messages: currentChat.messages,
      title: currentChat.title,
      groupId: null,
      archived: currentChat.archived,
      parentChatId: currentChat.parentChatId,
      branchIndex: currentChat.branchIndex,
    };
  }, [currentChat, systemPrompt]);

  const chatsAsMessages = useMemo(
    (): ChatMessage[] =>
      chats.map(chat => ({
        id: chat.id,
        createTime: chat.createTime,
        updateTime: chat.updateTime,
        messages: chat.messages,
        title: chat.title,
        groupId: null,
        archived: chat.archived,
        parentChatId: chat.parentChatId,
        branchIndex: chat.branchIndex,
      })),
    [chats]
  );

  const [createMessageLoading, setCreateMessageLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const onCreateNewMessage = useMemoizedFn(async () => {
    const messages: ResponseMessage[] = [
      {
        role: Role.System,
        content: systemPrompt,
      },
    ];
    setCreateMessageLoading(true);
    try {
      await createChat(messages);
    } catch (error) {
      toast.error("创建对话失败");
      console.error(error);
    } finally {
      setCreateMessageLoading(false);
    }
  });

  const onTitleChange = useMemoizedFn(async (title: string) => {
    if (!currentChat) return;
    try {
      await updateChat({ ...currentChat, title });
    } catch (error) {
      toast.error("更新标题失败");
      console.error(error);
    }
  });

  const handleChatSelect = useMemoizedFn((chatId: number) => {
    chatContainerRef.current?.scrollToTop();
    useVideoNoteChatStore.setState({ currentChatId: chatId });
  });

  const handleExternalCreateChat = useMemoizedFn(
    async (messages: ChatMessage["messages"], title?: string) => {
      const created = await createChat(messages, title);
      return {
        ...currentChatAsMessage,
        ...created,
      } as ChatMessage;
    }
  );

  const handleExternalCreateBranch = useMemoizedFn(
    async (parentChatId: number, messages: ChatMessage["messages"]) => {
      const created = await createChatBranch(parentChatId, messages);
      return {
        ...currentChatAsMessage,
        ...created,
      } as ChatMessage;
    }
  );

  const handleUpdateChatMessage = useMemoizedFn(async (chat: ChatMessage) => {
    const localChat = chats.find(item => item.id === chat.id);
    if (!localChat) {
      throw new Error("Chat not found");
    }
    const updated = await updateChat({
      ...localChat,
      messages: chat.messages,
      title: chat.title,
      archived: chat.archived,
    });
    return {
      ...chat,
      ...updated,
    };
  });

  const handleUpdateCurrentChat = useMemoizedFn((chat: ChatMessage) => {
    updateCurrentChat({
      id: chat.id,
      videoNoteId,
      createTime: chat.createTime,
      updateTime: chat.updateTime,
      messages: chat.messages,
      title: chat.title,
      archived: chat.archived,
      parentChatId: chat.parentChatId,
      branchIndex: chat.branchIndex,
    });
  });

  const handleChatDelete = useMemoizedFn(async (chatId: number) => {
    await deleteChat(chatId);
  });

  // 代码 / 链接渲染与对话页共用（D-048）
  const markdownComponents = useChatMarkdownComponents({ isDark, idPrefix: "video-note-block" });

  if (status === EVideoNoteChatStatus.LOADING) {
    return <Loading minHeight={0} />;
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className={cn("box-border flex h-full min-h-0 flex-col pb-3", docked ? "px-3" : "px-5")}>
        <div className="flex h-[52px] shrink-0 items-center justify-between">
          <ChatDropdownSelector
            chatSource="video-note-chat"
            chats={chatsAsMessages}
            currentChat={currentChatAsMessage}
            onChatSelect={handleChatSelect}
            onTitleChange={onTitleChange}
            onChatDelete={handleChatDelete}
            getChildBranchesCount={getChildBranchesCount}
            titleRef={editTitleRef}
          />
        </div>

        {(currentChat || (!currentChat && !createMessageLoading)) && (
          <Suspense fallback={<Loading minHeight={0} />}>
            <ChatContainer
              ref={chatContainerRef}
              currentChat={currentChatAsMessage}
              isDark={isDark}
              markdownComponents={markdownComponents}
              isVisible={true}
              chatScope={`video-note-chat:${videoNoteId}`}
              toolScope={toolScope}
              updateChatMessage={handleUpdateChatMessage}
              updateCurrentChat={handleUpdateCurrentChat}
              sendLoading={sendLoading}
              setSendLoading={setSendLoading}
              titleRef={editTitleRef}
              onCreateNewMessage={onCreateNewMessage}
              createMessageLoading={createMessageLoading}
              onChatCreated={chatId => {
                useVideoNoteChatStore.setState({ currentChatId: chatId });
              }}
              customSystemPrompt={systemPrompt}
              onCreateChat={handleExternalCreateChat}
              onCreateBranch={handleExternalCreateBranch}
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
        )}
      </div>
    </MarkdownProvider>
  );
};

const VideoNoteChatPanelMemo = memo(VideoNoteChatPanel);
export default VideoNoteChatPanelMemo;
