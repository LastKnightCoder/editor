/**
 * 目录行：图标 + 名称 + 尾部状态，悬停在固定槽位淡入「更多」；右键弹出同一份菜单。
 * 槽位常驻占宽，悬停不改变行内布局。
 */

import { forwardRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { ContextMenu, Menu, cn } from "@tau/ui";

interface TreeRowProps {
  icon: ReactNode;
  title: string;
  active?: boolean;
  /** 名称后的状态（处理中 / 失败 / 生成中） */
  flag?: ReactNode;
  /** Menu.Item 等菜单内容；不传则无「更多」槽位 */
  menu?: ReactNode;
  onClick: () => void;
  className?: string;
}

export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(
  ({ icon, title, active, flag, menu, onClick, className }, ref) => {
    const row = (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        title={title}
        onClick={onClick}
        onKeyDown={e => {
          if (e.key === "Enter" && e.target === e.currentTarget) onClick();
        }}
        className={cn(
          "text-tau-meta group relative flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] pl-2 pr-1 outline-none",
          "focus-visible:shadow-[var(--tau-focus-ring)]",
          active ? "bg-selected text-ink-1" : "text-ink-2 hover:bg-hover hover:text-ink-1",
          className
        )}
      >
        <span
          className={cn("grid shrink-0 place-items-center", active ? "text-ink-2" : "text-ink-3")}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {flag && <span className="text-tau-micro shrink-0 tabular-nums">{flag}</span>}
        {menu && (
          <span className="size-[22px] shrink-0" onClick={e => e.stopPropagation()}>
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  aria-label="更多"
                  className={cn(
                    "text-ink-3 hover:bg-hover hover:text-ink-1 grid size-[22px] place-items-center rounded-[6px] opacity-0 outline-none",
                    "focus-visible:opacity-100 group-hover:opacity-100 aria-expanded:opacity-100"
                  )}
                >
                  <MoreHorizontal className="size-[15px]" strokeWidth={1.75} />
                </button>
              }
            >
              {menu}
            </Menu>
          </span>
        )}
      </div>
    );
    return menu ? <ContextMenu content={menu}>{row}</ContextMenu> : row;
  }
);

TreeRow.displayName = "TreeRow";

/** 组头：折叠箭头 + 组名 + 数量，右侧动作（＋） */
export function TreeGroupHeader({
  title,
  count,
  open,
  onToggle,
  action,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-[30px] items-center gap-1 pl-1 pr-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-tau-sm text-ink-2 hover:text-ink-1 flex min-w-0 flex-1 items-center gap-1 rounded-[6px] font-semibold outline-none focus-visible:shadow-[var(--tau-focus-ring)]"
      >
        <ChevronDown
          className={cn(
            "text-ink-3 ease-tau-out size-3.5 shrink-0 transition-transform duration-150",
            !open && "-rotate-90"
          )}
          strokeWidth={1.75}
        />
        {title}
        <span className="text-ink-3 font-normal tabular-nums">{count}</span>
      </button>
      {action}
    </div>
  );
}
