/**
 * 「笔记元信息」「AI 洞见」功能槽的说明与进度（KL-055 / KL-063）；进度行与嵌入「索引覆盖」同一行式。
 */

import { llmText, llmValue, useLlmSettingsI18n } from "./llm.i18n";
import { SettingRow } from "@tau/ui";
import { StatusChip } from "../components/StatusChip";
import { useContentAiStatus } from "./useContentAiStatus";

export function ContentMetadataDescription() {
  useLlmSettingsI18n();

  return <>{llmText("ui.generateConciseCardTitlesPlusKeyPoints")}</>;
}

export function ContentInsightsDescription() {
  useLlmSettingsI18n();

  return <>{llmText("ui.chooseAIInsightsInACardArticle")}</>;
}

export function ContentMetadataProgressRow() {
  useLlmSettingsI18n();

  const { data } = useContentAiStatus();
  if (!data || (!data.configured && data.processed === 0)) return null;
  const pending = Math.max(0, data.total - data.processed);
  const percent = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 100;
  const suffix = !data.configured
    ? llmText("ui.stoppedNoModelAssigned")
    : data.running
      ? llmText("ui.processing")
      : "";
  return (
    <SettingRow
      title={llmText("ui.metadataProgress")}
      description={llmText("message.processed", {
        processed: llmValue(data.processed),
        total: llmValue(data.total),
        status: llmValue(suffix),
      })}
    >
      {pending === 0 ? (
        <StatusChip tone="ok">{llmText("ui.upToDate")}</StatusChip>
      ) : (
        <StatusChip tone="warn">
          {llmText("metadata.pending", { count: llmValue(pending) })}
        </StatusChip>
      )}
      <span className="text-tau-meta text-ink-1 w-12 text-right font-semibold tabular-nums">
        {percent}%
      </span>
    </SettingRow>
  );
}
