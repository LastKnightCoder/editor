import type { Dispatch, RefObject, SetStateAction } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import type { ChatContainerCoreHandle } from "@tau/chat-ui";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";
import type { ChatMessage, RequestMessage, ResponseMessage } from "@/types";
import type { PiSessionEdit } from "@/commands/piSession";
import { Role } from "@/constants";
import { isDraftChat } from "@/stores/useChatSessionStore";
import { canRetryChatMessage } from "@/services/chatRetry";
import type { ChatRefPayload } from "@/editor-extensions/chat-ref/types";
import type { ConversationTreeRow } from "@/features/chat/conversationTree";
import { userEntryIdAt, visibleMessagesOf, type EditingDraftState } from "../chatContainerUtils";

/**
 * 一条消息所在那一轮的引用载荷（被正文引用时用）：定位到这一轮的用户消息，回答的模型一并带上。
 * 还没落盘（没有 entry id）的消息不能引用。
 */
const chatRefPayloadAt = (
  chat: ChatMessage,
  messages: ChatMessage["messages"],
  index: number
): ChatRefPayload | null => {
  let userIndex = index;
  while (userIndex >= 0 && messages[userIndex]?.role !== Role.User) userIndex -= 1;
  const entryId = userEntryIdAt(messages, userIndex);
  if (!entryId) return null;
  const turn = messages
    .slice(0, userIndex + 1)
    .filter(message => message.role === Role.User).length;
  const answer = messages[userIndex + 1];
  const usage =
    answer && answer.role === Role.Assistant ? (answer as ResponseMessage).usage : undefined;
  return {
    sessionId: chat.id,
    entryId,
    title: chat.title,
    turn,
    ...(usage?.modelName || usage?.modelId ? { model: usage.modelName || usage.modelId } : {}),
  };
};

interface ChatMessageActionsOptions {
  sendLoading: boolean;
  hideInput: boolean;
  actualChatRef: RefObject<ChatMessage>;
  visibleMessages: ChatMessage["messages"];
  editSessionHistory: (edit: PiSessionEdit) => Promise<ChatMessage | null>;
  processMessageSending: (
    requestMessage: RequestMessage,
    options?: {
      shouldClearInput?: boolean;
      persistedRequestMessage?: RequestMessage;
      rewindBeforeEntryId?: string;
      retryMessage?: RequestMessage;
      toolContext?: {
        flags?: {
          forceReview?: boolean;
          feedbackProposalId?: string;
        };
      };
    }
  ) => Promise<boolean>;
  setEditingDraft: Dispatch<SetStateAction<EditingDraftState | null>>;
  editTextRef: RefObject<ChatInputAreaHandle | null>;
  setTreeOpen: Dispatch<SetStateAction<boolean>>;
  coreRef: RefObject<ChatContainerCoreHandle | null>;
}

/** 消息操作：删除/重试/重新生成/编辑/建分支/切版本与树谱选择的会话树编辑动作 */
export function useChatMessageActions({
  sendLoading,
  hideInput,
  actualChatRef,
  visibleMessages,
  editSessionHistory,
  processMessageSending,
  setEditingDraft,
  editTextRef,
  setTreeOpen,
  coreRef,
}: ChatMessageActionsOptions) {
  const message = toast;

  // 删除消息：pi 原生 context_edit 省略（只删那一条；一条回答要把它全部 entry 一起省略）
  const handleDeleteMessage = useMemoizedFn(async (messageIndex: number) => {
    if (sendLoading) {
      message.warning("回答进行中，请先停止再删除消息");
      return;
    }
    const target = visibleMessagesOf(actualChatRef.current)[messageIndex];
    const entryIds = target?.piEntryIds ?? [];
    if (entryIds.length === 0) {
      message.warning("这条消息还没有保存下来，暂时不能删除");
      return;
    }
    const edited = await editSessionHistory({ kind: "omit", entryIds });
    if (edited) message.success("消息已删除");
  });

  // 未产出有效结果的末尾问题原位重试，其余重新生成保留旧版本。
  const handleRegenerateMessage = useMemoizedFn(async (messageIndex: number) => {
    if (sendLoading) return;
    const targetMessage = visibleMessagesOf(actualChatRef.current)[messageIndex];
    if (!targetMessage || targetMessage.role !== Role.User) {
      message.warning("只能重新生成用户消息");
      return;
    }
    const entryId = targetMessage.piEntryIds?.[0];
    if (canRetryChatMessage(visibleMessagesOf(actualChatRef.current), messageIndex)) {
      await processMessageSending(targetMessage as RequestMessage, {
        shouldClearInput: false,
        retryMessage: targetMessage as RequestMessage,
      });
      return;
    }
    if (!entryId) {
      message.warning("这条消息还没有保存下来，暂时不能重新生成");
      return;
    }
    await processMessageSending(targetMessage as RequestMessage, {
      shouldClearInput: false,
      rewindBeforeEntryId: entryId,
    });
  });

  const handleEditMessage = useMemoizedFn((messageIndex: number, content: string) => {
    if (hideInput || sendLoading) {
      return;
    }

    const targetMessage = visibleMessages[messageIndex];
    if (!targetMessage || targetMessage.role !== Role.User) {
      message.warning("只能编辑用户消息");
      return;
    }

    setEditingDraft({
      messageIndex,
    });
    editTextRef.current?.setValue(content);
    setTimeout(() => {
      editTextRef.current?.focusEnd();
    }, 0);
  });

  const getChatRefAt = useMemoizedFn((messageIndex: number) =>
    chatRefPayloadAt(actualChatRef.current, visibleMessages, messageIndex)
  );

  /**
   * 从这里建分支：回到这条回答之后，之后的对话留在树上成为另一个版本；
   * 接下来发送的消息就是新分支，可以在那条用户消息上 ‹ i/n › 切回去。
   */
  const handleCreateBranch = useMemoizedFn(async (messageIndex: number) => {
    const currentChat = actualChatRef.current;
    if (isDraftChat(currentChat)) {
      message.warning("请先发送一条消息再建分支");
      return;
    }
    if (sendLoading) {
      message.warning("回答进行中，请先停止再建分支");
      return;
    }
    const target = visibleMessagesOf(currentChat)[messageIndex];
    const entryId = target?.piEntryIds?.at(-1);
    if (!entryId) {
      message.warning("这条消息还没有保存下来，暂时不能建分支");
      return;
    }
    if (messageIndex === visibleMessagesOf(currentChat).length - 1) {
      message.info("已经是最新的回答，直接发送消息即可继续");
      return;
    }
    const edited = await editSessionHistory({ kind: "fork", entryId });
    if (edited) {
      message.success("已从这里分叉，发送的消息会成为新分支");
      editTextRef.current?.focusEnd();
    }
  });

  /** 切到这条用户消息的另一个版本：后面的整段对话一起换成那个版本的 */
  const handleSwitchVersion = useMemoizedFn(async (messageIndex: number, versionIndex: number) => {
    if (sendLoading) {
      message.warning("回答进行中，请先停止再切换版本");
      return;
    }
    const target = visibleMessagesOf(actualChatRef.current)[messageIndex] as
      | RequestMessage
      | undefined;
    const entryId = target?.piVersions?.ids[versionIndex];
    if (!entryId) return;
    setEditingDraft(null);
    await editSessionHistory({ kind: "switch", entryId });
  });

  /** 树谱里点一条分支：切过去，并在对话流里定位到这条分支的起点 */
  const handleTreeSelect = useMemoizedFn(async (row: ConversationTreeRow) => {
    setTreeOpen(false);
    if (sendLoading) return;
    const onPathAlready = row.onPath && row.isLeaf;
    const next = onPathAlready
      ? actualChatRef.current
      : await editSessionHistory({ kind: "switch", entryId: row.tail.id });
    if (!next) return;
    setEditingDraft(null);
    const index = visibleMessagesOf(next).findIndex(
      message => message.piEntryIds?.[0] === row.node.id
    );
    if (index >= 0) {
      setTimeout(() => coreRef.current?.scrollToIndex(index, { align: "start" }), 0);
    }
  });

  return {
    handleDeleteMessage,
    handleRegenerateMessage,
    handleEditMessage,
    getChatRefAt,
    handleCreateBranch,
    handleSwitchVersion,
    handleTreeSelect,
  };
}
