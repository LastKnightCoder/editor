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
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
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
import {
  onPiSessionEvent,
  piSessionFindByScope,
  type PiSessionRecovery,
} from "@/commands/piSession";
import {
  initPiInteractions,
  setInteractionSessionReady,
  usePiInteractionStore,
} from "./piInteractions";
import { withStreamingUpdateTime } from "@/components/ChatSidebar/streamingUtils";

/** 组件提供的会话依赖（必须无组件生命周期：store action / IPC command） */
export interface PiChatRuntimeDeps {
  /** 完整会话域标识（如 `main-chat`、`pdf-chat:12`、`vibe-learning-chat:5`） */
  chatScope?: string;
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
  evict?(chat: ChatMessage): void;
  /** 可选 UI 钩子（组件挂载时有效；卸载后 runtime 继续跑，钩子自动失效） */
  ui?: {
    onRetryStatus?(status: { attempt: number; maxAttempts: number } | null): void;
    onStreamError?(message: string): void;
    onSettled?(conversationKey: string): void;
    onTitleGenerated?(chatId: string, title: string): void;
  };
  /** usage 落地时的模型标识（每轮发送刷新） */
  usageModel?: { providerId: string; modelId: string };
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
  eventRevision: number;
  reducer: PiChatEventReducer | null;
  unsubscribe: (() => void) | null;
  streaming: boolean;
  pending: boolean;
  deps: PiChatRuntimeDeps;
  /** 标题生成进行中（防同一会话并发重复生成） */
  titleGenerating: boolean;
  /** 用户已请求停止，收尾轮的报错不展示（下一轮 agent_start 复位） */
  stopRequested: boolean;
  /** 挂载中的视图数（挂着的不回收） */
  mounts: number;
  /** 最近一次使用（LRU 回收用） */
  lastUsed: number;
}

/** 空闲条目最多保留几条：超出按最近使用淘汰；在跑、等待交互、有队列/插话、挂着的不计入也不淘汰 */
const MAX_IDLE_CONVERSATIONS = 20;

/** 一轮对话结束或失败时发布给壳层观察者（如 AI 任务通知），避免运行时耦合 UI */
export interface PiChatRunOutcome {
  conversationKey: string;
  chatScope: string;
  chatId: string;
  databaseName?: string;
  title: string;
  kind: "settled" | "error";
  elapsedMs: number;
  stopped: boolean;
  errorMessage?: string;
}

export interface PiChatSessionMeta {
  conversationKey: string;
  chatScope: string;
  chatId: string;
  databaseName?: string;
  title: string;
}

/** 一轮对话运行（一条用户消息到沉淀）的排障计数：起跑时登记，settled 时写成一行摘要后移除 */
interface RunStats {
  startedAt: number;
  /** 每个 assistant 消息的工具调用数：事件是全量快照，同一轮只保留最大值 */
  toolCallsByTurn: Map<string, number>;
  finishedTurns: number;
  inputTokens: number;
  outputTokens: number;
  finishReason: string | null;
  errorMessage?: string;
}
const runStats = new WeakMap<ConversationEntry, RunStats>();

function createRunStats(startedAt = performance.now()): RunStats {
  return {
    startedAt,
    toolCallsByTurn: new Map(),
    finishedTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    finishReason: null,
  };
}

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
  private readonly outcomeListeners = new Set<(outcome: PiChatRunOutcome) => void>();

  /** 订阅会话运行态变化（streaming 置/清），组件据此刷新 sendLoading */
  public subscribe(listener: (conversationKey: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 订阅一轮对话结束或报错（不带 UI 依赖） */
  public onRunOutcome(listener: (outcome: PiChatRunOutcome) => void): () => void {
    this.outcomeListeners.add(listener);
    return () => this.outcomeListeners.delete(listener);
  }

  private emitOutcome(outcome: PiChatRunOutcome): void {
    this.outcomeListeners.forEach(listener => listener(outcome));
  }

  /** 按 conversationKey 反查会话元数据（供子 Agent 与改写审阅通知回跳） */
  public findByKey(conversationKey: string): PiChatSessionMeta | undefined {
    const entry = this.conversations.get(conversationKey);
    if (!entry) return undefined;
    return {
      conversationKey,
      chatScope: entry.deps.chatScope ?? "",
      chatId: entry.chat.current.id,
      databaseName: entry.chat.current.databaseName,
      title: entry.chat.current.title,
    };
  }

  /** 按 pi sessionId 反查会话元数据（供交互通知路由与标题展示） */
  public findBySessionId(sessionId: string): PiChatSessionMeta | undefined {
    for (const [conversationKey, entry] of this.conversations) {
      if (entry.sessionId !== sessionId) continue;
      return {
        conversationKey,
        chatScope: entry.deps.chatScope ?? "",
        chatId: entry.chat.current.id,
        databaseName: entry.chat.current.databaseName,
        title: entry.chat.current.title,
      };
    }
    return undefined;
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
        eventRevision: 0,
        reducer: null,
        unsubscribe: null,
        streaming: false,
        pending: false,
        deps,
        titleGenerating: false,
        stopRequested: false,
        mounts: 0,
        lastUsed: Date.now(),
      };
      this.conversations.set(key, entry);
    } else {
      entry.deps = deps;
      entry.lastUsed = Date.now();
    }
    return entry.chat;
  }

  /** 视图挂载：返回释放函数（卸载时调）。释放后顺手做一次空闲回收 */
  public retain(key: string): () => void {
    const entry = this.conversations.get(key);
    if (entry) {
      entry.mounts += 1;
      entry.lastUsed = Date.now();
    }
    return () => {
      const current = this.conversations.get(key);
      if (current && current === entry) {
        current.mounts = Math.max(0, current.mounts - 1);
        current.lastUsed = Date.now();
        if (current.mounts === 0) current.deps = { ...current.deps, ui: undefined };
      }
      this.sweepIdle();
    };
  }

  /** 可回收 = 没挂着、不在跑、没有待处理交互、队列与插话为空、没在生成标题 */
  private isIdle(entry: ConversationEntry): boolean {
    if (entry.mounts > 0 || entry.pending || entry.streaming || entry.titleGenerating) return false;
    if (entry.queue.length > 0 || entry.pendingSteers.length > 0) return false;
    if (entry.sessionId) {
      const snapshot = usePiInteractionStore.getState().sessions[entry.sessionId];
      if (snapshot && (snapshot.approvals.length > 0 || snapshot.questions.length > 0))
        return false;
    }
    return true;
  }

  /** 空闲条目超出上限时按最近使用淘汰（只清渲染端归约条目；宿主会话由主进程自己的空闲回收管） */
  public sweepIdle(limit = MAX_IDLE_CONVERSATIONS): string[] {
    const idle = [...this.conversations.entries()]
      .filter(([, entry]) => this.isIdle(entry))
      .sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
    const doomed = idle.slice(limit).map(([key]) => key);
    doomed.forEach(key => {
      const entry = this.conversations.get(key);
      if (entry) entry.deps.evict?.(entry.chat.current);
      this.disposeConversation(key);
    });
    return doomed;
  }

  /** 切库：旧库的对话全部失效，清掉所有空闲条目（在跑的留着自己收尾） */
  public releaseIdle(): string[] {
    const keys = [...this.conversations]
      .filter(
        ([, entry]) =>
          !entry.streaming &&
          !entry.pending &&
          !entry.titleGenerating &&
          !entry.queue.length &&
          !entry.pendingSteers.length
      )
      .map(([key]) => key);
    keys.forEach(key => this.disposeConversation(key));
    return keys;
  }

  public invalidateLibrary(databaseName: string): void {
    for (const [key, entry] of this.conversations) {
      if (entry.chat.current.databaseName === databaseName) this.disposeConversation(key);
    }
  }

  /** 绑定 pi 会话（常驻 reducer；切换/recreate 会话时重建订阅） */
  public bindSession(key: string, sessionId: string): void {
    const entry = this.conversations.get(key);
    if (!entry || entry.sessionId === sessionId) return;
    entry.unsubscribe?.();
    entry.reducer?.reset();
    entry.sessionId = sessionId;
    entry.reducer = this.createReducer(key, entry);
    const reducer = entry.reducer;
    const lastMessage = entry.chat.current.messages.at(-1);
    if (lastMessage?.role === Role.Assistant) {
      reducer.restoreToolExecutions(lastMessage as ResponseMessage);
    }
    const unsubscribeEvents = onPiSessionEvent(sessionId, (event, modelRef) => {
      entry.eventRevision += 1;
      if (
        event.type === "compaction_end" &&
        !event.aborted &&
        !event.errorMessage &&
        event.result?.estimatedTokensAfter !== undefined
      ) {
        entry.chat.current = {
          ...entry.chat.current,
          compaction: {
            tokensBefore: event.result.tokensBefore,
            estimatedTokensAfter: event.result.estimatedTokensAfter,
            isCurrent: true,
            ...modelRef,
          },
        };
        entry.deps.publish(entry.chat.current);
        this.notify(key);
      }
      if (event.type === "compaction_end" && event.reason === "manual" && entry.streaming) {
        // 重载时恢复的手动压缩没有回答，也不会有 agent_settled。
        entry.streaming = false;
        this.notify(key);
      }
      reducer.handle(event);
    });
    const applyInteractions = () => {
      const snapshot = usePiInteractionStore.getState().sessions[sessionId];
      if (!snapshot) return;
      reducer.applyInteractions(snapshot);
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

  public isPending(key: string): boolean {
    return this.conversations.get(key)?.pending ?? false;
  }

  public setPending(key: string, pending: boolean): void {
    const entry = this.conversations.get(key);
    if (entry) {
      entry.pending = pending;
      this.notify(key);
    }
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
   * 渲染层重载后收养宿主并恢复续流，运行状态以主进程为准，不依赖落盘消息是否含工具调用。
   */
  public async restoreSession(key: string, chatScope: string, chatId: string): Promise<void> {
    const entry = this.conversations.get(key);
    if (!entry || entry.sessionId || entry.pending) return;
    entry.pending = true;
    this.notify(key);
    try {
      initPiInteractions();
      const { piChatSessionManager } = await import("./piChatSession");
      const restored = await piChatSessionManager.adoptOrResolveSession(
        chatScope,
        chatId,
        entry.chat.current.databaseName
      );
      if (!restored?.sessionId || this.conversations.get(key) !== entry || entry.sessionId) return;
      this.applySessionRecovery(key, entry, restored);
      if (restored.busy) {
        // 订阅前可能已经结束；订阅后复核，期间收到新事件时以事件为准。
        const revision = entry.eventRevision;
        const current = await piSessionFindByScope(key);
        if (
          this.conversations.get(key) === entry &&
          entry.sessionId === restored.sessionId &&
          entry.eventRevision === revision &&
          current.ok &&
          current.sessionId === restored.sessionId &&
          current.messages
        ) {
          this.applySessionRecovery(key, entry, current);
        }
      }
    } finally {
      if (this.conversations.get(key) === entry) {
        entry.pending = false;
        this.notify(key);
      }
    }
  }

  private applySessionRecovery(key: string, entry: ConversationEntry, snapshot: PiSessionRecovery) {
    if (!snapshot.sessionId) return;
    if (snapshot.busy && !snapshot.manualCompaction && !runStats.has(entry)) {
      runStats.set(
        entry,
        createRunStats(
          performance.now() - Math.max(0, Date.now() - (snapshot.runStartedAt ?? Date.now()))
        )
      );
    }
    entry.reducer?.reset();
    if (snapshot.messages)
      entry.chat.current = {
        ...adoptTranscript(entry.chat.current, snapshot.messages),
        compaction: snapshot.compaction,
      };
    if (
      snapshot.busy &&
      !snapshot.manualCompaction &&
      entry.chat.current.messages.at(-1)?.role !== Role.Assistant
    ) {
      entry.chat.current = {
        ...entry.chat.current,
        messages: [...entry.chat.current.messages, createAssistantMessage()],
      };
    }
    entry.deps.publish(entry.chat.current);
    this.bindSession(key, snapshot.sessionId);
    const reducer = entry.reducer;
    if (!reducer) throw new Error("会话恢复失败：reducer 未初始化");
    const lastMessage = entry.chat.current.messages.at(-1);
    if (lastMessage?.role === Role.Assistant)
      reducer.restoreToolExecutions(lastMessage as ResponseMessage);
    if (snapshot.busy !== undefined) entry.streaming = snapshot.busy;
    if (snapshot.streamingMessage?.role === Role.Assistant) {
      reducer.handle({ type: "message_start", message: snapshot.streamingMessage });
      reducer.handle({
        type: "message_update",
        message: snapshot.streamingMessage,
        assistantMessageEvent: { type: "start", partial: snapshot.streamingMessage },
      } as AgentSessionEvent);
    }
    const stats = runStats.get(entry);
    if (snapshot.busy === false && stats) {
      stats.finishedTurns = Math.max(stats.finishedTurns, 1);
      stats.finishReason = snapshot.lastAssistantOutcome?.finishReason ?? "stop";
      stats.errorMessage = snapshot.lastAssistantOutcome?.errorMessage;
      reducer.handle({ type: "agent_settled" } as AgentSessionEvent);
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
    entry.reducer?.reset();
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
          const stats = runStats.get(entry);
          if (stats && toolCalls?.length)
            stats.toolCallsByTurn.set(
              turnId,
              Math.max(stats.toolCallsByTurn.get(turnId) ?? 0, toolCalls.length)
            );
          this.mutateLastAssistant(key, message =>
            applyAssistantToolCallsSnapshot(message, turnId, executions, toolCalls)
          );
        },
        finalizeTurn: turnId => {
          this.mutateLastAssistant(key, message => finalizeAssistantTurn(message, turnId));
        },
        applyUsage: usage => {
          const compaction = entry.chat.current.compaction;
          if (compaction?.isCurrent && usage.inputTokens + usage.outputTokens > 0)
            entry.chat.current = {
              ...entry.chat.current,
              compaction: { ...compaction, isCurrent: false },
            };
          const stats = runStats.get(entry);
          if (stats) {
            stats.inputTokens += usage.inputTokens;
            stats.outputTokens += usage.outputTokens;
          }
          const model = entry.deps.usageModel;
          this.mutateLastAssistant(key, message => {
            message.usage = {
              ...usage,
              ...(model ? { providerId: model.providerId, modelId: model.modelId } : {}),
            };
          });
        },
        onAssistantTurnEnd: ({ finishReason }) => {
          const stats = runStats.get(entry);
          if (stats) {
            stats.finishedTurns++;
            stats.finishReason = finishReason;
            if (finishReason !== "error") stats.errorMessage = undefined;
          }
        },
        onAgentStart: () => {
          entry.stopRequested = false;
          if (!runStats.has(entry)) {
            runStats.set(entry, createRunStats());
          }
          if (!entry.streaming) {
            const last = entry.chat.current.messages.at(-1);
            if (
              last?.role === Role.Assistant &&
              (last.content || (last as ResponseMessage).assistant_blocks?.length)
            ) {
              entry.reducer?.reset();
              entry.chat.current = {
                ...entry.chat.current,
                messages: [...entry.chat.current.messages, createAssistantMessage()],
              };
              entry.deps.publish(entry.chat.current);
            }
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
          const stats = runStats.get(entry) ?? createRunStats();
          stats.errorMessage = errorMessage;
          runStats.set(entry, stats);
          entry.deps.ui?.onStreamError?.(errorMessage);
          console.error("[piChatRuntime] 聊天请求失败:", errorMessage);
        },
        onSettled: () => {
          entry.pending = false;
          this.notify(key);
          if (entry.streaming) {
            entry.streaming = false;
            this.notify(key);
          }
          const stats = runStats.get(entry);
          if (stats) {
            // 一轮运行只留这一行：答到一半停了、答非所问时先看结束原因与工具调用数
            runStats.delete(entry);
            const elapsedMs = Math.round(performance.now() - stats.startedAt);
            const model = entry.deps.usageModel;
            console.info("[ai-run] 对话运行结束", {
              sessionId: entry.sessionId,
              providerId: model?.providerId,
              modelId: model?.modelId,
              finishReason: stats.finishReason,
              turns: stats.finishedTurns,
              toolCalls: [...stats.toolCallsByTurn.values()].reduce((sum, count) => sum + count, 0),
              inputTokens: stats.inputTokens,
              outputTokens: stats.outputTokens,
              elapsedMs,
              stopped: entry.stopRequested,
            });
            if (
              !entry.stopRequested &&
              stats.finishReason !== "aborted" &&
              (stats.finishedTurns > 0 || stats.errorMessage)
            ) {
              this.emitOutcome({
                conversationKey: key,
                chatScope: entry.deps.chatScope ?? "",
                chatId: entry.chat.current.id,
                databaseName: entry.chat.current.databaseName,
                title: entry.chat.current.title,
                kind: stats.errorMessage || stats.finishReason === "error" ? "error" : "settled",
                errorMessage: stats.errorMessage,
                elapsedMs,
                stopped: false,
              });
            }
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
      if (![...this.conversations.values()].includes(entry)) return;
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
      if (![...this.conversations.values()].includes(entry)) return;
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
