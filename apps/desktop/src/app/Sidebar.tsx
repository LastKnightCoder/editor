/**
 * 侧边栏 —— 模块条目来自 navigation.ts（数据驱动），样式 Tailwind 优先（D-013）。
 * 收起态由 shellStore 驱动条件类；Mac 红绿灯占位由 isMac 条件渲染。
 */

import { ChevronsLeft } from "lucide-react";
import clsx from "clsx";
import { isMac } from "@/platform";
import { usePage } from "@/page/PageProvider";
import { IconButton } from "@/ui/primitives/IconButton";
import { useShellStore } from "./shellStore";
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from "./navigation";

export function Sidebar() {
  const { navigator, state } = usePage();
  const collapsed = useShellStore(s => s.sidebarCollapsed);
  const toggle = useShellStore(s => s.toggleSidebar);

  const currentKey = state.back[state.back.length - 1]?.key;

  return (
    <nav
      aria-label="主导航"
      className={clsx(
        "ease-tau-out flex flex-col gap-0.5 overflow-y-auto px-2.5 pb-3 transition-[width] duration-[220ms]",
        collapsed ? "w-[var(--tau-sidebar-w-collapsed)]" : "w-[var(--tau-sidebar-w)]"
      )}
    >
      <div
        className={clsx(
          "app-region-drag flex shrink-0 items-center gap-2",
          collapsed
            ? "mb-1.5 flex-col gap-3 px-0 py-2.5 pb-3"
            : "mb-1.5 h-[var(--tau-titlebar-h)] px-1.5"
        )}
      >
        {/* Mac 红绿灯占位（真实窗口为系统控件让位）；Windows/Linux 不渲染 */}
        {isMac && (
          <div aria-hidden className={clsx("flex items-center gap-2", collapsed ? "pr-0" : "pr-1")}>
            {/* 平台原生控件色，刻意不走主题 token */}
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
        )}
        {!collapsed && (
          <span className="flex items-center gap-2">
            <span className="rounded-tau-sm text-ink-inverse grid size-6 place-items-center bg-[linear-gradient(145deg,var(--tau-accent-hover),var(--tau-accent))] text-[13px] font-semibold">
              τ
            </span>
            <span className="text-tau-body-lg font-semibold">Tau</span>
          </span>
        )}
        <IconButton
          className={clsx("size-[27px]", collapsed ? "ml-0" : "ml-auto")}
          onClick={toggle}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ChevronsLeft
            size={16}
            strokeWidth={1.75}
            style={collapsed ? { transform: "scaleX(-1)" } : undefined}
          />
        </IconButton>
      </div>

      {NAV_SECTIONS.map(section => (
        <div key={section.label} className="mt-3">
          {!collapsed && (
            <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5">{section.label}</div>
          )}
          {section.items.map(item => (
            <NavItemButton
              key={item.key}
              item={item}
              collapsed={collapsed}
              active={item.key === currentKey}
              onClick={() => navigator.push(item.key)}
            />
          ))}
        </div>
      ))}

      <div className="flex-1" />
      {NAV_FOOTER.map(item => (
        <NavItemButton
          key={item.key}
          item={item}
          collapsed={collapsed}
          active={item.key === currentKey}
          onClick={() => navigator.push(item.key)}
        />
      ))}
    </nav>
  );
}

function NavItemButton({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const ItemIcon = item.icon;
  return (
    <button
      type="button"
      className={clsx(
        "text-tau-body flex h-[34px] w-full items-center rounded-[10px] text-left",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? // 融合态：极淡墨底 + 左缘 accent 小竖点（竖点贴列左缘，超出按钮盒 10px）
            "bg-hover text-ink-1 before:bg-accent relative font-medium before:absolute before:-left-2.5 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r-[3px] before:content-['']"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      onClick={onClick}
      title={item.label}
    >
      <ItemIcon size={17} strokeWidth={1.75} />
      {!collapsed && <span>{item.label}</span>}
    </button>
  );
}
