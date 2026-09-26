/**
 * pi 会话归约运行时（模块级单例）：把"AgentSessionEvent → 聊天行写入"从组件生命周期中解放——
 * 组件卸载（切页/关面板）后事件继续归约、落库，pi 会话在主进程后台跑完，重挂载时无缝接续。
 *
 * 职责（每 conversationKey 一份，常驻）：
 * - chat 容器：聊天行单一事实源（组件的 actualChatRef 直接复用本容器的 {current}）；
 * - 常驻 reducer：pi 事件归约（同一会话多轮发送共享，pi 事件串行到达无竞争）；
 * - streaming 态：agent_start/agent_settled 事件驱动（组件据此算 sendLoading）；
 * - 写入链：produce(chat.current) → publish（store 更新驱动 UI 订阅）→ settled 时 persist 落库。
 *
 * deps（publish/persist/UI 钩子）由挂载的组件每次渲染刷新注册——它们必须是
 * 无组件生命周期的引用（store action / IPC command），组件卸载后调用依然安全。
 */
import { produce } from "immer";
import type { ChatMessage, ResponseMessage } from "@/types";
import { Role } from "@/constants";
import {
  applyAssistantReasoningSnapshot,
  applyAssistantTextSnapshot,
  applyAssistantToolCallsSnapshot,
  createAssistantMessage,
  finalizeAssistantTurn,
} from "@/services/assistantMessageBlocks";
import { PiChatEventReducer } from "@/services/piChatEvents";
import { onPiSessionEvent } from "@/commands/piSession";
import { withStreamingUpdateTime } from "@/layouts/ContentLayout/components/ChatSidebar/streamingUtils";

/** 组件提供的会话依赖（必须无组件生命周期：store action / IPC command） */
export interface PiChatRuntimeDeps {
  /** 聊天行更新进 store（驱动 UI 订阅） */
  publish(chat: ChatMessage): void;
  /** 聊天行落库 */
  persist(chat: ChatMessage): Promise<ChatMessage>;
  /** 可选 UI 钩子（组件挂载时有效；卸载后 runtime 继续跑，钩子自动失效） */
  ui?: {
    onRetryStatus?(status: { attempt: number; maxAttempts: number } | null): void;
    onStreamError?(message: string): void;
    onSettled?(conversationKey: string): void;
  };
  /** usage 落地时的模型标识（每轮发送刷新） */
  usageModel?: { providerId: string; modelName?: string };
}

interface ConversationEntry {
  /** 聊天行单一事实源容器（组件 actualChatRef 复用） */
  chat: { current: ChatMessage };
  sessionId: string | null;
  reducer: PiChatEventReducer | null;
  unsubscribe: (() => void) | null;
  streaming: boolean;
  deps: PiChatRuntimeDeps;
  /** ask-question 等待快照的持久化去重 */
  persistedExecutionKeys: Set<string>;
}

const ASK_QUESTION_TOOL_NAME = "ask-question";

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
        sessionId: null,
        reducer: null,
        unsubscribe: null,
        streaming: false,
        deps,
        persistedExecutionKeys: new Set<string>(),
      };
      this.conversations.set(key, entry);
    } else {
      entry.deps = deps;
    }
    return entry.chat;
  }

  /** 新对话落库后（id 0→N）迁移条目——容器对象保持不变（组件持有的 ref 持续有效） */
  public adoptConversation(
    oldKey: string,
    newKey: string,
    chat: ChatMessage,
    deps: PiChatRuntimeDeps
  ) {
    const entry = this.conversations.get(oldKey);
    if (entry) {
      entry.chat.current = chat;
      entry.deps = deps;
      this.conversations.delete(oldKey);
      this.conversations.set(newKey, entry);
      return entry.chat;
    }
    return this.ensureConversation(newKey, chat, deps);
  }

  /** 绑定 pi 会话（常驻 reducer；切换/recreate 会话时重建订阅） */
  public bindSession(key: string, sessionId: string): void {
    const entry = this.conversations.get(key);
    if (!entry || entry.sessionId === sessionId) return;
    entry.unsubscribe?.();
    entry.sessionId = sessionId;
    entry.reducer = this.createReducer(key, entry);
    entry.unsubscribe = onPiSessionEvent(sessionId, event => entry.reducer!.handle(event));
  }

  public isStreaming(key: string): boolean {
    return this.conversations.get(key)?.streaming ?? false;
  }

  /** 用户主动停止：立即清 streaming 位（UI 即时反馈），后台 pi 自行收尾 */
  public forceStopStreaming(key: string): void {
    const entry = this.conversations.get(key);
    if (entry?.streaming) {
      entry.streaming = false;
      this.notify(key);
    }
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
    return new PiChatEventReducer({
      applyText: (turnId, text) => {
        this.mutateLastAssistant(key, message => applyAssistantTextSnapshot(message, turnId, text));
      },
      applyReasoning: (turnId, text) => {
        this.mutateLastAssistant(key, message =>
          applyAssistantReasoningSnapshot(message, turnId, text)
        );
      },
      applyToolCalls: (turnId, executions, toolCalls) => {
        const published = this.mutateLastAssistant(key, message =>
          applyAssistantToolCallsSnapshot(message, turnId, executions, toolCalls)
        );
        if (!published) return;
        // ask-question 进入等待态时立即落库快照，确保渲染层重载后可恢复
        const pendingAskQuestions = executions.filter(
          execution =>
            execution.toolName === ASK_QUESTION_TOOL_NAME &&
            (execution.status === "pending" ||
              execution.status === "executing" ||
              execution.status === "retrying")
        );
        const shouldPersist = pendingAskQuestions.some(
          execution =>
            !entry.persistedExecutionKeys.has(`${execution.toolCallId}::${execution.input}`)
        );
        if (shouldPersist) {
          pendingAskQuestions.forEach(execution =>
            entry.persistedExecutionKeys.add(`${execution.toolCallId}::${execution.input}`)
          );
          void entry.deps.persist(published).catch(error => {
            console.error("持久化 ask-question 快照失败:", error);
          });
        }
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
        if (!entry.streaming) {
          entry.streaming = true;
          this.notify(key);
        }
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
        entry.deps.ui?.onStreamError?.(errorMessage);
        console.error("[piChatRuntime] 聊天请求失败:", errorMessage);
      },
      onSettled: () => {
        if (entry.streaming) {
          entry.streaming = false;
          this.notify(key);
        }
        entry.deps.ui?.onSettled?.(key);
        void (async () => {
          try {
            const persisted = await entry.deps.persist(entry.chat.current);
            entry.chat.current = persisted;
            entry.deps.publish(persisted);
          } catch (error) {
            console.error("[piChatRuntime] 聊天持久化失败:", error);
          }
        })();
      },
      onQueueUpdate: () => {},
    });
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
