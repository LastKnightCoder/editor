/**
 * 采集点适配：把 pi 的流事件 / 会话事件归约成用量记录。
 * 纯函数 + 小状态机，不依赖 electron，便于单测。
 */
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { ModelUsageStatus } from "@/types/model-usage";
import type { UsageRecordInput } from "./recorder";

export type RecordUsage = (input: UsageRecordInput) => void;

export interface LlmUsageContext {
  providerId: string;
  modelId: string;
  feature: string;
  scope: string | null;
  sessionId: string | null;
  entityId: string | null;
  library: string | null;
  /** 模型设置里有自定义单价（费用按它算，记为 custom） */
  customCost?: boolean;
}

const FIRST_TOKEN_EVENTS = new Set<AssistantMessageEvent["type"]>([
  "text_delta",
  "thinking_delta",
  "toolcall_delta",
]);

const statusOf = (message: AssistantMessage | null, fallback: ModelUsageStatus) => {
  if (!message) return fallback;
  if (message.stopReason === "aborted") return "aborted";
  if (message.stopReason === "error") return "error";
  return fallback;
};

const num = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function buildLlmUsage(
  message: AssistantMessage | null,
  context: LlmUsageContext,
  timing: { startedAt: number; firstTokenAt: number | null; endedAt: number },
  fallback: { status: ModelUsageStatus; errorMessage?: string | null } = { status: "ok" }
): UsageRecordInput {
  const usage = message?.usage;
  const cost = num(usage?.cost?.total);
  const inputTokens = num(usage?.input);
  const outputTokens = num(usage?.output);
  const cacheReadTokens = num(usage?.cacheRead);
  const cacheWriteTokens = num(usage?.cacheWrite);
  const status = statusOf(message, fallback.status);
  return {
    ts: timing.startedAt,
    library: context.library,
    kind: "llm",
    providerId: context.providerId,
    model: context.modelId,
    feature: context.feature,
    scope: context.scope,
    sessionId: context.sessionId,
    entityId: context.entityId,
    status,
    errorMessage: status === "ok" ? null : (message?.errorMessage ?? fallback.errorMessage ?? null),
    latencyMs: Math.max(0, timing.endedAt - timing.startedAt),
    ttftMs:
      timing.firstTokenAt === null ? null : Math.max(0, timing.firstTokenAt - timing.startedAt),
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens: num(usage?.reasoning),
    totalTokens:
      num(usage?.totalTokens) || inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    units: null,
    cost,
    costSource: cost > 0 ? (context.customCost ? "custom" : "catalog") : "none",
  };
}

/** 单发流：逐事件喂入，结束时 finish 产出一条记录 */
export function createStreamUsageTracker(
  context: LlmUsageContext,
  record: RecordUsage,
  now: () => number = Date.now
) {
  const startedAt = now();
  let firstTokenAt: number | null = null;
  let lastMessage: AssistantMessage | null = null;
  let finished = false;

  return {
    observe(event: AssistantMessageEvent) {
      if (firstTokenAt === null && FIRST_TOKEN_EVENTS.has(event.type)) firstTokenAt = now();
      if (event.type === "done") lastMessage = event.message;
      else if (event.type === "error") lastMessage = event.error;
      else if ("partial" in event && event.partial) lastMessage = event.partial;
    },
    finish(outcome: { aborted: boolean; error?: string | null }) {
      if (finished) return;
      finished = true;
      const status: ModelUsageStatus = outcome.aborted ? "aborted" : outcome.error ? "error" : "ok";
      record(
        buildLlmUsage(
          lastMessage,
          context,
          { startedAt, firstTokenAt, endedAt: now() },
          { status, errorMessage: outcome.error ?? null }
        )
      );
    },
  };
}

type SessionEventLike =
  | { type: "turn_start" }
  | { type: "message_start"; message: { role?: string } }
  | {
      type: "message_update";
      message: { role?: string };
      assistantMessageEvent?: AssistantMessageEvent;
    }
  | { type: "message_end"; message: { role?: string } }
  | { type: string };

/**
 * 会话：每条 assistant 消息（一轮模型请求）记一条。
 * 计时从 turn_start 起算（含请求发出到首字节），没有 turn_start 时退回 message_start。
 */
export function createSessionUsageTracker(
  getContext: () => LlmUsageContext,
  record: RecordUsage,
  now: () => number = Date.now
) {
  let turnStartedAt: number | null = null;
  let messageStartedAt: number | null = null;
  let firstTokenAt: number | null = null;

  return (event: SessionEventLike) => {
    try {
      switch (event.type) {
        case "turn_start":
          turnStartedAt = now();
          break;
        case "message_start": {
          const { message } = event as { message: { role?: string } };
          if (message?.role !== "assistant") break;
          messageStartedAt = now();
          firstTokenAt = null;
          break;
        }
        case "message_update": {
          const update = event as { assistantMessageEvent?: AssistantMessageEvent };
          if (
            firstTokenAt === null &&
            update.assistantMessageEvent &&
            FIRST_TOKEN_EVENTS.has(update.assistantMessageEvent.type)
          ) {
            firstTokenAt = now();
          }
          break;
        }
        case "message_end": {
          const { message } = event as unknown as { message: AssistantMessage & { role?: string } };
          if (message?.role !== "assistant") break;
          const endedAt = now();
          const startedAt = turnStartedAt ?? messageStartedAt ?? endedAt;
          record(buildLlmUsage(message, getContext(), { startedAt, firstTokenAt, endedAt }));
          // 同一 turn 内不会再有第二条 assistant；下一轮请求等下一个 turn_start
          turnStartedAt = null;
          messageStartedAt = null;
          firstTokenAt = null;
          break;
        }
      }
    } catch {
      // 用量归约出错不影响会话事件分发
    }
  };
}

const SCOPE_FEATURES: Record<string, string> = {
  "main-chat": "chat",
  "pdf-chat": "pdfChat",
  "video-note-chat": "videoNoteChat",
  "vibe-learning-chat": "vibeLearningChat",
  browser: "browserChat",
  "inline-content-edit": "inlineAssistant",
  subagent: "subagent",
};

/**
 * 会话键 → 会话类别与知识库。键的形态：
 * - 聊天：`<库名>\u0000<scope>:<chatId>`
 * - 子代理：`<父会话键>:subagent:<taskId>`
 * - 其他：`browser:<id>` / `inline-content-edit:<id>` / `one-shot:<id>`
 */
export function parseSessionScope(key: string): { scope: string; library: string | null } {
  const separator = key.indexOf("\u0000");
  const library = separator >= 0 ? key.slice(0, separator) || null : null;
  const rest = separator >= 0 ? key.slice(separator + 1) : key;
  if (rest.includes(":subagent:")) return { scope: "subagent", library };
  const colon = rest.indexOf(":");
  return { scope: colon >= 0 ? rest.slice(0, colon) : rest, library };
}

export const featureOfScope = (scope: string): string => SCOPE_FEATURES[scope] ?? "unknown";
