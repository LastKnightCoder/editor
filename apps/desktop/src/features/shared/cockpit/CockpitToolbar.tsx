/**
 * 驾驶舱工具栏：排序 + 视图（网格 / 列表），两者都是 features/shared/list 的「按钮 + Menu」。
 */

import type { LucideIcon } from "lucide-react";
import { ArrowDownUp, CalendarPlus, History, PencilLine, ALargeSmall } from "lucide-react";
import { CommandMenu, LayoutMenu } from "../list/ListControls";
import { COCKPIT_SORTS, type CockpitLayout, type CockpitSort } from "./model";

const SORT_ICONS: Record<CockpitSort, LucideIcon> = {
  opened: History,
  updated: PencilLine,
  name: ALargeSmall,
  created: CalendarPlus,
};

const SORT_OPTIONS = COCKPIT_SORTS.map(({ value, label }) => ({
  value,
  label,
  icon: SORT_ICONS[value],
}));

export function CockpitToolbar({
  layout,
  sort,
  onLayoutChange,
  onSortChange,
}: {
  layout: CockpitLayout;
  sort: CockpitSort;
  onLayoutChange(layout: CockpitLayout): void;
  onSortChange(sort: CockpitSort): void;
}) {
  return (
    <>
      <CommandMenu
        options={SORT_OPTIONS}
        value={sort}
        onChange={onSortChange}
        title="排序（置顶始终在前）"
        icon={ArrowDownUp}
        className="w-[168px]"
      />
      <LayoutMenu value={layout} onChange={onLayoutChange} />
    </>
  );
}
