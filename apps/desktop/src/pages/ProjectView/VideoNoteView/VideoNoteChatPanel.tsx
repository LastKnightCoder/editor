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
import { Role } from "@/constants";
import useVideoNoteChatStore, {
  EVideoNoteChatStatus,
} from "@/stores/useVideoNoteChatStore";
import { useVideoNoteChat } from "./useVideoNoteChat";

const ChatContainer = lazy(
  () => import("@/layouts/ContentLayout/components/ChatSidebar/ChatContainer"),
);

interface VideoNoteChatPanelProps {
  videoNoteId: number;
  mainDbName: string;
  transcript: string;
}

const MAX_SYSTEM_TRANSCRIPT_CHARS = 12000;

const buildVideoNoteSystemPrompt = (transcript: string): string => {
  const normalized = transcript.trim();
  const truncated = normalized.slice(0, MAX_SYSTEM_TRANSCRIPT_CHARS);
  const trimmed = truncated !== normalized;
  const transcriptBlock = truncated || "（暂无转录文本）";

  return `你是视频学习助手，围绕当前视频转录内容回答问题。

## 可用工具
- search_video_note_knowledge：按语义和关键词检索视频转录片段（推荐优先使用）。

## 回答要求
- 回答基于转录内容，不要凭空补充未出现的信息。
- 需要引用时，优先给出对应时间段。
- 如信息不足，明确说明并提示用户继续提问或重新检索。

## 当前视频转录文本${trimmed ? "（已截断）" : ""}
${transcriptBlock}`;
};

const createDefaultChat = (systemPrompt: string): ChatMessage => ({
  id: 0,
  createTime: Date.now(),
  updateTime: Date.now(),
  messages: [
    {
      role: Role.System,
      content: systemPrompt,
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
}) => {
  const { isDark } = useTheme();
  const { message } = App.useApp();
  const editTitleRef = useRef<EditTextHandle>(null);
  const chatContainerRef = useRef<ChatContainerHandle>(null);

  const database = useSettingStore((state) => state.setting.database.active);
  const isConnected = useDatabaseConnected();

  useVideoNoteChat(videoNoteId, mainDbName);

  const systemPrompt = useMemo(
    () => buildVideoNoteSystemPrompt(transcript),
    [transcript],
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

  const CodeRenderer: React.FC<{
    children?: React.ReactNode;
    className?: string;
  }> = ({ children, className, ...rest }) => {
    const mermaidRenderPreference = useMermaidRenderPreference();
    const { messageMeta } = useMarkdownContext();
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
    [CodeRenderer, handleLinkClick],
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

export default memo(VideoNoteChatPanel);
