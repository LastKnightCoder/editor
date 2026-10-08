import {
  memo,
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from "react";
import { useMemoizedFn } from "ahooks";
import { useQuery } from "@tanstack/react-query";
import type { MessageContentItem } from "@tau/shared";
import { AtSign, CircleHelp, CornerDownLeft, FileText, SquarePen, X } from "lucide-react";
import { IconButton, Loading, toast } from "@tau/ui";
import "katex/dist/katex.min.css";

import type { EditTextHandle } from "@tau/ui";
import { MAIN_CHAT_BUCKET } from "@/stores/useChatSessionStore";
import { useScopedChat } from "@/hooks/useScopedChat";
import useTheme from "@/hooks/useTheme";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import ChatDropdownSelector from "@/components/ChatDropdownSelector";
import { useChatMarkdownComponents } from "@/components/ChatUI";
import type { ChatContainerHandle } from "@/components/ChatSidebar/ChatContainer";
import type { BlockData } from "@/types/block-preview";
import { WorkspaceBar } from "./WorkspaceBar";
import {
  applyQuestionSeed,
  linkSeededChat,
  loadQuestionSeed,
  questionSeedText,
} from "@/services/question-chat-seed";

const ChatContainer = lazy(() => import("@/components/ChatSidebar/ChatContainer"));

/** 阅读列宽：消息、提示条与输入框同一列（D-048，同文章正文 ~72ch 口径） */
const READING_WIDTH = 760;

export type ChatAreaHandle = {
  scrollToTop: () => void;
};

type ChatAreaProps = {
  entry?: string;
  onEntryLocated?: () => void;
  /** 当前对话 id（页面参数）；null = 新对话草稿 */
  selectedChatId: string | null;
  /** 围绕某个问题发起（只对新对话草稿生效） */
  seedQuestionId?: number | null;
  onSelectChat: (chatId: string | null) => void;
  sendLoading: boolean;
  setSendLoading: (loading: boolean) => void;
  /** 可预览块的打开方式（缺省走块预览上下文） */
  onOpenBlock?: (block: BlockData) => void;
  onOpenLibrary?: () => void;
  /** 草稿槽（每个页面实例各自的新对话） */
  draftSlot?: string;
  /** 标题行右侧的附加操作 */
  headerActions?: ReactNode;
};

/** 输入框上方「围绕问题：X」：首条消息会带上问题的背景与材料清单 */
function SeedChip({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <div className="bg-surface border-line-1 rounded-tau-md mb-2 flex items-center gap-2 border px-2.5 py-1.5">
      <CircleHelp className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
      <span className="text-tau-sm text-ink-2 min-w-0 flex-1 truncate">
        围绕问题：<span className="text-ink-1">{title}</span>
      </span>
      <IconButton
        aria-label="不带问题上下文"
        title="不带问题上下文"
        onClick={onRemove}
        className="size-6"
      >
        <X size={13} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
      <h2 className="text-tau-title-lg text-ink-1 font-semibold">想聊点什么？</h2>
      <p className="text-tau-meta text-ink-3 mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft size={13} strokeWidth={1.75} />
          ⌘/Ctrl + Enter 发送
        </span>
        <span className="inline-flex items-center gap-1">
          <AtSign size={13} strokeWidth={1.75} />
          引用卡片、文章、项目文档
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText size={13} strokeWidth={1.75} />
          拖入内容作为上下文
        </span>
      </p>
    </div>
  );
}

/**
 * 对话页纸面（D-048）：标题行（会话切换 / 分支 / 更多）+ ChatContainer（760 阅读列居中）。
 * 会话选择由页面参数驱动，本组件只回调 onSelectChat。
 */
const ChatArea = memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(
    (
      {
        selectedChatId,
        entry,
        onEntryLocated,
        seedQuestionId = null,
        onSelectChat,
        sendLoading,
        setSendLoading,
        onOpenBlock,
        onOpenLibrary,
        draftSlot = "chat-page",
        headerActions,
      },
      ref
    ) => {
      const { isDark } = useTheme();
      const editTitleRef = useRef<EditTextHandle>(null);
      const chatContainerRef = useRef<ChatContainerHandle>(null);

      // 当前对话由页面参数驱动；列表由应用启动时加载（主聊天）
      const { rows, currentChat, newChat, rename, remove } = useScopedChat(MAIN_CHAT_BUCKET, {
        draftSlot,
        selectedId: selectedChatId,
        onSelect: onSelectChat,
        autoLoad: false,
      });

      const onTitleChange = useMemoizedFn(async (title: string) => {
        try {
          await rename(currentChat.id, title);
        } catch (error) {
          toast.error("标题更新失败");
          console.error(error);
        }
      });

      const markdownComponents = useChatMarkdownComponents({
        isDark,
        onOpenBlock,
        idPrefix: "page-block",
        liveChat: true,
      });

      // 围绕问题：草稿首条消息前置问题上下文，登记后挂到问题上；chip 可移除
      const isDraft = !currentChat.sessionFile;
      const [dismissedSeed, setDismissedSeed] = useState<number | null>(null);
      const seedActive = isDraft && seedQuestionId != null && dismissedSeed !== seedQuestionId;
      const { data: seedDetail } = useQuery({
        queryKey: ["questions", "detail", seedQuestionId],
        queryFn: () => loadQuestionSeed(seedQuestionId!),
        enabled: seedActive,
        staleTime: 30_000,
      });
      const seed = seedActive ? (seedDetail ?? null) : null;
      const seedRef = useRef(seed);
      seedRef.current = seed;
      const sentSeedRef = useRef<number | null>(null);

      const prepareUserContent = useCallback((content: MessageContentItem[]) => {
        const current = seedRef.current;
        if (!current) return content;
        sentSeedRef.current = current.question.id;
        return applyQuestionSeed(content, questionSeedText(current));
      }, []);

      const onChatCreated = useMemoizedFn((chatId: string) => {
        const questionId = sentSeedRef.current;
        sentSeedRef.current = null;
        if (questionId != null)
          linkSeededChat(questionId, chatId).catch(() =>
            toast.error("对话已开始，但没能关联到问题")
          );
        onSelectChat(chatId);
      });

      useImperativeHandle(ref, () => ({
        scrollToTop: () => chatContainerRef.current?.scrollToTop(),
      }));

      return (
        <MarkdownProvider isDark={isDark} isVisible={true}>
          <div className="flex h-full min-w-0 flex-col overflow-hidden">
            <div className="flex h-12 flex-none items-center gap-1 pl-5 pr-3">
              <div className="min-w-0 flex-1">
                <ChatDropdownSelector
                  chats={rows}
                  currentChat={currentChat}
                  onChatSelect={onSelectChat}
                  onTitleChange={onTitleChange}
                  onChatDelete={remove}
                  titleRef={editTitleRef}
                  // 运行中（含等待作答）不禁用切换/改名/删除：运行态在模块级 runtime，
                  // 后台继续归约；删除会一并释放会话与归约条目（与停靠栏一致）
                  onOpenLibrary={onOpenLibrary}
                />
              </div>
              <IconButton title="新对话" aria-label="新对话" onClick={newChat} className="size-7">
                <SquarePen size={15} strokeWidth={1.75} />
              </IconButton>
              {headerActions}
            </div>

            <div className="min-h-0 flex-1">
              <Suspense fallback={<Loading minHeight={0} className="h-full" />}>
                <ChatContainer
                  ref={chatContainerRef}
                  currentChat={currentChat}
                  entry={entry}
                  onEntryLocated={onEntryLocated}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  isVisible={true}
                  sendLoading={sendLoading}
                  setSendLoading={setSendLoading}
                  titleRef={editTitleRef}
                  onCreateNewMessage={newChat}
                  createMessageLoading={false}
                  onChatCreated={onChatCreated}
                  prepareUserContent={prepareUserContent}
                  contentMaxWidth={READING_WIDTH}
                  emptyState={<EmptyHint />}
                  composerAccessory={
                    <>
                      {seed && (
                        <SeedChip
                          title={seed.question.questionContent}
                          onRemove={() => setDismissedSeed(seedQuestionId)}
                        />
                      )}
                      <WorkspaceBar chatId={currentChat.id} busy={sendLoading} />
                    </>
                  }
                />
              </Suspense>
            </div>
          </div>
        </MarkdownProvider>
      );
    }
  )
);

ChatArea.displayName = "ChatArea";

export default ChatArea;
