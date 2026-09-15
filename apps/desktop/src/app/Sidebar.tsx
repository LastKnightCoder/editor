/**
 * 侧边栏 —— 类名与结构 1:1 对齐 A2 模板（视觉基准 mockups/direction-a-soft.html）。
 * 模块条目来自 navigation.ts（数据驱动），这里只有结构。
 */

import { ChevronsLeft } from "lucide-react";
import { useSurface } from "@/surface/SurfaceProvider";
import { useShellStore } from "./shellStore";
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from "./navigation";

export function Sidebar() {
  const { navigator, state } = useSurface();
  const collapsed = useShellStore(s => s.sidebarCollapsed);
  const toggle = useShellStore(s => s.toggleSidebar);

  const currentKey = state.back[state.back.length - 1]?.key;

  return (
    <nav className="sidebar" aria-label="主导航">
      <div className="sidebar-head app-region-drag">
        {/* Mac 红绿灯占位（[data-platform="mac"] 时显示；真实窗口为系统控件让位） */}
        <div className="traffic-lights" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="brand">
          <span className="brand-mark">τ</span>
          <span className="brand-name">Tau</span>
        </span>
        <button
          type="button"
          className="icon-btn app-region-no-drag"
          onClick={toggle}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ChevronsLeft
            size={16}
            strokeWidth={1.75}
            style={collapsed ? { transform: "scaleX(-1)" } : undefined}
          />
        </button>
      </div>

      {NAV_SECTIONS.map(section => (
        <div key={section.label} className="nav-section">
          <div className="nav-label">{section.label}</div>
          {section.items.map(item => (
            <NavItemButton
              key={item.key}
              item={item}
              active={item.key === currentKey}
              onClick={() => navigator.push(item.key)}
            />
          ))}
        </div>
      ))}

      <div className="nav-spacer" />
      {NAV_FOOTER.map(item => (
        <NavItemButton
          key={item.key}
          item={item}
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
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const ItemIcon = item.icon;
  return (
    <button
      type="button"
      className={`nav-item${active ? "active" : ""}`}
      onClick={onClick}
      title={item.label}
    >
      <ItemIcon size={17} strokeWidth={1.75} />
      <span>{item.label}</span>
    </button>
  );
}
