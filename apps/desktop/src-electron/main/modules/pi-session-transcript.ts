/**
 * pi JSONL → 桌面展示消息的投影（M4）：`desktopMessagesToPi` 的逆向。
 * 会话内容的事实源是 pi 的 append-only 会话文件，打开一个对话就是把叶子路径上的
 * message entry 投影成渲染端的 ChatSessionMessage（assistant_blocks 形状）。
 *
 * 两条对齐约束：
 * - 块 id / turnId 约定必须与运行时归约（piChatEvents + chat-core assistantBlocks）一致，
 *   否则续聊时新事件会和历史块撞 id。turnId 用 `pi:jsonl:<entryId>`：运行时的递增
 *   turnId 是 `pi:<序号>`，两者形状不同，不会互撞。
 * - 一条 pi assistant message = 一个 turn；两条用户消息之间的多个 assistant message
 *   （工具循环）合并成**一条** ResponseMessage 的多个 turn，与运行时产出的结构相同。
 *
 * electron-free，可单测。
 */
import type {
  AssistantBlock,
  AssistantToolCallBlock,
  ChatSessionMessage,
  MessageContent,
  RequestMessage,
  ResponseMessage,
  ToolCallExecutionState,
} from "@/types";
import { Role } from "@/constants";
import { syncAssistantDerivedFields } from "@/services/assistantMessageBlocks";

/**
 * pi 会话里的一条消息（结构化最小声明）：pi 的 AgentMessage 联合体覆盖 custom/bashExecution 等
 * 桌面不展示的类型，这里只按需要的字段读，也让本模块不依赖 pi 的内部包。
 */
export interface PiTranscriptMessage {
  role?: string;
  content?: unknown;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  /** 工具结果的结构化载荷：桌面工具卡（审阅卡/结构化结果/生图/子代理）靠它渲染 */
  details?: unknown;
  timestamp?: number;
  provider?: string;
  model?: string;
  usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

export interface PiTranscriptEntry {
  /** pi 会话 entry id（投影后作为 turnId/clientId 的来源，供后续会话树导航定位） */
  id: string;
  message: PiTranscriptMessage;
  /**
   * 该用户消息的桌面展示形态（来自紧随的 desktop-display entry）：
   * 有它就按原样展示（文件卡片、mention），没有才退回用模型文本拼。
   */
  display?: { content: MessageContent[]; clientId?: string };
  /** 用户消息在会话树上的全部版本（M4-d；只有一个版本时不带） */
  versions?: { ids: string[]; index: number };
}

type PiContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  data?: string;
  mimeType?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
};

const contentBlocksOf = (content: unknown): PiContentBlock[] =>
  Array.isArray(content) ? (content as PiContentBlock[]) : [];

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  return contentBlocksOf(content)
    .filter(block => block.type === "text")
    .map(block => block.text ?? "")
    .join("\n");
};

const turnIdOf = (entryId: string) => `pi:jsonl:${entryId}`;

/** pi 的 user message → 桌面用户消息（图片没有本地路径，按 dataURL 展示） */
const toRequestMessage = (entry: PiTranscriptEntry): RequestMessage | null => {
  const request = toRequestContent(entry);
  if (request && entry.versions) {
    request.piVersions = { ids: entry.versions.ids, index: entry.versions.index };
  }
  return request;
};

const toRequestContent = (entry: PiTranscriptEntry): RequestMessage | null => {
  const entryId = entry.id;
  const piEntryIds = [entryId];
  if (entry.display && entry.display.content.length > 0) {
    return {
      clientId: entry.display.clientId ?? `pi:${entryId}`,
      piEntryIds,
      role: Role.User,
      content: entry.display.content,
    };
  }
  const raw = entry.message.content;
  if (typeof raw === "string") {
    return raw.trim()
      ? { clientId: `pi:${entryId}`, piEntryIds, role: Role.User, content: raw }
      : null;
  }
  const content: MessageContent[] = [];
  for (const block of contentBlocksOf(raw)) {
    if (block.type === "text" && block.text) {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "image" && block.data) {
      content.push({
        type: "image",
        image: `data:${block.mimeType || "image/png"};base64,${block.data}`,
      });
    }
  }
  if (content.length === 0) return null;
  return { clientId: `pi:${entryId}`, piEntryIds, role: Role.User, content };
};

/** pi 的 assistant message → 一个 turn 的块序列（顺序保持：thinking/text/toolCall 原样） */
const toAssistantBlocks = (entryId: string, message: PiTranscriptMessage): AssistantBlock[] => {
  const turnId = turnIdOf(entryId);
  const blocks: AssistantBlock[] = [];
  for (const block of contentBlocksOf(message.content)) {
    if (block.type === "thinking" && block.thinking) {
      blocks.push({
        id: `${turnId}:reasoning`,
        turnId,
        type: "reasoning",
        state: "final",
        content: block.thinking,
      });
    } else if (block.type === "text" && block.text) {
      blocks.push({
        id: `${turnId}:text`,
        turnId,
        type: "text",
        state: "final",
        content: block.text,
      });
    } else if (block.type === "toolCall" && block.id) {
      blocks.push({
        id: block.id,
        turnId,
        type: "tool_call",
        state: "final",
        toolCall: {
          id: block.id,
          type: "function",
          function: {
            name: block.name ?? "",
            arguments: JSON.stringify(block.arguments ?? {}),
          },
        },
      });
    }
  }
  return blocks;
};

/** 工具结果回填进对应的 tool_call 块（pi 里工具结果是独立消息，桌面里挂在块上） */
const applyToolResult = (message: ResponseMessage, result: PiTranscriptMessage): void => {
  const toolCallId = result.toolCallId;
  if (!toolCallId) return;
  const block = (message.assistant_blocks ?? []).find(
    (candidate): candidate is AssistantToolCallBlock =>
      candidate.type === "tool_call" && candidate.toolCall.id === toolCallId
  );
  if (!block) return;
  const output = textOf(result.content);
  // 与运行时归约（piChatEvents tool_execution_end）同一口径：details 平铺进 metadata
  const details =
    result.details && typeof result.details === "object" && !Array.isArray(result.details)
      ? (result.details as Record<string, unknown>)
      : undefined;
  const execution: ToolCallExecutionState = {
    toolCallId,
    toolName: result.toolName ?? block.toolCall.function.name,
    status: result.isError ? "failed" : "success",
    input: block.toolCall.function.arguments ?? "",
    timestamp: result.timestamp ?? Date.now(),
    ...(output ? { output } : {}),
    ...(details ? { metadata: details } : {}),
    ...(result.isError && !output ? { error: "工具执行失败" } : {}),
  };
  block.execution = execution;
};

const accumulateUsage = (message: ResponseMessage, source: PiTranscriptMessage): void => {
  const usage = source.usage;
  const provider = source.provider;
  const model = source.model;
  const current = message.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  message.usage = {
    inputTokens: current.inputTokens + (usage?.input ?? 0),
    outputTokens: current.outputTokens + (usage?.output ?? 0),
    cacheReadTokens: current.cacheReadTokens + (usage?.cacheRead ?? 0),
    cacheWriteTokens: current.cacheWriteTokens + (usage?.cacheWrite ?? 0),
    ...(provider ? { providerId: provider } : {}),
    ...(model ? { modelName: model } : {}),
  };
};

/**
 * 叶子路径上的 message entry → 桌面展示消息序列。
 * 跳过 system（桌面的 system 由会话装配承载）与 pi 自有的 custom/bashExecution/
 * compactionSummary/branchSummary 消息（桌面暂无对应渲染，M4-d 会话树时再看要不要展示）。
 */
export function piEntriesToDesktopMessages(entries: PiTranscriptEntry[]): ChatSessionMessage[] {
  const out: ChatSessionMessage[] = [];
  let assistant: ResponseMessage | null = null;

  const flushAssistant = () => {
    if (!assistant) return;
    if ((assistant.assistant_blocks ?? []).length > 0) {
      syncAssistantDerivedFields(assistant);
      out.push(assistant);
    }
    assistant = null;
  };

  for (const entry of entries) {
    const role = (entry.message as { role?: string }).role;
    if (role === "user") {
      flushAssistant();
      const request = toRequestMessage(entry);
      if (request) out.push(request);
      continue;
    }
    if (role === "assistant") {
      const blocks = toAssistantBlocks(entry.id, entry.message);
      if (!assistant) {
        assistant = {
          clientId: `pi:${entry.id}`,
          piEntryIds: [],
          role: Role.Assistant,
          content: "",
          assistant_blocks: [],
        };
      }
      // 空内容的 assistant（中止/报错的收尾轮）也记 entry id：删除回答时要一起省略
      assistant.piEntryIds!.push(entry.id);
      if (blocks.length === 0) continue;
      assistant.assistant_blocks = [...(assistant.assistant_blocks ?? []), ...blocks];
      accumulateUsage(assistant, entry.message);
      continue;
    }
    if (role === "toolResult" && assistant) {
      assistant.piEntryIds!.push(entry.id);
      applyToolResult(assistant, entry.message);
    }
  }
  flushAssistant();
  return out;
}
