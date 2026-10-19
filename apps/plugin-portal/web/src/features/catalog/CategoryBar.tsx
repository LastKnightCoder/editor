import { FilterPill } from "@tau/ui";
import type { PluginCategory } from "../../../../contracts";
import { visibleCategories } from "./categories";

/** 分类单选；没有任何分类有插件时不渲染 */
export function CategoryBar({
  value,
  counts,
  onChange,
}: {
  value: PluginCategory | null;
  counts: Partial<Record<PluginCategory, number>> | null | undefined;
  onChange: (value: PluginCategory | null) => void;
}) {
  const items = visibleCategories(counts);
  if (!items.length && !value) return null;
  return (
    <div role="group" aria-label="插件分类" className="mb-5 flex flex-wrap items-center gap-2">
      <FilterPill active={!value} onClick={() => onChange(null)} label="全部" />
      {items.map(item => (
        <FilterPill
          key={item.id}
          active={value === item.id}
          onClick={() => onChange(item.id)}
          label={item.label}
          count={item.count}
        />
      ))}
    </div>
  );
}
