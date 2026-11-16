import type { RefObject } from "react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import type { ChatInputAreaHandle } from "@/components/ChatInputArea";
import type { ChatMessage } from "@/types";
import { piChatSessionManager } from "@/services/piChatSession";
import type { buildPiPromptPayload } from "@/services/piPromptPayload";
import { piChatRuntime } from "@/services/piChatRuntime";
import { piSessionSteer } from "@/commands/piSession";
import type { MessageContentItem } from "@tau/shared";
import type { EditingDraftState, HiddenPromptContextState } from "../chatContainerUtils";

interface ChatSteeringOptions {
  chatScope: string;
  actualChatRef: RefObject<ChatMessage>;
  conversationKeyRef: RefObject<string>;
  editingDraft: EditingDraftState | null;
  hiddenPromptContext: HiddenPromptContextState | null;
  buildPromptPayload: (
    contentItems: MessageContentItem[]
  ) => ReturnType<typeof buildPiPromptPayload>;
  editTextRef: RefObject<ChatInputAreaHandle | null>;
}

/** 运行中插话（pi 原生 steer）：输入框直发与待发送消息转插话，失败退回待发送队列 */
export function useChatSteering({
  chatScope,
  actualChatRef,
  conversationKeyRef,
  editingDraft,
  hiddenPromptContext,
  buildPromptPayload,
  editTextRef,
}: ChatSteeringOptions) {
  const message = toast;

  /**
   * 运行中插话（pi 原生 steer）：消息在当前步骤跑完后、下一次请求模型前送达本轮，
   * 不新起一轮。送达时由 runtime 把用户消息写进聊天行（见 onUserMessageDelivered）。
   * 返回 requeued 表示这轮已结束、已退回待发送队列；rejected 表示调用方自己处置内容。
   */
  const steerMessageContent = useMemoizedFn(
    async (content: MessageContentItem[]): Promise<"steered" | "requeued" | "rejected"> => {
      const conversationKey = conversationKeyRef.current;
      // 编辑重发/图片编辑上下文都要重建会话，插进当前这轮语义就错了
      if (editingDraft || hiddenPromptContext) {
        message.warning("正在编辑消息，插话请先取消编辑");
        return "rejected";
      }
      if (!piChatRuntime.canSteer(conversationKey)) return "rejected";
      const sessionId = piChatSessionManager.resolveSessionId(chatScope, actualChatRef.current.id);
      if (!sessionId) return "rejected";
      const { promptText, images } = await buildPromptPayload(content);
      if (!promptText.trim() && images.length === 0) {
        message.warning("请输入内容");
        return "rejected";
      }
      // 先登记再发 IPC：送达事件可能先于 IPC 返回到达
      const steerId = piChatRuntime.addPendingSteer(conversationKey, {
        text: promptText,
        content,
      });
      if (!steerId) return "rejected";
      const outcome = await piSessionSteer(sessionId, promptText, images, {
        content,
      });
      if (outcome.ok) return "steered";
      // 失败退回待发送（settled 兜底可能已经退过，returnPendingSteerToQueue 幂等）
      const returned = piChatRuntime.returnPendingSteerToQueue(conversationKey, steerId);
      if (outcome.reason !== "not-streaming") {
        message.error(outcome.error ?? "插话失败，已退回待发送");
      }
      return returned ? "requeued" : "rejected";
    }
  );

  /** 输入框直接插话（⌘/Ctrl + Shift + Enter 或插话按钮）：只有成功交出去才清输入框 */
  const steerFromInput = useMemoizedFn(async () => {
    const content = editTextRef.current?.getValue() ?? [];
    if (content.length === 0) return;
    const result = await steerMessageContent(content);
    if (result === "rejected") return;
    editTextRef.current?.clear();
    if (result === "requeued") {
      message.info("这轮回答已结束，已加入待发送");
    }
  });

  /** 待发送消息改为插话：先移出队列（UI 立即从「待发送」转到「插话」），失败再退回 */
  const steerQueuedMessage = useMemoizedFn(async (index: number) => {
    const conversationKey = conversationKeyRef.current;
    const content = piChatRuntime.takeQueuedMessage(conversationKey, index);
    if (!content) return;
    const result = await steerMessageContent(content);
    if (result === "rejected") {
      piChatRuntime.requeueMessage(conversationKey, content);
    }
  });

  return { steerFromInput, steerQueuedMessage };
}
