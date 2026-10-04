/**
 * 卡片库视图速切器：经 usePageBreadcrumb 挂在标题栏面包屑位（「卡片库 / [卡片墙 ▾]」），
 * 三视图互斥（图谱已移到全局知识地图）。浮层走 Menu 命令项（选中即关并还焦，键盘导航 / Esc / 外点由 primitives 内建），
 * 当前视图以 accent 图标 + 文字高亮标记。
 */

import { useState } from "react";
import { ChevronDown, Layers, List, Table2 } from "lucide-react";
import { Menu, cn } from "@tau/ui";
import type { CardsViewMode } from "../preferences";

const VIEW_OPTIONS: { key: CardsViewMode; label: string; icon: typeof Layers }[] = [
  { key: "wall", label: "卡片墙", icon: Layers },
  { key: "list", label: "列表", icon: List },
  { key: "database", label: "表格", icon: Table2 },
];

interface CardViewSwitcherProps {
  value: CardsViewMode;
  onChange: (view: CardsViewMode) => void;
}

export function CardViewSwitcher({ value, onChange }: CardViewSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = VIEW_OPTIONS.find(option => option.key === value) ?? VIEW_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-[168px]"
      trigger={
        <button
          type="button"
          title="切换视图"
          className="rounded-tau-sm text-ink-2 hover:bg-hover hover:text-ink-1 flex min-w-0 items-center gap-1.5 px-1.5 py-0.5 text-[11.5px] transition-colors"
        >
          <CurrentIcon className="size-[13px] shrink-0" strokeWidth={1.75} />
          <span>{current.label}</span>
          <ChevronDown
            className={cn(
              "ease-tau-out size-3 shrink-0 transition-transform duration-150",
              open && "rotate-180"
            )}
            strokeWidth={1.75}
          />
        </button>
      }
    >
      {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => {
        const active = key === value;
        return (
          <Menu.Item
            key={key}
            icon={<Icon className={active ? "text-accent" : undefined} strokeWidth={1.75} />}
            onSelect={() => onChange(key)}
            className={active ? "text-accent-text font-medium" : undefined}
          >
            {label}
          </Menu.Item>
        );
      })}
    </Menu>
  );
}
