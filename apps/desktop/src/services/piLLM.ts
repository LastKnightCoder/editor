/**
 * pi 单发的渲染端高层封装（业务单发统一入口）。
 * 直接消费 pi 原生事件语义：每个事件带 partial 全量快照，text_delta/thinking_delta 带本次增量，
 * done 携带权威最终消息——不做旧回调契约（onUpdate 双参数等）的桥接转换。
 */
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { piAiCancel, piAiSingleShot, type PiSingleShotOptions } from "@/commands/piAi";
import type { RequestMessage } from "@/types";
import type { LLMModelSetting, LLMProviderSetting, PiThinkingLevel } from "@/types/pi-llm";
import type { UsageSource } from "@/types/model-usage";
import { Role } from "@/constants";
import { getChatDatabase } from "./chatDatabase";
import { normalizePiSystemPrompt } from "./piPromptPayload";

export type PiChatRequest = PiSingleShotOptions;

export interface PiChatOptions {
  provider: LLMProviderSetting;
  model: LLMModelSetting;
  messages: RequestMessage[];
  /** 思考档位；缺省交给 pi 按模型能力取默认 */
  thinking?: PiThinkingLevel;
  /** 用量审计归属；library 缺省取当前对话库 */
  source?: UsageSource;
}

export interface PiChatResult {
  ok: boolean;
  error?: string;
  /** 请求被 cancel() 中止（或流内 aborted）：text 为已接收的部分快照，消费方按需跳过完成态处理 */
  aborted: boolean;
  /** 最终正文（text 块按序拼接）；失败/中止时为已接收的部分快照 */
  text: string;
  /** 最终思考（thinking 块按序拼接） */
  reasoning: string;
  /** pi 原生最终消息（done 事件携带；中止或失败时为 null，用快照兜底拼出 text/reasoning） */
  message: AssistantMessage | null;
}

export interface PiChatHandle {
  result: Promise<PiChatResult>;
  /** 中断请求：主进程 abort 流，result 仍会 resolve（ok=true、message=null、text 为部分快照） */
  cancel(): void;
}

/** 从 AssistantMessage（含各事件 partial 快照）提取正文全量 */
export function piTextOf(message: AssistantMessage | null | undefined): string {
  if (!message) return "";
  return message.content
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("\n\n");
}

/** 从 AssistantMessage 提取思考全量 */
export function piThinkingOf(message: AssistantMessage | null | undefined): string {
  if (!message) return "";
  return message.content
    .filter(block => block.type === "thinking")
    .map(block => block.thinking)
    .join("\n\n");
}

/** chat-core RequestMessage → pi 单发消息：system 抽出拼接，正文块文本化（图片/文件降级为占位） */
export function toPiChatMessages(messages: RequestMessage[]): {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const chat: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (message.role === Role.System) {
      if (typeof message.content === "string")
        systemParts.push(normalizePiSystemPrompt(message.content));
      else if (Array.isArray(message.content)) {
        systemParts.push(
          normalizePiSystemPrompt(
            message.content.map(block => (block.type === "text" ? block.text : "")).join("")
          )
        );
      }
      continue;
    }
    if (message.role === Role.User) {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .map(block =>
                block.type === "text"
                  ? block.text
                  : block.type === "image"
                    ? "[图片]"
                    : `[文件：${block.fileName ?? ""}]`
              )
              .join("\n");
      chat.push({ role: "user", content: text });
      continue;
    }
    if (message.role === Role.Assistant) {
      chat.push({
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
      });
    }
    // Tool 角色消息不出现在无工具单发的对话历史里，忽略
  }
  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, messages: chat };
}

function buildRequest(options: PiChatOptions): PiChatRequest {
  const { system, messages } = toPiChatMessages(options.messages);
  const thinking = options.thinking;
  const temperature = options.model.samplingParams?.temperature;
  const library = options.source?.library ?? getChatDatabase();
  return {
    providerId: options.provider.id,
    modelId: options.model.id,
    ...(system !== undefined ? { system } : {}),
    messages,
    ...(thinking !== undefined ? { thinking } : {}),
    ...(typeof temperature === "number" ? { temperature } : {}),
    source: { ...options.source, ...(library ? { library } : {}) },
  };
}

/** 流式单发：onEvent 收到 pi 原生 AssistantMessageEvent（partial=全量快照、*_delta=增量） */
export function piStreamChat(
  options: PiChatOptions,
  onEvent?: (event: AssistantMessageEvent) => void
): PiChatHandle {
  const request = buildRequest(options);
  const requestId = crypto.randomUUID();
  let settled = false;
  let cancelled = false;

  const result = (async (): Promise<PiChatResult> => {
    let finalMessage: AssistantMessage | null = null;
    let lastSnapshot: AssistantMessage | null = null;
    let streamError: string | null = null;
    let streamAborted = false;
    try {
      const outcome = await piAiSingleShot(
        request,
        event => {
          if (event.type === "done") finalMessage = event.message;
          if (event.type === "error") {
            streamAborted = event.reason === "aborted";
            streamError = event.error.errorMessage ?? "模型请求失败";
            lastSnapshot = event.error;
          }
          if ("partial" in event && event.partial) lastSnapshot = event.partial;
          onEvent?.(event);
        },
        requestId
      );
      settled = true;
      const aborted = cancelled || streamAborted;
      const message = finalMessage ?? lastSnapshot;
      if (streamError && !aborted) {
        return { ok: false, error: streamError, aborted, text: "", reasoning: "", message: null };
      }
      if (!outcome.ok) {
        return {
          ok: false,
          error: outcome.error ?? "模型请求失败",
          aborted,
          text: piTextOf(message),
          reasoning: piThinkingOf(message),
          message: null,
        };
      }
      return {
        ok: true,
        aborted,
        text: piTextOf(message),
        reasoning: piThinkingOf(message),
        message: finalMessage,
      };
    } catch (error) {
      settled = true;
      const message = lastSnapshot;
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        aborted: cancelled,
        text: piTextOf(message),
        reasoning: piThinkingOf(message),
        message: null,
      };
    }
  })();

  return {
    result,
    cancel: () => {
      if (!settled) {
        cancelled = true;
        void piAiCancel(requestId).catch(() => undefined);
      }
    },
  };
}

/** 文本快照流：正文/思考内容变化时回调全量快照（消费 pi partial 语义的标准姿势） */
export function piStreamText(
  options: PiChatOptions,
  onText: (snapshot: { text: string; reasoning: string }) => void
): PiChatHandle {
  return piStreamChat(options, event => {
    if (
      event.type === "text_delta" ||
      event.type === "text_end" ||
      event.type === "thinking_delta" ||
      event.type === "thinking_end" ||
      event.type === "done" ||
      event.type === "error"
    ) {
      const snapshot =
        event.type === "done"
          ? event.message
          : event.type === "error"
            ? event.error
            : "partial" in event
              ? event.partial
              : null;
      onText({ text: piTextOf(snapshot), reasoning: piThinkingOf(snapshot) });
    }
  });
}

/** 非流式单发便捷封装 */
export async function piCompleteChat(options: PiChatOptions): Promise<PiChatResult> {
  return piStreamChat(options).result;
}
