/**
 * 回顾长进文档树：「可能属于这里」的笔记以虚线行出现在那一支下面，「还薄」是那一支下面一行淡注。
 * 文档树的每个条目在自己的子节点之后放一个 ProjectReviewSlot；没有回顾（或回顾收起）时什么都不渲染。
 */

import { createContext, useContext, type ReactNode } from "react";
import { Plus, Sparkle } from "lucide-react";
import { cn } from "@tau/ui";
import type { KnowledgeMark } from "@/types/knowledge-insights";

export interface ProjectReviewTree {
  /** 项目名右边的「✦ 回顾」按钮；「AI 洞见」槽没配时为 null */
  button: ReactNode;
  /** 落在这一支（项目条目 id）下面的、还没处理的标记 */
  marksUnder(itemId: number): KnowledgeMark[];
  current: string | null;
  onPick(mark: KnowledgeMark, element: HTMLElement): void;
}

export const ProjectReviewContext = createContext<ProjectReviewTree | null>(null);

export function ProjectReviewSlot({ itemId }: { itemId: number }): ReactNode {
  const tree = useContext(ProjectReviewContext);
  const marks = tree?.marksUnder(itemId) ?? [];
  if (!tree || !marks.length) return null;
  return (
    <div className="flex flex-col gap-[4px] pl-[16px]" data-review-slot={itemId}>
      {marks.map((mark, index) =>
        mark.kind === "belong" ? (
          <button
            key={mark.id}
            type="button"
            data-review-mark={mark.id}
            onClick={event => tree.onPick(mark, event.currentTarget)}
            className={cn(
              "border-accent/55 text-ink-2 hover:bg-accent-soft hover:text-ink-1 rounded-tau-sm animate-fadeIn flex h-7 min-w-0 items-center gap-1.5 border border-dashed px-2 text-left text-[13px]",
              tree.current === mark.id && "bg-accent-soft text-ink-1"
            )}
            style={{ animationDelay: `${300 + index * 320}ms`, animationFillMode: "both" }}
          >
            <Sparkle className="text-accent size-3.5 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 truncate">{mark.ends[0]?.title}</span>
          </button>
        ) : (
          <button
            key={mark.id}
            type="button"
            data-review-mark={mark.id}
            onClick={event => tree.onPick(mark, event.currentTarget)}
            className={cn(
              "text-ink-3 hover:text-accent-text animate-fadeIn flex min-w-0 items-center gap-1 pb-1 pl-1 text-left text-[12px]",
              tree.current === mark.id && "text-accent-text"
            )}
            style={{ animationDelay: `${300 + index * 320}ms`, animationFillMode: "both" }}
          >
            <Plus className="size-[11px] shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 truncate">{(mark.text ?? "").replace(/^＋\s*/, "")}</span>
          </button>
        )
      )}
    </div>
  );
}
