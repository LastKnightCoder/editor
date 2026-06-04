import type { AgentMessage, AgentToolSchema } from "../types";

type BucketKey =
  | "system"
  | "user"
  | "assistant"
  | "toolResults"
  | "otherMessages"
  | "toolSchemas";

interface TokenBudgetBucket {
  chars: number;
  approxTokens: number;
  percent: number;
  count: number;
}

const APPROX_CHARS_PER_TOKEN = 4;

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const estimateTokens = (chars: number) =>
  Math.ceil(chars / APPROX_CHARS_PER_TOKEN);

const getTextLength = (value: unknown): number => {
  if (!value) {
    return 0;
  }

  if (typeof value === "string") {
    return value.length;
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + getTextLength(item), 0);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text.length;
    }
    return safeStringify(value).length;
  }

  return String(value).length;
};

const getMessageBucketKey = (role: AgentMessage["role"]): BucketKey => {
  switch (role) {
    case "system":
      return "system";
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool":
      return "toolResults";
    default:
      return "otherMessages";
  }
};

const buildBucketSummary = (
  rawBuckets: Record<
    BucketKey,
    Omit<TokenBudgetBucket, "approxTokens" | "percent">
  >,
) => {
  const totalChars = Object.values(rawBuckets).reduce(
    (sum, bucket) => sum + bucket.chars,
    0,
  );
  const totalApproxTokens = estimateTokens(totalChars);

  const buckets = Object.fromEntries(
    Object.entries(rawBuckets).map(([key, bucket]) => {
      const approxTokens = estimateTokens(bucket.chars);
      return [
        key,
        {
          ...bucket,
          approxTokens,
          percent:
            totalApproxTokens > 0
              ? Number(((approxTokens / totalApproxTokens) * 100).toFixed(1))
              : 0,
        },
      ];
    }),
  ) as Record<BucketKey, TokenBudgetBucket>;

  return {
    totalChars,
    totalApproxTokens,
    buckets,
  };
};

const summarizeTopTools = (tools: AgentToolSchema[], limit = 12) =>
  tools
    .map((tool) => {
      const chars = safeStringify(tool).length;
      return {
        name: tool.function.name,
        chars,
        approxTokens: estimateTokens(chars),
      };
    })
    .sort((left, right) => right.chars - left.chars)
    .slice(0, limit);

export const logAgentTokenBudget = (params: {
  traceId: string;
  runId: string;
  turnId: string;
  conversationKey?: string;
  loopIndex: number;
  toolModeActive: boolean;
  messages: AgentMessage[];
  tools?: AgentToolSchema[];
}) => {
  const rawBuckets: Record<
    BucketKey,
    Omit<TokenBudgetBucket, "approxTokens" | "percent">
  > = {
    system: { chars: 0, count: 0 },
    user: { chars: 0, count: 0 },
    assistant: { chars: 0, count: 0 },
    toolResults: { chars: 0, count: 0 },
    otherMessages: { chars: 0, count: 0 },
    toolSchemas: { chars: 0, count: 0 },
  };

  for (const message of params.messages) {
    const key = getMessageBucketKey(message.role);
    rawBuckets[key].chars += getTextLength(message.content);
    rawBuckets[key].count += 1;
    if (message.tool_calls?.length) {
      rawBuckets.assistant.chars += safeStringify(message.tool_calls).length;
    }
  }

  const tools = params.tools ?? [];
  rawBuckets.toolSchemas.chars = tools.reduce(
    (sum, tool) => sum + safeStringify(tool).length,
    0,
  );
  rawBuckets.toolSchemas.count = tools.length;

  const summary = buildBucketSummary(rawBuckets);
  console.info(
    `[AgentTokenBudget] ${JSON.stringify({
      traceId: params.traceId,
      runId: params.runId,
      turnId: params.turnId,
      conversationKey: params.conversationKey,
      loopIndex: params.loopIndex,
      toolModeActive: params.toolModeActive,
      messageCount: params.messages.length,
      toolCount: tools.length,
      totalChars: summary.totalChars,
      totalApproxTokens: summary.totalApproxTokens,
      buckets: summary.buckets,
      topTools: summarizeTopTools(tools),
      note: "approxTokens 使用 chars/4 粗估；不打印消息正文。",
    })}`,
  );
};
