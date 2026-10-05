/** 目录顶部一行「由问题「X」立项」（谱系 upgraded_to）；不是由问题立项、或问题已删除时不渲染 */

import { CircleHelp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getNotebookSourceQuestion } from "@/commands/question";
import { openPage } from "@/services/page-navigation";

export function SourceQuestionRow({ projectId }: { projectId: number }) {
  const { data: source } = useQuery({
    queryKey: ["vibe-learning", "source-question", projectId],
    queryFn: () => getNotebookSourceQuestion(projectId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  if (!source) return null;
  return (
    <button
      type="button"
      title="打开来源问题"
      onClick={() => void openPage("questions", { selectedId: source.id })}
      className="text-ink-2 hover:text-ink-1 hover:bg-hover mb-2 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
    >
      <CircleHelp className="size-[13px] shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">由问题「{source.title}」立项</span>
    </button>
  );
}
