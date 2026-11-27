/**
 * 上下文用量环：16px 细线进度环常驻工具行右侧，点击 Popover 看明细。
 * 环色只表意：< 75% ok、≥ 75% warn、≥ 90% danger；无用量时只有 line-1 轨道。
 */

import { Popover } from "@tau/ui";
import type { ChatCompactionUsage } from "../../chat-core/messages";
import type { ChatContextUsage } from "../ChatInputArea/types";
import { formatTokenCount, getContextUsageSummary } from "./contextUsage";
import { useChatComposerI18n } from "./i18n";

const RING_R = 6.5;
const RING_C = 2 * Math.PI * RING_R;

const formatPercent = (value: number) =>
  value > 0 && value < 0.1 ? "<0.1%" : `${value.toFixed(1)}%`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink-1 tabular-nums">{value}</span>
    </div>
  );
}

export function ContextUsageRing({
  contextWindowK,
  usage,
  compaction,
}: {
  contextWindowK?: number;
  usage?: ChatContextUsage | null;
  compaction?: ChatCompactionUsage;
}) {
  if (typeof contextWindowK !== "number" || !Number.isFinite(contextWindowK) || contextWindowK <= 0)
    return null;

  const summary = getContextUsageSummary(contextWindowK, usage, compaction);
  const hasUsage = Boolean(usage || compaction?.isCurrent);
  const percent = hasUsage ? summary.usedPercent : 0;
  const tone =
    percent >= 90 ? "var(--tau-danger)" : percent >= 75 ? "var(--tau-warn)" : "var(--tau-ok)";
  const { t } = useChatComposerI18n();
  const used = hasUsage
    ? `${compaction?.isCurrent ? t("usage.approxPrefix") : ""}${formatTokenCount(summary.usedTokens)}`
    : "--";
  const capacity =
    contextWindowK >= 1000
      ? `${Number((contextWindowK / 1000).toFixed(2))}M`
      : `${contextWindowK}k`;

  return (
    <Popover
      placement="top-end"
      className="w-[260px]"
      trigger={
        <button
          type="button"
          aria-label={t("usage.aria", { used, capacity })}
          title={t("usage.title", { used, capacity })}
          className="hover:bg-hover aria-expanded:bg-hover grid size-[30px] shrink-0 place-items-center rounded-[9px]"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 -rotate-90">
            <circle
              cx="8"
              cy="8"
              r={RING_R}
              fill="none"
              stroke="var(--tau-line-1)"
              strokeWidth="2.4"
            />
            {percent > 0 && (
              <circle
                cx="8"
                cy="8"
                r={RING_R}
                fill="none"
                stroke={tone}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray={`${(RING_C * Math.min(percent, 100)) / 100} ${RING_C}`}
                className="ease-tau-out transition-[stroke-dasharray] duration-[240ms]"
              />
            )}
          </svg>
        </button>
      }
    >
      <Popover.Header>{t("usage.header")}</Popover.Header>
      <Popover.Body>
        <div className="text-tau-sm space-y-2 pb-1">
          <div className="text-ink-2 flex items-baseline justify-between tabular-nums">
            <span>
              <b className="text-ink-1 font-semibold">{used}</b> / {capacity} tokens
            </span>
            <span>{hasUsage ? formatPercent(summary.usedPercent) : ""}</span>
          </div>
          <div className="bg-sunken h-1.5 overflow-hidden rounded-full">
            <div
              className="ease-tau-out h-full rounded-full transition-[width] duration-[240ms]"
              style={{
                width: `${percent}%`,
                background: tone,
              }}
            />
          </div>
          {compaction && (
            <div className="space-y-1.5 pt-1">
              <Row
                label={t("usage.beforeCompaction")}
                value={`${compaction.tokensBefore.toLocaleString()} tokens`}
              />
              <Row
                label={t("usage.afterCompaction")}
                value={`${compaction.estimatedTokensAfter.toLocaleString()} tokens`}
              />
            </div>
          )}
          {usage && !compaction?.isCurrent ? (
            <div className="space-y-1.5 pt-1">
              <Row label={t("usage.input")} value={summary.inputTokens.toLocaleString()} />
              <Row label={t("usage.output")} value={summary.outputTokens.toLocaleString()} />
              <Row
                label={t("usage.cacheRead")}
                value={`${summary.cacheReadTokens.toLocaleString()} · ${formatPercent(summary.cacheReadPercent)}`}
              />
              <Row
                label={t("usage.cacheWrite")}
                value={`${summary.cacheWriteTokens.toLocaleString()} · ${formatPercent(summary.cacheWritePercent)}`}
              />
              <p className="text-tau-tiny text-ink-3 pt-1">{t("usage.cacheHint")}</p>
            </div>
          ) : (
            !hasUsage && <p className="text-ink-3">{t("usage.emptyHint")}</p>
          )}
        </div>
      </Popover.Body>
    </Popover>
  );
}
