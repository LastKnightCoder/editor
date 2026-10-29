/** pi 消息投影为跨端共用的聊天消息，模型原始载荷仍由会话文件保留。 */
import { Role, syncAssistantDerivedFields } from "@tau/shared/chat-core";
import type {
  AssistantBlock,
  AssistantToolCallBlock,
  ChatSessionMessage,
  MessageContent,
  RequestMessage,
  ResponseMessage,
  ToolCallExecutionState,
} from "@tau/shared/chat-core";
import type { PiTranscriptEntry, PiTranscriptMessage } from "./types";

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
    const images = contentBlocksOf(entry.message.content).filter(block => block.type === "image");
    let imageIndex = 0;
    const content = entry.display.content.map(item => {
      if (item.type !== "image") return item;
      const image = images[imageIndex++];
      return image?.data
        ? { ...item, image: `data:${image.mimeType || "image/png"};base64,${image.data}` }
        : item;
    });
    return {
      clientId: entry.display.clientId ?? `pi:${entryId}`,
      piEntryIds,
      role: Role.User,
      content,
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
  // 与运行时归约（piChatEvents tool_execution_end）同一口径：details 平铺进 metadata
  const details =
    result.details && typeof result.details === "object" && !Array.isArray(result.details)
      ? (result.details as Record<string, unknown>)
      : undefined;
  const output =
    typeof details?.displayContent === "string" ? details.displayContent : textOf(result.content);
  const execution: ToolCallExecutionState = {
    toolCallId,
    toolName: result.toolName ?? block.toolCall.function.name,
    status: result.isError ? (details?.cancelled ? "cancelled" : "failed") : "success",
    input: block.toolCall.function.arguments ?? "",
    timestamp: result.timestamp ?? 0,
    ...(output ? { output } : {}),
    ...(details ? { metadata: details } : {}),
    ...(result.isError && !output ? { error: "工具执行失败" } : {}),
  };
  block.execution = execution;
};

const updateUsage = (message: ResponseMessage, source: PiTranscriptMessage): void => {
  const usage = source.usage;
  if (!usage) return;
  const provider = source.provider;
  const model = source.model;
  // 上下文占用取最后一次模型调用，pi 的缓存 token 独立计数，需并入输入。
  message.usage = {
    inputTokens: (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
    outputTokens: usage.output ?? 0,
    cacheReadTokens: usage.cacheRead ?? 0,
    cacheWriteTokens: usage.cacheWrite ?? 0,
    ...(provider ? { providerId: provider } : {}),
    ...(model ? { modelId: model } : {}),
  };
};

/**
 * 叶子路径上的 message entry → 桌面展示消息序列。
 * 跳过 system（桌面的 system 由会话装配承载）与 pi 自有的 custom/bashExecution/
 * compactionSummary/branchSummary 消息（桌面暂无对应渲染，M4-d 会话树时再看要不要展示）。
 */
export function projectTranscriptMessages(entries: PiTranscriptEntry[]): ChatSessionMessage[] {
  const out: ChatSessionMessage[] = [];
  let assistant: ResponseMessage | null = null;

  const flushAssistant = () => {
    if (!assistant) return;
    for (const block of assistant.assistant_blocks ?? []) {
      if (block.type !== "tool_call" || block.execution) continue;
      block.execution = {
        toolCallId: block.toolCall.id,
        toolName: block.toolCall.function.name,
        input: block.toolCall.function.arguments ?? "",
        status: "failed",
        timestamp: 0,
        error: "没有工具执行回执，结果未知，不能自动重放。",
        metadata: { outcomeUnknown: true },
      };
    }
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
      assistant.piEntryIds?.push(entry.id);
      if (blocks.length === 0) continue;
      assistant.assistant_blocks = [...(assistant.assistant_blocks ?? []), ...blocks];
      updateUsage(assistant, entry.message);
      continue;
    }
    if (role === "toolResult" && assistant) {
      assistant.piEntryIds?.push(entry.id);
      applyToolResult(assistant, entry.message);
    }
  }
  flushAssistant();
  return out;
}
