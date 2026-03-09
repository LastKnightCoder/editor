import {
  useState,
  useMemo,
  memo,
  lazy,
  Suspense,
  useRef,
  useEffect,
} from "react";
import { App } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import "katex/dist/katex.min.css";
import type { EditTextHandle } from "@/components/EditText";
import ChatDropdownSelector from "@/layouts/ContentLayout/components/RightChatSidebar/ChatDropdownSelector";
import useTheme from "@/hooks/useTheme";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import useMermaidRenderPreference from "@/hooks/useMermaidRenderPreference";
import useSettingStore from "@/stores/useSettingStore";
import { openExternal } from "@/commands";
import { MermaidRenderer, LazySyntaxHighlighter } from "@tau/shared";
import {
  MarkdownProvider,
  useMarkdownContext,
} from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import type { ChatContainerHandle } from "@/layouts/ContentLayout/components/ChatSidebar/ChatContainer";
import { ResponseMessage, ChatMessage } from "@/types";
import { Role, buildSessionAwareSystemPrompt } from "@/constants";
import type { VideoNoteHighlight, VideoNoteTopic } from "@/types";
import useVideoNoteChatStore, {
  EVideoNoteChatStatus,
} from "@/stores/useVideoNoteChatStore";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

const CodeRenderer: React.FC<{
  children?: React.ReactNode;
  className?: string;
}> = ({ children, className, ...rest }) => {
  const { message } = App.useApp();
  const mermaidRenderPreference = useMermaidRenderPreference();
  const { isDark, messageMeta } = useMarkdownContext();
  const match = /language-([\w-]+)/.exec(className || "");
  const language = match ? match[1] : undefined;
  const code = String(children).replace(/\n$/, "");
  if (language === "mermaid") {
    return (
      <MermaidRenderer
        code={code}
        isDark={isDark}
        messageApi={message}
        renderPreference={mermaidRenderPreference}
      />
    );
  }
  if (language) {
    return (
      <LazySyntaxHighlighter language={language} isDark={isDark} {...rest}>
        {code}
      </LazySyntaxHighlighter>
    );
  }
  return (
    <code {...rest} className={className} data-message={messageMeta?.chatId}>
      {children}
    </code>
  );
};

interface VideoNoteChatPanelProps {
  videoNoteId: number;
  mainDbName: string;
  transcript: string;
  selectedTheme: string | null;
  visibleHighlights: VideoNoteHighlight[];
  availableThemes: string[];
  topics?: VideoNoteTopic[];
  insightsObsolete?: boolean;
}

const MAX_CONTEXT_HIGHLIGHTS = 5;
const MAX_CONTEXT_THEMES = 12;

const formatMs = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const buildVideoNoteSystemPrompt = (params: {
  transcript: string;
  selectedTheme: string | null;
  visibleHighlights: VideoNoteHighlight[];
  availableThemes: string[];
  insightsObsolete?: boolean;
}): string => {
  const {
    transcript,
    selectedTheme,
    visibleHighlights,
    availableThemes,
    insightsObsolete,
  } = params;
  const transcriptLength = transcript.trim().length;
  const themeText = selectedTheme || "Overall highlights";
  const themesText =
    availableThemes.length > 0
      ? availableThemes.slice(0, MAX_CONTEXT_THEMES).join(" / ")
      : "暂无";
  const highlightPreview =
    visibleHighlights.length > 0
      ? visibleHighlights
          .slice(0, MAX_CONTEXT_HIGHLIGHTS)
          .map(
            (item, index) =>
              `${index + 1}. [${formatMs(item.start)}-${formatMs(item.end)}] ${item.title}`,
          )
          .join("\n")
      : "暂无可见高亮";

  return `你是视频学习助手，围绕当前视频内容回答问题。

## 可用工具
- get_video_note_theme_context：获取当前主题上下文（优先调用）。
- get_video_note_highlights：获取当前主题下高亮列表。
- search_video_note_highlights：在当前高亮里按关键词检索。
- search_video_note_knowledge：按语义和关键词检索视频转录片段。

## 回答要求
- 回答前优先调用工具获取证据，不要直接猜测。
- 回答基于视频转录与高亮内容，不要凭空补充未出现的信息。
- 需要引用时，优先给出对应时间段。
- 如信息不足，明确说明并提示用户继续提问或重新检索。
- 如果主题上下文不足，先调用 get_video_note_theme_context。

## 当前上下文快照
- 当前主题：${themeText}
- 可用主题：${themesText}
- 当前可见高亮数：${visibleHighlights.length}
- 转录长度（字符）：${transcriptLength}
- 主题结果状态：${insightsObsolete ? "可能过期，回答前请优先调用工具确认" : "可用"}

## 当前高亮预览
${highlightPreview}`;
};

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
  promptId: null,
  groupId: null,
  archived: false,
  parentChatId: null,
  branchIndex: 0,
});

const VideoNoteChatPanel: React.FC<VideoNoteChatPanelProps> = ({
  videoNoteId,
  mainDbName,
  transcript,
  selectedTheme,
  visibleHighlights,
  availableThemes,
  topics = [],
  insightsObsolete = false,
}) => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  const selectedThemeRef = useRef<string | null>(selectedTheme);
  const visibleHighlightsRef = useRef<VideoNoteHighlight[]>(visibleHighlights);
  const availableThemesRef = useRef<string[]>(availableThemes);
  const topicsRef = useRef<VideoNoteTopic[]>(topics);
  const insightsObsoleteRef = useRef<boolean>(insightsObsolete);

  useEffect(() => {
    selectedThemeRef.current = selectedTheme;
  }, [selectedTheme]);

  useEffect(() => {
    visibleHighlightsRef.current = visibleHighlights;
  }, [visibleHighlights]);

  useEffect(() => {
    availableThemesRef.current = availableThemes;
  }, [availableThemes]);

  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);

  useEffect(() => {
    insightsObsoleteRef.current = insightsObsolete;
  }, [insightsObsolete]);

  const contextProvider = useMemo(
    () => ({
      getContext: () => ({
        selectedTheme: selectedThemeRef.current,
        visibleHighlights: visibleHighlightsRef.current,
        availableThemes: availableThemesRef.current,
        topics: topicsRef.current,
        insightsObsolete: insightsObsoleteRef.current,
      }),
    }),
    [],
  );

  useVideoNoteChat(videoNoteId, mainDbName, contextProvider);

  const systemPrompt = useMemo(
    () =>
      buildVideoNoteSystemPrompt({
        transcript,
        selectedTheme,
        visibleHighlights,
        availableThemes,
        insightsObsolete,
      }),
    [
      transcript,
      selectedTheme,
      visibleHighlights,
      availableThemes,
      insightsObsolete,
    ],
  );

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
    useShallow((state) => ({
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
    })),
  );

  useEffect(() => {
    if (isConnected && videoNoteId) {
      initChats(videoNoteId);
    }
  }, [initChats, isConnected, database, videoNoteId]);

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId),
    [chats, currentChatId],
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
      promptId: null,
      groupId: null,
      archived: currentChat.archived,
      parentChatId: currentChat.parentChatId,
      branchIndex: currentChat.branchIndex,
    };
  }, [currentChat, systemPrompt]);

  const chatsAsMessages = useMemo(
    (): ChatMessage[] =>
      chats.map((chat) => ({
        id: chat.id,
        createTime: chat.createTime,
        updateTime: chat.updateTime,
        messages: chat.messages,
        title: chat.title,
        promptId: null,
        groupId: null,
        archived: chat.archived,
        parentChatId: chat.parentChatId,
        branchIndex: chat.branchIndex,
      })),
    [chats],
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
      message.error("创建对话失败");
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
      message.error("更新标题失败");
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
    },
  );

  const handleExternalCreateBranch = useMemoizedFn(
    async (parentChatId: number, messages: ChatMessage["messages"]) => {
      const created = await createChatBranch(parentChatId, messages);
      return {
        ...currentChatAsMessage,
        ...created,
      } as ChatMessage;
    },
  );

  const handleUpdateChatMessage = useMemoizedFn(async (chat: ChatMessage) => {
    const localChat = chats.find((item) => item.id === chat.id);
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

  const handleLinkClick = useMemoizedFn(
    (event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
      if (!href) return;
      event.preventDefault();
      openExternal(href).catch((err) => {
        console.error("打开链接失败:", err);
      });
    },
  );

  const markdownComponents = useMemo(
    () => ({
      code: CodeRenderer,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a: ({ children, href, ...props }: any) => (
        <a
          {...props}
          href={href}
          onClick={(event: React.MouseEvent<HTMLAnchorElement>) =>
            handleLinkClick(event, href)
          }
        >
          {children}
        </a>
      ),
    }),
    [handleLinkClick],
  );

  if (status === EVideoNoteChatStatus.LOADING) {
    return (
      <div className="h-full flex items-center justify-center">
        <LoadingOutlined />
      </div>
    );
  }

  return (
    <MarkdownProvider isDark={isDark} isVisible={true}>
      <div className="h-full box-border p-4 flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <ChatDropdownSelector
            chats={chatsAsMessages}
            currentChat={currentChatAsMessage}
            onChatSelect={handleChatSelect}
            onTitleChange={onTitleChange}
            onCreateNewChat={onCreateNewMessage}
            onChatDelete={handleChatDelete}
            getChildBranchesCount={getChildBranchesCount}
            disabled={sendLoading}
            titleRef={editTitleRef}
          />
        </div>

        {(currentChat || (!currentChat && !createMessageLoading)) && (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <LoadingOutlined />
              </div>
            }
          >
            <ChatContainer
              ref={chatContainerRef}
              currentChat={currentChatAsMessage}
              isDark={isDark}
              markdownComponents={markdownComponents}
              isVisible={true}
              chatScope={`video-note-chat:${videoNoteId}`}
              updateChatMessage={handleUpdateChatMessage}
              updateCurrentChat={handleUpdateCurrentChat}
              sendLoading={sendLoading}
              setSendLoading={setSendLoading}
              titleRef={editTitleRef}
              onCreateNewMessage={onCreateNewMessage}
              createMessageLoading={createMessageLoading}
              onChatCreated={(chatId) => {
                useVideoNoteChatStore.setState({ currentChatId: chatId });
              }}
              hideRagToggle={true}
              hidePromptSelect={true}
              customSystemPrompt={systemPrompt}
              onCreateChat={handleExternalCreateChat}
              onCreateBranch={handleExternalCreateBranch}
            />
          </Suspense>
        )}
      </div>
    </MarkdownProvider>
  );
};

const VideoNoteChatPanelMemo = memo(VideoNoteChatPanel);
export default VideoNoteChatPanelMemo;
