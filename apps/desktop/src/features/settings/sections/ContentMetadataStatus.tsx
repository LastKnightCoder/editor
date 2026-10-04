/**
 * 「笔记元信息」「AI 洞见」功能槽的说明与进度（KL-055 / KL-063）；进度行与嵌入「索引覆盖」同一行式。
 */

import { SettingRow } from "../components/SettingRow";
import { StatusChip } from "../components/StatusChip";
import { useContentAiStatus } from "./useContentAiStatus";

export function ContentMetadataDescription() {
  return <>为卡片生成精简标题，为卡片、文章、项目文档生成要点与关键概念。</>;
}

export function ContentInsightsDescription() {
  return <>在卡片、文章、项目文档里点「AI 洞见」时，对照你的其他笔记分析这一篇。</>;
}

export function ContentMetadataProgressRow() {
  const { data } = useContentAiStatus();
  if (!data || (!data.configured && data.processed === 0)) return null;
  const pending = Math.max(0, data.total - data.processed);
  const percent = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 100;
  const suffix = !data.configured ? " · 未配置模型，已停止" : data.running ? " · 处理中" : "";
  return (
    <SettingRow
      title="元信息进度"
      description={`已处理 ${data.processed} / ${data.total}${suffix}`}
    >
      {pending === 0 ? (
        <StatusChip tone="ok">已是最新</StatusChip>
      ) : (
        <StatusChip tone="warn">{pending} 份待处理</StatusChip>
      )}
      <span className="text-tau-meta text-ink-1 w-12 text-right font-semibold tabular-nums">
        {percent}%
      </span>
    </SettingRow>
  );
}
