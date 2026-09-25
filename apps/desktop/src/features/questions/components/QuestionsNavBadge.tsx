/**
 * 侧栏「问题」入口的探究中计数；侧栏收起时不显示（计数不是需要即时提醒的状态）。
 * 与问题页共用列表快照查询，变更时同源失效。
 */

import { useQuestionsSnapshot } from "../queries";

export function QuestionsNavBadge({ collapsed }: { collapsed: boolean }) {
  const { snapshot } = useQuestionsSnapshot();
  const count = snapshot?.questions.filter(q => q.status === "in_progress").length ?? 0;
  if (collapsed || count === 0) return null;
  return <span className="text-ink-3 ml-auto shrink-0 text-[11px] tabular-nums">{count}</span>;
}
