/**
 * 驾驶舱工具栏：排序 + 视图（网格 / 列表），两者都是 features/shared/list 的「按钮 + Menu」。
 */

import { useCockpitI18n } from "./i18n";
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
  const { t } = useCockpitI18n();
  const options = COCKPIT_SORTS.map(value => ({
    value,
    label: t(`sort.${value}`),
    icon: SORT_ICONS[value],
  }));
  return (
    <>
      <CommandMenu
        options={options}
        value={sort}
        onChange={onSortChange}
        title={t("sort.title")}
        icon={ArrowDownUp}
        className="w-[168px]"
      />
      <LayoutMenu value={layout} onChange={onLayoutChange} />
    </>
  );
}
