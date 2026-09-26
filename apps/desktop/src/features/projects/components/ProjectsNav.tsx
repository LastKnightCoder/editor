/**
 * 侧栏「项目」入口的子项（待办项目 / 问题分组同款侧栏嵌套）：三种项目类型（类型色点 + 未归档数）。
 * 项目页在栈顶时于入口下方展开，点击经页面参数 id（类型值）收窄到该类型，再点当前项回到全部。
 * 页内因此不放类型 pills。
 */

import type { ReactNode } from "react";
import { cn } from "@tau/ui";
import { PROJECT_TYPE_META } from "../projectTypeMeta";
import { useProjectTypeCounts } from "../queries";
import { PROJECT_TYPE_KEYS } from "../types";

export function ProjectsNavTypes({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const counts = useProjectTypeCounts();
  if (!counts) return null;

  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="项目类型">
      {PROJECT_TYPE_KEYS.map(type => {
        const meta = PROJECT_TYPE_META[type];
        const active = selectedId === type;
        return (
          <NavChild
            key={type}
            active={active}
            label={meta.label}
            count={counts.get(type) ?? 0}
            glyph={<span className={cn("size-[7px] rounded-[2.5px]", meta.dotClass)} />}
            title={active ? "再点一次回到全部" : `只看「${meta.label}」项目`}
            onClick={() => onSelect(active ? "" : type)}
          />
        );
      })}
    </div>
  );
}

function NavChild({
  active,
  label,
  count = 0,
  glyph,
  title,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  onClick: () => void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
        )}
      >
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{count}</span>
        )}
      </button>
    </div>
  );
}
