/**
 * 列表页通用控件：工具栏「按钮 + Menu」命令菜单、网格 / 列表视图菜单、列表列头排序按钮与标签单元格。
 * 项目 / 数据库 / Notebook 驾驶舱、文章、卡片库共用。浮层是命令项，当前项用 accent 图标 + 文字高亮
 * （不用 Segmented / Radio，D-024 追记）。
 */

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, ChevronDown, LayoutGrid, List } from "lucide-react";
import { Button, Menu, Tag, cn } from "@tau/ui";

export type ListLayout = "grid" | "list";

export interface CommandOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

const LAYOUTS: CommandOption<ListLayout>[] = [
  { value: "grid", label: "网格", icon: LayoutGrid },
  { value: "list", label: "列表", icon: List },
];

/** 工具栏命令菜单：触发按钮显示当前项（图标 + 文字 + ▾），菜单项高亮当前项 */
export function CommandMenu<T extends string>({
  options,
  value,
  onChange,
  title,
  label,
  icon,
  className = "w-[148px]",
}: {
  options: CommandOption<T>[];
  value: T;
  onChange(value: T): void;
  title: string;
  /** 触发按钮的文字与图标，默认取当前项 */
  label?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const current = options.find(option => option.value === value) ?? options[0];
  return (
    <Menu
      align="end"
      className={className}
      trigger={
        /* Menu 向 trigger 克隆注入 ref 与事件，故直接给 Button 元素，不包一层组件 */
        <Button
          variant="ghost"
          size="sm"
          icon={icon ?? current.icon}
          title={title}
          className="shrink-0"
        >
          {label ?? current.label}
          <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
        </Button>
      }
    >
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const active = optionValue === value;
        return (
          <Menu.Item
            key={optionValue}
            icon={<Icon className={active ? "text-accent" : undefined} strokeWidth={1.75} />}
            onSelect={() => onChange(optionValue)}
            className={active ? "text-accent-text font-medium" : undefined}
          >
            {optionLabel}
          </Menu.Item>
        );
      })}
    </Menu>
  );
}

/** 网格 / 列表视图菜单 */
export function LayoutMenu({
  value,
  onChange,
}: {
  value: ListLayout;
  onChange(layout: ListLayout): void;
}) {
  return <CommandMenu options={LAYOUTS} value={value} onChange={onChange} title="切换视图" />;
}

/**
 * 列头：可排序列是按钮，当前排序列加粗并带方向箭头（每列方向固定，不做升降切换）；
 * 不传 onSort 时是纯文本列头。
 */
export function SortHeader({
  label,
  active = false,
  ascending = false,
  onSort,
  className,
}: {
  label: string;
  active?: boolean;
  /** 该列的固定方向：名称 / 标题升序，其余降序 */
  ascending?: boolean;
  onSort?(): void;
  className?: string;
}) {
  if (!onSort) return <span className={className}>{label}</span>;
  const Arrow = ascending ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "hover:text-ink-1 inline-flex items-center gap-0.5",
        active && "text-ink-1 font-medium",
        className
      )}
    >
      {label}
      {active && <Arrow className="size-3 shrink-0" strokeWidth={2} />}
    </button>
  );
}

/** 列表行的标签单元格：最多两枚，其余折成 +N，悬停看全部；没有标签显示破折号 */
export function ListTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-tau-sm text-ink-3">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1 overflow-hidden" title={tags.join("、")}>
      {tags.slice(0, 2).map(tag => (
        <Tag key={tag} className="min-w-0 max-w-[120px] shrink-0">
          <span className="truncate">{tag}</span>
        </Tag>
      ))}
      {tags.length > 2 && <Tag className="shrink-0">+{tags.length - 2}</Tag>}
    </span>
  );
}
