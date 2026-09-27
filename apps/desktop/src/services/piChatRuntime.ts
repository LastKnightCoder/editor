/**
 * pi 会话归约运行时（模块级单例）：把"AgentSessionEvent → 聊天行写入"从组件生命周期中解放——
 * 组件卸载（切页/关面板）后事件继续归约、落库，pi 会话在主进程后台跑完，重挂载时无缝接续。
 *
 * 职责（每 conversationKey 一份，常驻）：
 * - chat 容器：聊天行单一事实源（组件的 actualChatRef 直接复用本容器的 {current}）；
 * - 常驻 reducer：pi 事件归约（同一会话多轮发送共享，pi 事件串行到达无竞争）；
 * - streaming 态：agent_start/agent_settled 事件驱动（组件据此算 sendLoading）；
 * - 待发送队列与已提交插话：流式中提交的消息在这里排队（切页不丢），交给 pi 原生 steer
 *   的插话在这里挂着直到送达；送达时把用户消息写进聊天行，未送达的在 settled 退回队列；
 * - 写入链：produce(chat.current) → publish（store 更新驱动 UI 订阅）→ settled 时 settle
 *   重读 JSONL 投影回写容器（M4：内容由 pi 自己落盘，运行时不再整行写库）。
 *
 * deps（publish/settle/UI 钩子）由挂载的组件每次渲染刷新注册——它们必须是
 * 无组件生命周期的引用（store action / IPC command），组件卸载后调用依然安全。
 */
import { produce } from "immer";
import type { ChatMessage, ChatSessionMessage, RequestMessage, ResponseMessage } from "@/types";
// 类型导入（运行时不引入 @tau/shared，避免把编辑器包拉进测试模块图，见坑 9）
import type { MessageContentItem } from "@tau/shared";
import { Role } from "@/constants";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  finalizeAssistantTurn,
} from "@/services/assistantMessageBlocks";
import { PiChatEventReducer } from "@/services/piChatEvents";
import { createChatMessageClientId } from "@/services/chatMessageSchema";
import { onPiSessionEvent } from "@/commands/piSession";
import {
  initPiInteractions,
  setInteractionSessionReady,
  usePiInteractionStore,
} from "./piInteractions";
import { withStreamingUpdateTime } from "@/layouts/ContentLayout/components/ChatSidebar/streamingUtils";

/** 组件提供的会话依赖（必须无组件生命周期：store action / IPC command） */
export interface PiChatRuntimeDeps {
  /** 聊天行更新进 store（驱动 UI 订阅） */
  publish(chat: ChatMessage): void;
  /**
   * 一轮结束后的收尾（M4）：JSONL 已由 pi 自己写完，这里重读投影（并更新目录行消息数/时间），
   * 返回投影出的对话；返回 null 表示没有可读的（草稿首轮就失败、文件未落盘）。
   * runtime 按位置沿用原 clientId 回写容器，避免列表重挂载。
   */
  settle(chat: ChatMessage): Promise<ChatSessionMessage[] | null>;
  /** 可选：settled 后生成标题；返回 null 表示不需要/失败 */
  generateTitle?(chat: ChatMessage): Promise<string | null>;
  /** 可选：标题写进目录行（生成成功后调用） */
  saveTitle?(chatId: string, title: string): Promise<void>;
  /** 可选 UI 钩子（组件挂载时有效；卸载后 runtime 继续跑，钩子自动失效） */
  ui?: {
    onRetryStatus?(status: { attempt: number; maxAttempts: number } | null): void;
    onStreamError?(message: string): void;
    onSettled?(conversationKey: string): void;
    onTitleGenerated?(chatId: string, title: string): void;
  };
  /** usage 落地时的模型标识（每轮发送刷新） */
  usageModel?: { providerId: string; modelName?: string };
}

/**
 * 已交给 pi 原生 steer 队列、等待送达的插话。
 * text 是交给 pi 的文本——pi 出队也按文本匹配，送达的用户消息据此认领回本条。
 */
export interface PiPendingSteer {
  id: string;
  text: string;
  /** 原始输入内容：送达时写进聊天行，未送达时退回待发送队列 */
  content: MessageContentItem[];
}

interface ConversationEntry {
  /** 聊天行单一事实源容器（组件 actualChatRef 复用） */
  chat: { current: ChatMessage };
  /**
   * 待发送队列（流式中提交的消息）：归属运行时而非组件——切页/关面板后这些消息必须还在。
   * 排空由挂载中的组件执行（发送编排在组件里），回到页面自动继续。
   */
  queue: MessageContentItem[][];
  /** 用户已按停止：队列暂停自动排空，等用户手动发送或删除 */
  queuePaused: boolean;
  /** 已提交给 pi、尚未送达的插话 */
  pendingSteers: PiPendingSteer[];
  sessionId: string | null;
  reducer: PiChatEventReducer | null;
  unsubscribe: (() => void) | null;
  streaming: boolean;
  deps: PiChatRuntimeDeps;
  /** 标题生成进行中（防同一会话并发重复生成） */
  titleGenerating: boolean;
  /** 用户已请求停止，收尾轮的报错不展示（下一轮 agent_start 复位） */
  stopRequested: boolean;
}

/** 最后一条回答里有没有结果的工具调用（等待审批/作答，或中断在工具执行中） */
const hasUnresolvedToolCall = (message: ResponseMessage): boolean =>
  (message.assistant_blocks ?? []).some(
    block =>
      block.type === "tool_call" &&
      (!block.execution || !["success", "failed", "cancelled"].includes(block.execution.status))
  );

/**
 * 投影回写容器：投影是事实源，但按位置沿用原 clientId（列表按 clientId 做 key，
 * 换成 `pi:<entryId>` 会让每条消息重挂载、滚动位置跳动）。只在角色对得上、且是**同一条**消息时
 * 沿用：两边都带 entry id 却不同（切了版本，这个位置换成了另一条消息），就用投影的 clientId，
 * 否则组件局部状态（工具卡展开、编辑态）会串到另一个版本上。
 * 只换消息，元数据（标题等）以容器为准——生成中的标题回写不能被收尾冲掉。
 */
export const adoptTranscript = (
  current: ChatMessage,
  messages: ChatSessionMessage[]
): ChatMessage => ({
  ...current,
  messages: messages.map((message, index) => {
    const previous = current.messages[index];
    if (!previous?.clientId || previous.role !== message.role) return message;
    const previousEntry = previous.piEntryIds?.[0];
    const nextEntry = message.piEntryIds?.[0];
    if (previousEntry && nextEntry && previousEntry !== nextEntry) return message;
    return { ...message, clientId: previous.clientId };
  }),
});

class PiChatRuntime {
  private readonly conversations = new Map<string, ConversationEntry>();
  private readonly listeners = new Set<(conversationKey: string) => void>();

  /** 订阅会话运行态变化（streaming 置/清），组件据此刷新 sendLoading */
  public subscribe(listener: (conversationKey: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(conversationKey: string): void {
    this.listeners.forEach(listener => listener(conversationKey));
  }

  /** 取/建会话容器；deps 由组件每次渲染刷新（无生命周期的引用） */
  public ensureConversation(key: string, initialChat: ChatMessage, deps: PiChatRuntimeDeps) {
    let entry = this.conversations.get(key);
    if (!entry) {
      entry = {
        chat: { current: initialChat },
        queue: [],
        queuePaused: false,
        pendingSteers: [],
        sessionId: null,
        reducer: null,
        unsubscribe: null,
        streaming: false,
        deps,
        titleGenerating: false,
        stopRequested: false,
      };
      this.conversations.set(key, entry);
    } else {
      entry.deps = deps;
    }
    return entry.chat;
  }

  /** 绑定 pi 会话（常驻 reducer；切换/recreate 会话时重建订阅） */
  public bindSession(key: string, sessionId: string): void {
    const entry = this.conversations.get(key);
    if (!entry || entry.sessionId === sessionId) return;
    entry.unsubscribe?.();
    entry.sessionId = sessionId;
    entry.reducer = this.createReducer(key, entry);
    const lastMessage = entry.chat.current.messages.at(-1);
    if (lastMessage?.role === Role.Assistant) {
      entry.reducer.restoreToolExecutions(lastMessage as ResponseMessage);
    }
    const unsubscribeEvents = onPiSessionEvent(sessionId, event => entry.reducer!.handle(event));
    const applyInteractions = () => {
      const snapshot = usePiInteractionStore.getState().sessions[sessionId];
      if (!snapshot) return;
      entry.reducer!.applyInteractions(snapshot);
      const waiting = snapshot.approvals.length > 0 || snapshot.questions.length > 0;
      if (waiting && !entry.streaming) {
        entry.streaming = true;
        this.notify(key);
      }
    };
    const unsubscribeInteractions = usePiInteractionStore.subscribe((state, previous) => {
      if (state.sessions[sessionId] !== previous.sessions[sessionId]) applyInteractions();
    });
    entry.unsubscribe = () => {
      unsubscribeEvents();
      unsubscribeInteractions();
      setInteractionSessionReady(sessionId, false);
    };
    initPiInteractions();
    applyInteractions();
    setInteractionSessionReady(sessionId, true);
  }

  public isStreaming(key: string): boolean {
    return this.conversations.get(key)?.streaming ?? false;
  }

  // ── 待发送队列（流式中提交的消息）───────────────────────────────────────────

  public listQueue(key: string): MessageContentItem[][] {
    return [...(this.conversations.get(key)?.queue ?? [])];
  }

  public queueSize(key: string): number {
    return this.conversations.get(key)?.queue.length ?? 0;
  }

  public isQueuePaused(key: string): boolean {
    return this.conversations.get(key)?.queuePaused ?? false;
  }

  public enqueueMessage(key: string, content: MessageContentItem[]): number {
    const entry = this.conversations.get(key);
    if (!entry) return 0;
    entry.queue.push(content);
    this.notify(key);
    return entry.queue.length;
  }

  /** 排空取下一条；队列暂停（用户按过停止）时不交出 */
  public dequeueMessage(key: string): MessageContentItem[] | undefined {
    const entry = this.conversations.get(key);
    if (!entry || entry.queuePaused) return undefined;
    const content = entry.queue.shift();
    if (content) this.notify(key);
    return content;
  }

  /** 发送失败/对话已切换：放回队首，保持原顺序 */
  public requeueMessage(key: string, content: MessageContentItem[]): void {
    const entry = this.conversations.get(key);
    if (!entry) return;
    entry.queue.unshift(content);
    this.notify(key);
  }

  /** 取出某条（编辑：移出队列并回填输入框） */
  public takeQueuedMessage(key: string, index: number): MessageContentItem[] | undefined {
    const entry = this.conversations.get(key);
    if (!entry || index < 0 || index >= entry.queue.length) return undefined;
    const [content] = entry.queue.splice(index, 1);
    this.notify(key);
    return content;
  }

  public removeQueuedMessage(key: string, index: number): void {
    const entry = this.conversations.get(key);
    if (!entry || index < 0 || index >= entry.queue.length) return;
    entry.queue.splice(index, 1);
    this.notify(key);
  }

  /** 用户手动发送后恢复自动排空（停止只是暂停，不是丢弃） */
  public resumeQueue(key: string): void {
    const entry = this.conversations.get(key);
    if (!entry || !entry.queuePaused) return;
    entry.queuePaused = false;
    this.notify(key);
  }

  // ── 运行中插话（pi 原生 steer）──────────────────────────────────────────────

  /** 能否插话：会话在运行中且未请求停止（停止后收尾轮不该再塞消息） */
  public canSteer(key: string): boolean {
    const entry = this.conversations.get(key);
    if (!entry) return false;
    return Boolean(entry.sessionId) && entry.streaming && !entry.stopRequested;
  }

  public listPendingSteers(key: string): PiPendingSteer[] {
    return [...(this.conversations.get(key)?.pendingSteers ?? [])];
  }

  /** 提交插话前登记（送达事件可能先于 IPC 返回到达，必须先登记再发 IPC） */
  public addPendingSteer(
    key: string,
    steer: { text: string; content: MessageContentItem[] }
  ): string | undefined {
    const entry = this.conversations.get(key);
    if (!entry) return undefined;
    const id = createChatMessageClientId();
    entry.pendingSteers.push({ id, ...steer });
    this.notify(key);
    return id;
  }

  /**
   * 插话没能交出去（会话已空闲/报错）：退回待发送队首。
   * 只在该条仍挂着时才退——settled 兜底可能已经退过了，避免重复入队。
   */
  public returnPendingSteerToQueue(key: string, steerId: string): boolean {
    const entry = this.conversations.get(key);
    if (!entry) return false;
    const index = entry.pendingSteers.findIndex(steer => steer.id === steerId);
    if (index < 0) return false;
    const [steer] = entry.pendingSteers.splice(index, 1);
    entry.queue.unshift(steer.content);
    this.notify(key);
    return true;
  }

  /**
   * 渲染层重载后恢复等待（审批/提问）：收养主进程仍持有的会话并接上归约订阅。
   * 判定口径（M4）：JSONL 在等待期间只有带 toolCall 的 assistant message、还没有 toolResult，
   * 投影出的工具卡没有 execution——所以看「最后一条回答里有没有结果的 tool_call」，
   * 是不是真在等交给宿主交互快照决定（收养不到 = 主进程也重启了，卡片显示中断）。
   */
  public async restorePendingInteractions(
    key: string,
    chatScope: string,
    chatId: string
  ): Promise<void> {
    const entry = this.conversations.get(key);
    if (!entry || entry.sessionId) return;
    const message = entry.chat.current.messages.at(-1) as ResponseMessage | undefined;
    if (message?.role !== Role.Assistant || !hasUnresolvedToolCall(message)) return;
    initPiInteractions();
    const { piChatSessionManager } = await import("./piChatSession");
    const sessionId = await piChatSessionManager.adoptOrResolveSession(chatScope, chatId);
    if (sessionId && this.conversations.get(key) === entry && !entry.sessionId) {
      this.bindSession(key, sessionId);
    }
  }

  /**
   * 用户主动停止：立即清 streaming 位（UI 即时反馈），后台 pi 自行收尾。
   * 同时记下「本次停止是用户要求的」——pi 没有原生的中止标志，中止落在工具执行中时
   * 收尾轮的 message_end 是 `stopReason:"error"` + AbortError 文案（落在流式中才是
   * `stopReason:"aborted"`）。停止意图只有这里知道，据此抑制收尾报错，不靠匹配错误文案。
   */
  public forceStopStreaming(key: string): void {
    const entry = this.conversations.get(key);
    if (!entry) return;
    entry.stopRequested = true;
    entry.streaming = false;
    // 停止的语义是「这些都别发了」：队列暂停自动排空，未送达的插话由 settled 兜底退回队列，
    // 用户可以逐条编辑/删除，或手动发送恢复排空
    entry.queuePaused = true;
    this.notify(key);
  }

  public resolveSessionId(key: string): string | undefined {
    return this.conversations.get(key)?.sessionId ?? undefined;
  }

  /** 会话删除等终态场景：解绑并清理（组件卸载不调用此方法——后台运行靠常驻） */
  public disposeConversation(key: string): void {
    const entry = this.conversations.get(key);
    if (!entry) return;
    entry.unsubscribe?.();
    this.conversations.delete(key);
  }

  private createReducer(key: string, entry: ConversationEntry): PiChatEventReducer {
    return new PiChatEventReducer(
      {
        applyText: (turnId, text) => {
          this.mutateLastAssistant(key, message =>
            applyAssistantTextSnapshot(message, turnId, text)
          );
        },
        applyReasoning: (turnId, text) => {
          this.mutateLastAssistant(key, message =>
            applyAssistantReasoningSnapshot(message, turnId, text)
          );
        },
        applyToolCalls: (turnId, executions, toolCalls) => {
          this.mutateLastAssistant(key, message =>
            applyAssistantToolCallsSnapshot(message, turnId, executions, toolCalls)
          );
        },
        finalizeTurn: turnId => {
          this.mutateLastAssistant(key, message => finalizeAssistantTurn(message, turnId));
        },
        applyUsage: usage => {
          const model = entry.deps.usageModel;
          this.mutateLastAssistant(key, message => {
            message.usage = {
              ...usage,
              ...(model ? { providerId: model.providerId, modelName: model.modelName } : {}),
            };
          });
        },
        onAssistantTurnEnd: () => {},
        onAgentStart: () => {
          entry.stopRequested = false;
          if (!entry.streaming) {
            entry.streaming = true;
            this.notify(key);
          }
        },
        /**
         * pi 送达了运行中插入的用户消息（原生 steer 落地）：聊天行追加这条用户消息
         * 与新的助手占位，后续本轮事件自然写进新占位。不用另外落库：pi 在送达时就把它写进
         * JSONL（展示 entry 由主进程紧跟着写），重载后投影里就有。
         */
        onUserMessageDelivered: text => {
          const index = entry.pendingSteers.findIndex(steer => steer.text === text);
          const claimed = index >= 0 ? entry.pendingSteers.splice(index, 1)[0] : undefined;
          this.appendDeliveredUserTurn(entry, claimed?.content, text);
          this.notify(key);
        },
        onRetryStatus: status => {
          entry.deps.ui?.onRetryStatus?.(
            status ? { attempt: status.attempt, maxAttempts: status.maxAttempts } : null
          );
          if (status) {
            // 重试轮重置助手占位（幂等快照会追加新 turn，先清上一轮半成品）
            const reset = produce(entry.chat.current, draft => {
              const lastMessageIndex = draft.messages.length - 1;
              const lastMessage = draft.messages[lastMessageIndex];
              if (lastMessage?.role === Role.Assistant) {
                draft.messages[lastMessageIndex] = createAssistantMessage({
                  clientId: (lastMessage as ResponseMessage).clientId,
                });
              }
            });
            entry.chat.current = reset;
            entry.deps.publish(reset);
          }
        },
        onStreamError: errorMessage => {
          // 用户已停止：收尾轮的中止报错不是故障，不打扰用户（见 forceStopStreaming）
          if (entry.stopRequested) {
            console.info("[piChatRuntime] 停止后的收尾报错已忽略:", errorMessage);
            return;
          }
          entry.deps.ui?.onStreamError?.(errorMessage);
          console.error("[piChatRuntime] 聊天请求失败:", errorMessage);
        },
        onSettled: () => {
          if (entry.streaming) {
            entry.streaming = false;
            this.notify(key);
          }
          // 本轮结束还挂着的插话就是没送达的（中止、或提交时这轮刚好已收尾）：
          // 退回待发送队首，由排空按普通消息发出（用户按过停止时队列是暂停的，等他处置）
          this.requeuePendingSteers(entry, key);
          entry.deps.ui?.onSettled?.(key);
          void this.settleFromTranscript(entry);
        },
      },
      entry.sessionId ?? undefined
    );
  }

  private requeuePendingSteers(entry: ConversationEntry, key: string): void {
    if (entry.pendingSteers.length === 0) return;
    entry.queue.unshift(...entry.pendingSteers.map(steer => steer.content));
    entry.pendingSteers = [];
    this.notify(key);
  }

  /** 插话送达：追加用户消息 + 新助手占位（单一事实源 produce → publish；JSONL 由 pi 写） */
  private appendDeliveredUserTurn(
    entry: ConversationEntry,
    content: MessageContentItem[] | undefined,
    text: string
  ): void {
    const userMessage = {
      clientId: createChatMessageClientId(),
      role: Role.User,
      content: (content ?? [{ type: "text", text }]) as RequestMessage["content"],
    } as RequestMessage;
    const next = produce(entry.chat.current, draft => {
      draft.messages.push(userMessage as never, createAssistantMessage() as never);
    });
    entry.chat.current = next;
    entry.deps.publish(withStreamingUpdateTime(next));
  }

  /** settled 收尾：重读投影回写容器，再（异步、不阻塞下一轮）生成标题 */
  private async settleFromTranscript(entry: ConversationEntry): Promise<void> {
    const snapshot = entry.chat.current;
    try {
      const settled = await entry.deps.settle(snapshot);
      // 收尾是异步的：期间容器可能已前进（排队消息开了新一轮、插话送达），那一轮的收尾会再读。
      // 比对消息数组而不是容器对象：目录行元数据更新（消息数/标题）会换容器对象但不动消息
      if (settled && entry.chat.current.messages === snapshot.messages) {
        const next = adoptTranscript(entry.chat.current, settled);
        entry.chat.current = next;
        entry.deps.publish(next);
      }
    } catch (error) {
      console.error("[piChatRuntime] 读取会话投影失败:", error);
      return;
    }
    await this.generateTitle(entry);
  }

  /** 标题生成：结果只补丁 title/titleDirty 到最新快照（不替换整行），再写目录行 */
  private async generateTitle(entry: ConversationEntry): Promise<void> {
    const generate = entry.deps.generateTitle;
    if (!generate || entry.titleGenerating || entry.chat.current.titleDirty !== false) return;
    entry.titleGenerating = true;
    try {
      const title = await generate(entry.chat.current);
      // 生成期间用户可能已手动改名（titleDirty 置位）：不覆盖
      if (!title || entry.chat.current.titleDirty !== false) return;
      const titled = produce(entry.chat.current, draft => {
        draft.title = title;
        draft.titleDirty = true;
      });
      entry.chat.current = titled;
      entry.deps.publish(titled);
      entry.deps.ui?.onTitleGenerated?.(titled.id, title);
      await entry.deps.saveTitle?.(titled.id, title);
    } catch (error) {
      console.error("[piChatRuntime] 标题生成失败:", error);
    } finally {
      entry.titleGenerating = false;
    }
  }

  /** 在最后一条 assistant 消息上应用快照函数（单一事实源 produce → publish），返回发布后的行 */
  private mutateLastAssistant(
    key: string,
    mutate: (message: ResponseMessage) => void
  ): ChatMessage | null {
    const entry = this.conversations.get(key);
    if (!entry) return null;
    const updated = produce(entry.chat.current, draft => {
      const lastMessage = draft.messages.at(-1);
      if (lastMessage?.role === Role.Assistant) {
        mutate(lastMessage as ResponseMessage);
      }
    });
    entry.chat.current = updated;
    entry.deps.publish(withStreamingUpdateTime(updated));
    return updated;
  }
}

export const piChatRuntime = new PiChatRuntime();
