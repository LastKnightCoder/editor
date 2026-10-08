/**
 * 正文底部的文档待办状态条：这篇有勾选项时出现，说明已收集到待办、可「本文不收集」。
 * 排除后显示「已排除 · 恢复收集」。没有勾选项、只读或无正文身份时不渲染。
 */

import { ListChecks } from "lucide-react";
import { openPage } from "@/services/page-navigation";
import { useDocTaskContentStatus, useSetDocTasksExcluded } from "@/hooks/useDocTasks";

export function DocTasksStatusBar({ contentId }: { contentId: number | undefined }) {
  const { data: status } = useDocTaskContentStatus(contentId);
  const setExcluded = useSetDocTasksExcluded();
  if (!contentId || !status || (!status.excluded && status.openCount === 0)) return null;

  const link = "text-accent-text hover:underline font-medium";
  return (
    <div className="bg-page text-ink-2 text-tau-meta mt-4 flex items-center gap-2 rounded-[10px] px-3.5 py-2">
      <ListChecks className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
      {status.excluded ? (
        <>
          <span className="min-w-0 flex-1 truncate">本文已排除，勾选项不出现在待办中</span>
          <button type="button" className={link} onClick={() => void setExcluded(contentId, false)}>
            恢复收集
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            本文 <b className="text-ink-1 font-semibold tabular-nums">{status.openCount}</b>{" "}
            项未完成，已收集到待办
          </span>
          <button type="button" className={link} onClick={() => openPage("todos", { id: "docs" })}>
            在待办中查看
          </button>
          <span className="text-ink-3">·</span>
          <button
            type="button"
            className="text-ink-3 hover:text-ink-1"
            onClick={() => void setExcluded(contentId, true)}
          >
            本文不收集
          </button>
        </>
      )}
    </div>
  );
}
