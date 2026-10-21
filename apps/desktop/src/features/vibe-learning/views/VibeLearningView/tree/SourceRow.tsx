/** 目录顶部一行「由「X」立项」（谱系 upgraded_to，来源可以是问题、卡片、插件内容等）；没有或已删除时不渲染 */

import { Sprout } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@tau/ui";
import { getVibeLearningProjectSource } from "@/commands/vibe-learning-project";
import { openContextTarget } from "@/features/context/open";

export function SourceRow({ projectId }: { projectId: number }) {
  const { data: source } = useQuery({
    queryKey: ["vibe-learning", "source", projectId],
    queryFn: () => getVibeLearningProjectSource(projectId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  if (!source) return null;
  const open = source.open;
  const label = (
    <>
      <Sprout className="size-[13px] shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">由「{source.title}」立项</span>
      <span className="text-ink-3 shrink-0">{source.meta}</span>
    </>
  );
  const className =
    "text-ink-2 mb-2 flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px]";
  if (!open) return <div className={className}>{label}</div>;
  return (
    <button
      type="button"
      title="打开来源"
      onClick={() => void openContextTarget(open)}
      className={cn(
        className,
        "hover:text-ink-1 hover:bg-hover outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      )}
    >
      {label}
    </button>
  );
}
