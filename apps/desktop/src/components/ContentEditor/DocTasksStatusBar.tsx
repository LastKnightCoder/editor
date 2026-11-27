/**
 * 正文底部的文档待办状态条：这篇有勾选项时出现，说明已收集到待办、可「本文不收集」。
 * 排除后显示「已排除 · 恢复收集」。没有勾选项、只读或无正文身份时不渲染。
 */

import { ListChecks } from "lucide-react";
import { openPage } from "@/services/page-navigation";
import { useDocTaskContentStatus, useSetDocTasksExcluded } from "@/hooks/useDocTasks";
import { useDocTasksI18n } from "./docTasks.i18n";

export function DocTasksStatusBar({ contentId }: { contentId: number | undefined }) {
  const { t } = useDocTasksI18n();
  const { data: status } = useDocTaskContentStatus(contentId);
  const setExcluded = useSetDocTasksExcluded();
  if (!contentId || !status?.collectable || (!status.excluded && status.openCount === 0))
    return null;

  const link = "text-accent-text hover:underline font-medium";
  return (
    <div className="bg-page text-ink-2 text-tau-meta mt-4 flex items-center gap-2 rounded-[10px] px-3.5 py-2">
      <ListChecks className="text-ink-3 size-[14px] shrink-0" strokeWidth={1.75} />
      {status.excluded ? (
        <>
          <span className="min-w-0 flex-1 truncate">{t("excluded")}</span>
          <button type="button" className={link} onClick={() => void setExcluded(contentId, false)}>
            {t("resume")}
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            {t("collected", { count: status.openCount })}
          </span>
          <button type="button" className={link} onClick={() => openPage("todos", { id: "docs" })}>
            {t("view")}
          </button>
          <span className="text-ink-3">·</span>
          <button
            type="button"
            className="text-ink-3 hover:text-ink-1"
            onClick={() => void setExcluded(contentId, true)}
          >
            {t("optOut")}
          </button>
        </>
      )}
    </div>
  );
}
