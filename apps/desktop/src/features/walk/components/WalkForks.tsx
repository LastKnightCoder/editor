/**
 * 右侧岔路栏：从当前站能走向的相邻内容（双链 / 语义相近 / 同标签）+ 底部随机跳。
 * 不显示相似度数值；加载中为骨架，没有岔路时提示随机跳。
 */

import { GitFork, Shuffle } from "lucide-react";
import type { WalkNeighbor } from "@/types";
import { WALK_KIND_META, WALK_RELATION_META } from "../model";
import { EntityKindIcon } from "@/components/EntityKind/EntityKindIcon";

export function WalkForks({
  neighbors,
  loading,
  jumping,
  onPick,
  onJump,
}: {
  neighbors: WalkNeighbor[];
  loading: boolean;
  jumping: boolean;
  onPick(neighbor: WalkNeighbor): void;
  onJump(): void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-2">
      <p className="text-tau-micro text-ink-3 flex items-center gap-1.5 px-0.5 pt-1.5">
        <GitFork className="size-3.5" strokeWidth={1.75} />
        从这里走向
      </p>
      {loading ? (
        [0, 1, 2].map(i => (
          <div key={i} className="rounded-tau-md bg-sunken h-[58px] animate-pulse" />
        ))
      ) : neighbors.length === 0 ? (
        <p className="text-tau-meta text-ink-3 px-0.5">这里没有岔路，随机跳一下吧</p>
      ) : (
        neighbors.map((neighbor, i) => {
          const relation = WALK_RELATION_META[neighbor.relation];
          const RelationIcon = relation.icon;
          return (
            <button
              key={`${neighbor.ref.kind}:${neighbor.ref.id}`}
              type="button"
              onClick={() => onPick(neighbor)}
              style={{ animationDelay: `${i * 40}ms` }}
              className="motion-safe:animate-walk-in rounded-tau-md border-line-1 bg-surface ease-tau-out hover:border-accent flex flex-col gap-1 border px-3 py-2.5 text-left transition-[border-color,translate] duration-[160ms] hover:translate-x-0.5"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <EntityKindIcon
                  entityRef={neighbor.ref}
                  fallback={WALK_KIND_META[neighbor.ref.kind]}
                  className="text-ink-3 size-3.5 shrink-0"
                  strokeWidth={1.75}
                />
                <span className="text-tau-meta text-ink-1 truncate font-medium">
                  {neighbor.title}
                </span>
              </span>
              <span className="text-tau-micro text-ink-3 inline-flex items-center gap-1">
                <RelationIcon className="size-3 shrink-0" strokeWidth={1.75} />
                {neighbor.relation === "tag" && neighbor.sharedTag
                  ? `#${neighbor.sharedTag}`
                  : relation.label}
              </span>
            </button>
          );
        })
      )}
      <button
        type="button"
        onClick={onJump}
        disabled={jumping}
        className="rounded-tau-md border-line-2 text-tau-meta text-ink-2 ease-tau-out hover:border-accent hover:text-accent-text mt-auto inline-flex h-10 w-full items-center justify-center gap-1.5 border border-dashed transition-colors duration-[160ms] disabled:pointer-events-none disabled:opacity-45"
      >
        <Shuffle className="size-3.5" strokeWidth={1.75} />
        换个方向，随机跳一下
        <kbd className="bg-sunken font-tau-mono text-tau-tiny text-ink-3 ml-1 rounded px-1.5">
          Space
        </kbd>
      </button>
    </aside>
  );
}
