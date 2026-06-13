import type {
  AgentModelProtocolAdapter,
  AgentModelRawChunkParser,
  AgentPreparedModelTurn,
  AgentModelTurnRequest,
  AgentToolSchema,
} from "@tau/agent";

import { createResponsesStreamParser } from "@/commands";
import { Role } from "@/constants";
import { sanitizeToolMessages } from "@/services/assistantMessageBlocks";
import { normalizeRequestMessages } from "@/services/chatMessageNormalization";
import type {
  ImageContent,
  ModelConfig,
  ProviderConfig,
  ReasoningEffort,
  RequestMessage,
} from "@/types";
import { buildResponsesPayload } from "@/utils/openai-responses-adapter";
import { getModelRequestOverrides } from "@/utils/model-overrides";
import { createThinkTagNormalizer } from "@/utils/thinkTagNormalizer";

type ClaudeCacheControl = { type: "ephemeral" };

type ClaudeContentBlock = (
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | ClaudeToolResultContentBlock[];
    }
) & { cache_control?: ClaudeCacheControl };

type ClaudeToolResultContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

const CLAUDE_CACHE_DEBUG_PREFIX = "[ClaudeCacheDebug]";
const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 8192;

const normalizeMaxOutputTokens = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS;
};

const logClaudeCacheDebug = (event: string, payload: unknown) => {
  console.info(
    `${CLAUDE_CACHE_DEBUG_PREFIX} ${event} ${JSON.stringify(payload)}`,
  );
};

const getClaudeContentBlockCount = (content: ClaudeMessage["content"]) =>
  Array.isArray(content) ? content.length : 1;

const getClaudeCacheControlBlockCount = (content: unknown): number => {
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.filter((block) => Boolean(block?.cache_control)).length;
};

const summarizeClaudeMessagesForCacheDebug = (messages: ClaudeMessage[]) => {
  const roleCounts = messages.reduce(
    (counts, message) => {
      counts[message.role] += 1;
      return counts;
    },
    { user: 0, assistant: 0 } as Record<ClaudeMessage["role"], number>,
  );
  const contentBlockCounts = messages.map((message) =>
    getClaudeContentBlockCount(message.content),
  );

  return {
    messageCount: messages.length,
    roleCounts,
    contentBlockCount: contentBlockCounts.reduce(
      (total, count) => total + count,
      0,
    ),
    maxContentBlocksInMessage: Math.max(0, ...contentBlockCounts),
    messageCacheControlBlockCount: messages.reduce(
      (total, message) =>
        total + getClaudeCacheControlBlockCount(message.content),
      0,
    ),
  };
};

const toClaudeContentBlocks = (
  content: ClaudeMessage["content"],
): ClaudeContentBlock[] =>
  typeof content === "string" ? [{ type: "text", text: content }] : content;

const addCacheControlToLastContentBlock = (
  message: ClaudeMessage,
): ClaudeMessage => {
  const blocks = toClaudeContentBlocks(message.content);
  if (blocks.length === 0) {
    return message;
  }

  return {
    ...message,
    content: blocks.map((block, index) =>
      index === blocks.length - 1
        ? { ...block, cache_control: { type: "ephemeral" } }
        : block,
    ),
  };
};

const findLastAssistantHistoryBreakpointIndex = (messages: ClaudeMessage[]) =>
  messages
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message, index }) => {
      if (message.role !== "assistant") {
        return false;
      }
      return messages[index + 1]?.role === "user";
    })?.index;

const findLastToolResultBreakpointIndex = (messages: ClaudeMessage[]) =>
  messages
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => {
      if (message.role !== "user" || !Array.isArray(message.content)) {
        return false;
      }
      return message.content.some((block) => block.type === "tool_result");
    })?.index;

const addMessageHistoryCacheBreakpoints = (
  messages: ClaudeMessage[],
): ClaudeMessage[] => {
  const breakpointIndexes = new Set(
    [
      findLastAssistantHistoryBreakpointIndex(messages),
      findLastToolResultBreakpointIndex(messages),
    ].filter((index): index is number => index !== undefined),
  );

  if (breakpointIndexes.size === 0) {
    return messages;
  }

  return messages.map((message, index) =>
    breakpointIndexes.has(index)
      ? addCacheControlToLastContentBlock(message)
      : message,
  );
};

const extractTextFromMessage = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }
  return (
    message.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n") ?? ""
  );
};

const parseImageDataUrl = (value: string) => {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  return match
    ? {
        mediaType: match[1],
        base64: match[2],
      }
    : null;
};

const getImageContent = (message: RequestMessage): string[] =>
  Array.isArray(message.content)
    ? message.content
        .filter(
          (item): item is ImageContent => item.type === "image" && !!item.image,
        )
        .map((item) => item.image)
    : [];

const mapMessageContentToOpenAIContentParts = (
  content: RequestMessage["content"],
) => {
  if (typeof content === "string") {
    return content;
  }

  return content
    ?.map((item) => {
      if (item.type === "text") {
        return {
          type: "text",
          text: item.text,
        };
      }
      if (item.type === "image") {
        return {
          type: "image_url",
          image_url: {
            url: item.image,
          },
        };
      }
      if (item.type === "file") {
        if (!item.file?.startsWith("data:application/pdf")) {
          return null;
        }
        return {
          type: "file",
          file: {
            filename: item.fileName || "file",
            file_data: item.file,
          },
        };
      }
      return null;
    })
    .filter((item): item is Exclude<typeof item, null> => Boolean(item));
};

const mergeSystemMessages = (messages: RequestMessage[]): RequestMessage[] => {
  const systemMessages = messages.filter(
    (message) => message.role === Role.System,
  );
  if (systemMessages.length <= 1) {
    return messages;
  }

  const mergedSystemContent = systemMessages
    .map((message) => extractTextFromMessage(message).trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");

  const firstSystemIndex = messages.findIndex(
    (message) => message.role === Role.System,
  );

  return messages.flatMap((message, index) => {
    if (message.role !== Role.System) {
      return [message];
    }

    if (index !== firstSystemIndex) {
      return [];
    }

    return [
      {
        role: Role.System,
        content: mergedSystemContent,
      },
    ];
  });
};

const mapToolMessagesOpenAI = (message: RequestMessage) => ({
  role: "tool",
  content: extractTextFromMessage(message),
  tool_call_id: message.tool_call_id,
});

const buildSyntheticToolImageUserMessageOpenAI = (
  toolMessages: RequestMessage[],
) => {
  const images = toolMessages.flatMap(getImageContent);
  if (images.length === 0) {
    return null;
  }

  return {
    role: "user",
    content: [
      {
        type: "text",
        text: "以下图片来自刚刚的工具 read_image 返回结果，请直接基于这些图片内容继续分析。",
      },
      ...images.map((image) => ({
        type: "image_url",
        image_url: {
          url: image,
        },
      })),
    ],
  };
};

const mapToolResultContentClaude = (
  message: RequestMessage,
): string | ClaudeToolResultContentBlock[] => {
  if (!Array.isArray(message.content)) {
    return message.content;
  }

  const blocks = message.content
    .map((item): ClaudeToolResultContentBlock | null => {
      if (item.type === "text") {
        return { type: "text", text: item.text };
      }
      if (item.type === "image") {
        const parsed = parseImageDataUrl(item.image);
        if (!parsed) {
          return null;
        }
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: parsed.mediaType,
            data: parsed.base64,
          },
        };
      }
      return null;
    })
    .filter((item): item is ClaudeToolResultContentBlock => Boolean(item));

  if (blocks.length === 0) {
    return "";
  }

  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }

  return blocks;
};

const mapAssistantToolCallsOpenAI = (message: RequestMessage) => ({
  role: message.role,
  content: typeof message.content === "string" ? message.content : "",
  tool_calls: message.tool_calls,
  ...(typeof message.reasoning_content === "string"
    ? { reasoning_content: message.reasoning_content }
    : {}),
});

export const mapToStreamPayload = (messages: RequestMessage[]) => {
  const result: any[] = [];
  let index = 0;

  while (index < messages.length) {
    const message = messages[index];

    if (message.role === Role.Tool) {
      const toolMessages: RequestMessage[] = [];
      while (index < messages.length && messages[index].role === Role.Tool) {
        toolMessages.push(messages[index]);
        result.push(mapToolMessagesOpenAI(messages[index]));
        index += 1;
      }
      const syntheticImageMessage =
        buildSyntheticToolImageUserMessageOpenAI(toolMessages);
      if (syntheticImageMessage) {
        result.push(syntheticImageMessage);
      }
      continue;
    }

    if (message.role === Role.Assistant && message.tool_calls?.length) {
      result.push(mapAssistantToolCallsOpenAI(message));
      index += 1;
      continue;
    }

    if (
      message.role === Role.Assistant &&
      typeof message.reasoning_content === "string"
    ) {
      result.push({
        role: message.role,
        content:
          typeof message.content === "string"
            ? message.content
            : (message.content
                ?.filter((item) => item.type === "text")
                .map((item) => item.text)
                .join("\n") ?? ""),
        reasoning_content: message.reasoning_content,
      });
      index += 1;
      continue;
    }

    if (typeof message.content === "string") {
      result.push({
        role: message.role,
        content: message.content,
      });
      index += 1;
      continue;
    }

    if (message.content?.length === 1 && message.content[0].type === "text") {
      result.push({
        role: message.role,
        content: message.content[0].text,
      });
      index += 1;
      continue;
    }

    result.push({
      role: message.role,
      content: mapMessageContentToOpenAIContentParts(message.content),
    });
    index += 1;
  }

  return result.filter(Boolean);
};

export const buildClaudeMessages = (messages: RequestMessage[]) => {
  const systemParts: string[] = [];
  const claudeMessages: ClaudeMessage[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (message.role === Role.System) {
      systemParts.push(extractTextFromMessage(message));
      continue;
    }

    if (message.role === Role.Tool) {
      const toolResults: ClaudeContentBlock[] = [];
      while (index < messages.length && messages[index].role === Role.Tool) {
        const toolMessage = messages[index];
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolMessage.tool_call_id!,
          content: mapToolResultContentClaude(toolMessage),
        });
        index += 1;
      }
      index -= 1;
      claudeMessages.push({ role: "user", content: toolResults });
      continue;
    }

    if (message.role === Role.Assistant && message.tool_calls?.length) {
      const blocks: ClaudeContentBlock[] = [];
      const textContent = extractTextFromMessage(message);
      if (textContent) {
        blocks.push({ type: "text", text: textContent });
      }
      for (const call of message.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          // 忽略非法参数，交给模型自行修复
        }
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input,
        });
      }
      claudeMessages.push({ role: "assistant", content: blocks });
      continue;
    }

    const role: "user" | "assistant" =
      message.role === Role.Assistant ? "assistant" : "user";

    if (typeof message.content === "string") {
      claudeMessages.push({ role, content: message.content });
      continue;
    }

    if (Array.isArray(message.content)) {
      const blocks: ClaudeContentBlock[] = [];
      for (const item of message.content) {
        if (item.type === "text") {
          blocks.push({ type: "text", text: item.text });
        } else if (item.type === "image") {
          const parsed = parseImageDataUrl(item.image);
          if (parsed) {
            blocks.push({
              type: "image",
              source: {
                type: "base64",
                media_type: parsed.mediaType,
                data: parsed.base64,
              },
            });
          }
        }
      }

      if (blocks.length === 1 && blocks[0].type === "text") {
        claudeMessages.push({ role, content: blocks[0].text });
      } else {
        claudeMessages.push({ role, content: blocks });
      }
      continue;
    }

    claudeMessages.push({ role, content: "" });
  }

  const merged: ClaudeMessage[] = [];
  for (const message of claudeMessages) {
    if (merged.length > 0 && merged[merged.length - 1].role === message.role) {
      const previous = merged[merged.length - 1];
      const toBlocks = (
        content: string | ClaudeContentBlock[],
      ): ClaudeContentBlock[] =>
        typeof content === "string"
          ? [{ type: "text", text: content }]
          : content;
      merged[merged.length - 1] = {
        role: message.role,
        content: [...toBlocks(previous.content), ...toBlocks(message.content)],
      };
    } else {
      merged.push(message);
    }
  }

  if (merged.length > 0 && merged[0].role !== "user") {
    merged.unshift({ role: "user", content: "." });
  }

  return {
    system: systemParts.join("\n\n") || undefined,
    messages: addMessageHistoryCacheBreakpoints(merged),
  };
};

const convertToolsToClaudeFormat = (tools: AgentToolSchema[]) =>
  tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));

const createClaudeSSEParser = (): AgentModelRawChunkParser => ({
  parse: (text: string) => {
    const json = JSON.parse(text);
    const type = json.type as string;

    if (type === "message_start" && json.message?.usage) {
      logClaudeCacheDebug("usage", {
        eventType: type,
        usage: json.message.usage,
      });
    }

    if (type === "content_block_start") {
      const block = json.content_block;
      if (block?.type === "tool_use") {
        return {
          delta: {
            tool_calls: [
              {
                index: json.index as number,
                id: block.id as string,
                type: "function",
                function: { name: block.name as string, arguments: "" },
              },
            ],
          },
        };
      }
      return undefined;
    }

    if (type === "content_block_delta") {
      const delta = json.delta;
      if (delta?.type === "text_delta") {
        return { delta: { content: delta.text as string } };
      }
      if (delta?.type === "thinking_delta") {
        return { delta: { reasoning_content: delta.thinking as string } };
      }
      if (delta?.type === "input_json_delta") {
        return {
          delta: {
            tool_calls: [
              {
                index: json.index as number,
                function: { arguments: delta.partial_json as string },
              },
            ],
          },
        };
      }
      return undefined;
    }

    if (type === "message_delta") {
      if (json.usage) {
        logClaudeCacheDebug("usage", {
          eventType: type,
          usage: json.usage,
        });
      }
      const stopReason = json.delta?.stop_reason as string | null;
      if (stopReason === "tool_use") {
        return { finish_reason: "tool_calls" as const };
      }
      if (stopReason === "end_turn" || stopReason === "stop_sequence") {
        return { finish_reason: "stop" as const };
      }
      if (stopReason === "max_tokens") {
        return { finish_reason: "length" as const };
      }
      return undefined;
    }

    if (type === "error") {
      throw new Error(json.error?.message || "Unknown Claude API error");
    }

    return undefined;
  },
});

const normalizeContentText = (content: any): string => {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item?.type === "text") {
        if (typeof item.text === "string") {
          return item.text;
        }
        if (typeof item.text?.value === "string") {
          return item.text.value;
        }
      }
      if (item?.type === "output_text" && typeof item.text === "string") {
        return item.text;
      }
      return "";
    })
    .join("");
};

export class DesktopModelProtocolAdapter implements AgentModelProtocolAdapter {
  constructor(
    private readonly providerConfig: ProviderConfig,
    private readonly modelConfig: ModelConfig,
  ) {}

  async prepareTurn(
    request: AgentModelTurnRequest,
  ): Promise<AgentPreparedModelTurn> {
    const { apiKey, baseUrl } = this.providerConfig;
    const { name: modelName } = this.modelConfig;
    const isClaudeFormat = this.modelConfig.messageFormat === "claude";
    const isResponsesApi =
      !isClaudeFormat && this.modelConfig.apiProtocol === "responses";
    const baseUrlNormalized = baseUrl.replace(/\/+$/, "");

    const endpoint = isClaudeFormat
      ? baseUrlNormalized.endsWith("/v1")
        ? `${baseUrlNormalized}/messages`
        : `${baseUrlNormalized}/v1/messages`
      : isResponsesApi
        ? `${baseUrlNormalized}/responses`
        : `${baseUrlNormalized}/chat/completions`;

    const headers: Record<string, string> = isClaudeFormat
      ? {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        }
      : {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(modelName === "kimi-for-coding"
            ? { "User-Agent": "kimi-code-cli/0.14.2" }
            : {}),
        };

    const normalizedMessages = await normalizeRequestMessages(
      request.messages as RequestMessage[],
    );
    const sanitizedMessages = sanitizeToolMessages(normalizedMessages);
    const transportMessages = mergeSystemMessages(sanitizedMessages);
    const normalizedReasoningEffort =
      request.reasoningEffort && request.reasoningEffort !== "none"
        ? (request.reasoningEffort as ReasoningEffort)
        : undefined;
    const modelOverrides = getModelRequestOverrides({
      modelName,
      reasoningEffort: normalizedReasoningEffort,
    });
    const { reasoning_effort: overrideReasoningEffort, ...restOverrides } =
      modelOverrides;
    const basePayload = {
      stream: true,
      model: modelName,
      temperature: 0.3,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
      reasoning_effort:
        overrideReasoningEffort !== undefined
          ? undefined
          : normalizedReasoningEffort,
      ...restOverrides,
    };

    let payload: unknown;
    let parser: AgentModelRawChunkParser;

    if (isClaudeFormat) {
      const { system, messages } = buildClaudeMessages(transportMessages);
      payload = {
        model: modelName,
        max_tokens: normalizeMaxOutputTokens(this.modelConfig.maxOutputTokens),
        stream: true,
        ...(system
          ? {
              system: [
                {
                  type: "text",
                  text: system,
                  cache_control: { type: "ephemeral" },
                },
              ],
            }
          : {}),
        messages,
        ...(request.tools?.length
          ? { tools: convertToolsToClaudeFormat(request.tools) }
          : {}),
      };
      logClaudeCacheDebug("request_summary", {
        model: modelName,
        system: system
          ? {
              textLength: system.length,
              cacheControlBlockCount: 1,
            }
          : {
              textLength: 0,
              cacheControlBlockCount: 0,
            },
        messages: summarizeClaudeMessagesForCacheDebug(messages),
        tools: {
          count: request.tools?.length ?? 0,
          cacheControlBlockCount: 0,
        },
      });
      parser = createClaudeSSEParser();
    } else if (isResponsesApi) {
      payload = buildResponsesPayload({
        model: modelName,
        messages: transportMessages,
        stream: true,
        reasoningEffort: normalizedReasoningEffort,
        tools: request.tools,
      });
      parser = createResponsesStreamParser();
    } else {
      const thinkTagNormalizer = createThinkTagNormalizer();
      payload = {
        ...basePayload,
        messages: mapToStreamPayload(transportMessages),
        ...(request.tools?.length ? { tools: request.tools } : {}),
      };
      parser = {
        parse: (text: string) => {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          if (!choice) {
            return undefined;
          }
          const delta = choice.delta || {};
          const normalizedContent = normalizeContentText(delta.content);
          const normalizedReasoning = normalizeContentText(
            delta.reasoning_content,
          );
          const extracted = thinkTagNormalizer.push(normalizedContent);

          return {
            delta: {
              ...delta,
              content: extracted.content,
              reasoning_content: `${normalizedReasoning}${extracted.reasoning_content}`,
            },
            finish_reason: choice.finish_reason,
          };
        },
        flush: () => {
          const flushed = thinkTagNormalizer.flush();
          if (!flushed.content && !flushed.reasoning_content) {
            return undefined;
          }
          return {
            delta: {
              content: flushed.content,
              reasoning_content: flushed.reasoning_content,
            },
            finish_reason: null,
          };
        },
      };
    }

    return {
      request,
      endpoint,
      payload,
      headers,
      parser,
    };
  }
}
