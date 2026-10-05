import type { ChatContextUsage } from "../ChatInputArea/types";

const toValidCount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export const formatTokenCount = (tokens: number): string => {
  const count = toValidCount(tokens);
  if (count < 1000) {
    return count.toLocaleString();
  }
  const value = count / 1000;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}k`;
};

export const getContextUsageSummary = (contextWindowK: number, usage?: ChatContextUsage | null) => {
  const totalTokens = Math.max(0, contextWindowK * 1000);
  const inputTokens = toValidCount(usage?.inputTokens);
  const outputTokens = toValidCount(usage?.outputTokens);
  const cacheReadTokens = Math.min(inputTokens, toValidCount(usage?.cacheReadTokens));
  const cacheWriteTokens = Math.min(inputTokens, toValidCount(usage?.cacheWriteTokens));
  const usedTokens = inputTokens + outputTokens;
  const usedPercent = totalTokens > 0 ? Math.min(100, (usedTokens / totalTokens) * 100) : 0;

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usedTokens,
    usedPercent,
    cacheReadPercent: inputTokens > 0 ? (cacheReadTokens / inputTokens) * 100 : 0,
    cacheWritePercent: inputTokens > 0 ? (cacheWriteTokens / inputTokens) * 100 : 0,
  };
};
