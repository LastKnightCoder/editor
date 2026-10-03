/**
 * 「笔记元信息」「AI 洞见」功能槽的说明与进度（KL-055 / KL-063）：配置模型即同意，说明里写清会读取全部笔记、
 * 按当前库估算首轮 token；进度行与嵌入「索引覆盖」同一行式。
 */

import { SettingRow } from "../components/SettingRow";
import { StatusChip } from "../components/StatusChip";
import { useContentAiStatus } from "./useContentAiStatus";

/** 2.3 万 / 1200 万 / 860 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 10_000) return String(Math.round(tokens));
  const wan = tokens / 10_000;
  return `${wan < 100 ? wan.toFixed(1).replace(/\.0$/, "") : Math.round(wan)} 万`;
}

export function ContentMetadataDescription() {
  const { data } = useContentAiStatus();
  const estimate = data
    ? `当前库 ${data.total} 份，首轮约 ${formatTokenCount(data.estimatedTokens)} token。`
    : "";
  return (
    <>
      为卡片生成精简标题，为卡片、文章、项目文档生成要点与关键概念。配上模型即读取全部笔记、在后台处理，之后随编辑增量更新；清空即停止。
      {estimate}
    </>
  );
}

/** 主题洞见首轮：每份笔记的元信息在子主题里读一次，加上主题、全局与输出，按每份约 230 token 估 */
const TOPIC_TOKENS_PER_NOTE = 230;

export function ContentInsightsDescription() {
  const { data } = useContentAiStatus();
  const estimate = data
    ? `首轮约 ${formatTokenCount(data.total * TOPIC_TOKENS_PER_NOTE)} token，之后按变化量少量更新。`
    : "";
  return (
    <>
      在卡片、文章、项目文档里点「AI 洞见」时，对照你的其他笔记分析这一篇（一篇长文约 1 万
      token）。另在后台按知识地图的主题读各篇的要点，找出主题间的呼应、重复、矛盾与还缺的地方，并为项目写回顾。
      {estimate}
      需要先配置「笔记元信息」。
    </>
  );
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
