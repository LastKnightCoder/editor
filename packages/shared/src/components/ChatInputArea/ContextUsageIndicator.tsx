import { Popover } from "@tau/ui";
import { Gauge } from "lucide-react";
import classNames from "classnames";
import type { ChatContextUsage } from "./types";

interface ContextUsageIndicatorProps {
  contextWindowK?: number;
  usage?: ChatContextUsage | null;
}

const toValidCount = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;

export const formatTokenCount = (tokens: number): string => {
  const count = toValidCount(tokens);
  if (count < 1000) {
    return count.toLocaleString();
  }
  const value = count / 1000;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)}k`;
};

export const getContextUsageSummary = (
  contextWindowK: number,
  usage?: ChatContextUsage | null,
) => {
  const totalTokens = Math.max(0, contextWindowK * 1000);
  const inputTokens = toValidCount(usage?.inputTokens);
  const outputTokens = toValidCount(usage?.outputTokens);
  const cacheReadTokens = Math.min(
    inputTokens,
    toValidCount(usage?.cacheReadTokens),
  );
  const cacheWriteTokens = Math.min(
    inputTokens,
    toValidCount(usage?.cacheWriteTokens),
  );
  const usedTokens = inputTokens + outputTokens;
  const usedPercent =
    totalTokens > 0 ? Math.min(100, (usedTokens / totalTokens) * 100) : 0;

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    usedTokens,
    usedPercent,
    cacheReadPercent:
      inputTokens > 0 ? (cacheReadTokens / inputTokens) * 100 : 0,
    cacheWritePercent:
      inputTokens > 0 ? (cacheWriteTokens / inputTokens) * 100 : 0,
  };
};

const formatPercent = (value: number) =>
  value > 0 && value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`;

export const ContextUsageIndicator = ({
  contextWindowK,
  usage,
}: ContextUsageIndicatorProps) => {
  if (
    typeof contextWindowK !== "number" ||
    !Number.isFinite(contextWindowK) ||
    contextWindowK <= 0
  ) {
    return null;
  }

  const summary = getContextUsageSummary(contextWindowK, usage);
  const hasUsage = Boolean(usage);
  const progressTone =
    summary.usedPercent >= 90
      ? "bg-red-500"
      : summary.usedPercent >= 75
        ? "bg-amber-500"
        : "bg-emerald-500";

  const content = (
    <div className="w-[260px] text-xs text-gray-700 dark:text-gray-200">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-gray-900 dark:text-gray-100">
          上下文用量
        </span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">
          {hasUsage ? formatTokenCount(summary.usedTokens) : "--"} /{" "}
          {contextWindowK}k
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className={classNames(
            "h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none",
            progressTone,
          )}
          style={{ width: `${hasUsage ? summary.usedPercent : 0}%` }}
        />
      </div>
      {hasUsage ? (
        <div className="mt-3 space-y-2 tabular-nums">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">输入</span>
            <span>{summary.inputTokens.toLocaleString()} tokens</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">输出</span>
            <span>{summary.outputTokens.toLocaleString()} tokens</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">缓存读取</span>
            <span>
              {summary.cacheReadTokens.toLocaleString()} ·{" "}
              {formatPercent(summary.cacheReadPercent)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">缓存写入</span>
            <span>
              {summary.cacheWriteTokens.toLocaleString()} ·{" "}
              {formatPercent(summary.cacheWritePercent)}
            </span>
          </div>
          <div className="border-t border-gray-100 pt-2 text-[11px] text-gray-500 dark:border-white/10 dark:text-gray-400">
            缓存读写已包含在输入 token 中
          </div>
        </div>
      ) : (
        <div className="mt-3 text-gray-500 dark:text-gray-400">
          完成一次模型响应后显示实际用量
        </div>
      )}
    </div>
  );

  return (
    <Popover placement="top-start" trigger={
      <button
        type="button"
        aria-label="查看上下文用量"
        className="flex cursor-pointer items-center gap-1.5 rounded-md p-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
      >
        <Gauge className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          {hasUsage ? formatTokenCount(summary.usedTokens) : "--"} /{" "}
          {contextWindowK}k
        </span>
      </button>
    }>
      <div className="p-1">{content}</div>
    </Popover>
  );
};

export default ContextUsageIndicator;
