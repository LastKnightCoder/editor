/**
 * 侧栏条目按钮：内置条目的角标查 navSlots 槽位，插件条目由调用方传入 badge。
 */

import type { ReactNode } from "react";
import clsx from "clsx";
import { Tooltip } from "@tau/ui";
import type { NavItem } from "./navigation";
import { NAV_BADGE_SLOTS } from "./navSlots";

export function NavItemButton({
  item,
  active,
  hasActiveChild = false,
  collapsed,
  badge,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  /** 选中态落在下方子项上：本项降为「所在区」（accent 文字、无底无竖标），不和子项抢选中 */
  hasActiveChild?: boolean;
  collapsed: boolean;
  /** 插件条目的角标（内置条目经 item.badge 查槽位） */
  badge?: ReactNode;
  onClick: () => void;
}) {
  const ItemIcon = item.icon;
  const BadgeSlot = item.badge ? NAV_BADGE_SLOTS[item.badge] : undefined;
  const button = (
    <button
      type="button"
      className={clsx(
        // 行高随字号档位折算（行盒 + 8px 余量）：固定 34px 在大字号下文字会撑满行高
        "text-tau-body relative flex h-[calc(1.65em+8px)] w-full items-center rounded-[10px] text-left",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active && hasActiveChild
          ? "text-accent-text hover:bg-hover font-medium"
          : active
            ? // 选中态：accent 淡底 + 左缘 accent 小竖点（竖点恒距窗口左缘 10px，
              // 超出按钮盒的距离随 nav 左内边距：展开 10px / 收起 20px）。
              // 用 bg-selected 而非 bg-hover——后者是 5% 墨的悬停反馈（对 page 1.086），
              // 承担选中语义太弱；bg-selected 带 accent 色相（对 page 1.174），且
              // 02 §1 视觉宪法本就允许 accent 用于"选中"（D-006）。
              clsx(
                "bg-selected text-ink-1 before:bg-accent relative font-medium before:absolute before:bottom-2",
                collapsed ? "before:-left-5" : "before:-left-2.5",
                "before:top-2 before:w-[3px] before:rounded-r-[3px] before:content-['']"
              )
            : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      onClick={onClick}
      title={collapsed ? undefined : item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      {/* 图标随字号档位（em）：17px 锚定 fontSize 16 的既有观感，大字号下不被文字甩开 */}
      <ItemIcon className="shrink-0" size="1.06em" strokeWidth={1.75} aria-hidden="true" />
      {/* 窄态（最小 120px）下长标签溢出省略，悬停 title 可见全名 */}
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      {BadgeSlot ? <BadgeSlot collapsed={collapsed} /> : badge}
    </button>
  );
  return (
    <Tooltip content={item.label} placement="right" disabled={!collapsed}>
      {button}
    </Tooltip>
  );
}
