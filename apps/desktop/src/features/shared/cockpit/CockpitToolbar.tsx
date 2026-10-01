/**
 * 驾驶舱工具栏：排序 + 视图（网格 / 列表）。两者都是「按钮 + Menu」，浮层为命令项，
 * 当前项以 accent 图标 + 文字高亮标记（同卡片库视图速切器口径，D-024 追记）。
 */

import type { LucideIcon } from "lucide-react";
import {
  ArrowDownUp,
  CalendarPlus,
  ChevronDown,
  History,
  LayoutGrid,
  List,
  PencilLine,
  ALargeSmall,
} from "lucide-react";
import { Button, Menu } from "@tau/ui";
import { COCKPIT_SORTS, type CockpitLayout, type CockpitSort } from "./model";

const SORT_ICONS: Record<CockpitSort, LucideIcon> = {
  opened: History,
  updated: PencilLine,
  name: ALargeSmall,
  created: CalendarPlus,
};

const LAYOUTS: { value: CockpitLayout; label: string; icon: LucideIcon }[] = [
  { value: "grid", label: "网格", icon: LayoutGrid },
  { value: "list", label: "列表", icon: List },
];

function CommandItem({
  icon: Icon,
  active,
  label,
  onSelect,
}: {
  icon: LucideIcon;
  active: boolean;
  label: string;
  onSelect(): void;
}) {
  return (
    <Menu.Item
      icon={<Icon className={active ? "text-accent" : undefined} strokeWidth={1.75} />}
      onSelect={onSelect}
      className={active ? "text-accent-text font-medium" : undefined}
    >
      {label}
    </Menu.Item>
  );
}

/* Menu 向 trigger 克隆注入 ref 与事件，故直接返回 Button 元素，不包一层组件 */
function triggerButton(icon: LucideIcon, label: string, title: string) {
  return (
    <Button variant="ghost" size="sm" icon={icon} title={title} className="shrink-0">
      {label}
      <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
    </Button>
  );
}

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
  const sortLabel = COCKPIT_SORTS.find(s => s.value === sort)?.label ?? "";
  const current = LAYOUTS.find(l => l.value === layout) ?? LAYOUTS[0];
  return (
    <>
      <Menu
        align="end"
        className="w-[168px]"
        trigger={triggerButton(ArrowDownUp, sortLabel, "排序（置顶始终在前）")}
      >
        {COCKPIT_SORTS.map(({ value, label }) => (
          <CommandItem
            key={value}
            icon={SORT_ICONS[value]}
            active={value === sort}
            label={label}
            onSelect={() => onSortChange(value)}
          />
        ))}
      </Menu>
      <Menu
        align="end"
        className="w-[148px]"
        trigger={triggerButton(current.icon, current.label, "切换视图")}
      >
        {LAYOUTS.map(({ value, label, icon }) => (
          <CommandItem
            key={value}
            icon={icon}
            active={value === layout}
            label={label}
            onSelect={() => onLayoutChange(value)}
          />
        ))}
      </Menu>
    </>
  );
}
