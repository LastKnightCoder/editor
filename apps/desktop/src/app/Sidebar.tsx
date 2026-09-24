/**
 * 侧边栏 —— 模块条目来自 navigation.ts（数据驱动），样式 Tailwind 优先（D-001）。
 * 收起态由 shellStore 驱动条件类；拖宽时由 AppShell 传 resizing 关宽度过渡；Mac 信号灯由 isMac 条件渲染。
 */

import { useState } from "react";
import { ChevronDown, ChevronsLeft } from "lucide-react";
import clsx from "clsx";
import { isMac } from "@/platform";
import { usePage } from "@/page/PageProvider";
import { useEdgeFade, IconButton, Tooltip } from "@tau/ui";
import logo from "@/assets/logo.png";
import { useShellStore } from "./shellStore";
import { useSettingsStore } from "./settingsStore";
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from "./navigation";
import { PomodoroNavBadge } from "@/features/pomodoro/components/PomodoroNavBadge";
import { MacTrafficLights } from "./WindowControls";
import { useFullScreen } from "./useFullScreen";

export function Sidebar({ resizing }: { resizing: boolean }) {
  const { navigator, state } = usePage();
  const collapsed = useShellStore(s => s.sidebarCollapsed);
  const toggle = useShellStore(s => s.toggleSidebar);
  const navSectionCollapsed = useShellStore(s => s.navSectionCollapsed);
  const toggleNavSection = useShellStore(s => s.toggleNavSection);
  const openSettings = useSettingsStore(s => s.openSettings);
  // 全屏下隐藏 mac 信号灯（对齐平台惯例），头部布局随之收拢
  const fullScreen = useFullScreen();
  const lightsShown = isMac && !fullScreen;

  // 边缘渐隐：callback ref（组折叠动画经 transitionend 重测，见 useEdgeFade）
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const currentKey = state.back[state.back.length - 1]?.key;

  return (
    <nav
      aria-label="主导航"
      className={clsx(
        "ease-tau-out flex flex-col px-2.5 pb-3 transition-[width] duration-[220ms]",
        // 拖宽时宽度需逐帧跟随鼠标，关过渡避免 220ms 缓动滞后
        resizing && "transition-none",
        collapsed ? "w-[var(--tau-sidebar-w-collapsed)]" : "w-[var(--tau-sidebar-w)]"
      )}
    >
      <div
        className={clsx(
          "app-region-drag flex shrink-0 items-center gap-2",
          // 收起态无 mb，头部 pb(10px) 直接承担与首个图标的间距（第一组亦无 mt）；
          // 有信号灯带时无 pt——带子自身撑满标题栏高度（见 MacTrafficLights），中线与
          // 右侧对齐；无信号灯（全屏 / Windows/Linux）补回 pt 避免折叠按钮贴顶。
          // px-1（叠加 nav 的 px-2.5 = 绝对 14px 左缩进，同标题栏版心节奏）：信号灯带
          // self-start 贴左缩进、不水平居中——52px 的带子居中后红点只剩 3px 贴窗口
          // 圆角，太局促；对称内边距下 » 按钮与下图标列中线保持 29px 不变
          collapsed
            ? clsx("flex-col gap-3 px-1 pb-2.5", !lightsShown && "pt-2.5")
            : "mb-1.5 h-[var(--tau-titlebar-h)] px-1.5"
        )}
      >
        {/* Mac 自绘信号灯（原生已被主进程移出屏幕，见 WindowControls；全屏下
            隐藏对齐平台惯例）；Windows/Linux 不渲染 */}
        {lightsShown && <MacTrafficLights collapsed={collapsed} />}
        {!collapsed && (
          <span className="flex items-center gap-2">
            {/* 应用图标（build/icon.png 同源，自带圆角与米白底，勿再加底色）。
                主题融合：浅色 multiply 让白底与纸色相乘消隐；深色压暗为柔和浅灰牌 */}
            <img
              src={logo}
              alt="Tau"
              className="size-6 shrink-0 select-none mix-blend-multiply dark:mix-blend-normal dark:brightness-[0.85]"
              draggable={false}
            />
            <span className="text-tau-body-lg font-semibold">Tau</span>
          </span>
        )}
        <Tooltip content="展开侧边栏" placement="right" disabled={!collapsed}>
          <IconButton
            // 头部容器是窗口拖拽区，按钮必须 no-drag 让位，否则点击被拖拽劫持
            className={clsx("app-region-no-drag size-[27px]", collapsed ? "ml-0" : "ml-auto")}
            onClick={toggle}
            title={collapsed ? undefined : "收起侧边栏"}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <ChevronsLeft
              size={16}
              strokeWidth={1.75}
              style={collapsed ? { transform: "scaleX(-1)" } : undefined}
            />
          </IconButton>
        </Tooltip>
      </div>

      {/* 滚动收口在导航列表：头部 logo 区与底部设置不随滚动；边缘渐隐（base.css
          的 edge-fade-scroll + useEdgeFade）提示可滚方向。 -mr/pr 借位（同
          home-scroll 手法）：滚动条右移进侧栏右留白，落在列表右缘与拖拽热区
          中间，条目宽度不受影响 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll -mr-[5px] min-h-0 flex-1 overflow-y-auto pr-[5px]"
      >
        {NAV_SECTIONS.map((section, sectionIndex) => {
          // 组折叠收纳：收起条目留组头 + 条目数，
          // grid-rows 0fr↔1fr 过渡；侧栏收起态（图标列）无组头，强制展开不受影响
          const folded = !collapsed && (navSectionCollapsed[section.label] ?? false);
          return (
            <div
              key={section.label}
              // 首组收起态无 mt：与头部的间距由头部 pb 承担，避免 mt 堆叠出大空隙
              className={clsx(collapsed && sectionIndex === 0 ? "mt-0" : "mt-3")}
            >
              {!collapsed && (
                <button
                  type="button"
                  className="ease-tau-out rounded-tau-sm text-tau-tiny text-ink-3 hover:text-ink-2 flex w-full items-center gap-1 px-2.5 pb-1.5 transition-colors duration-[160ms]"
                  onClick={() => toggleNavSection(section.label)}
                  aria-expanded={!folded}
                  title={folded ? `展开「${section.label}」` : `收起「${section.label}」`}
                >
                  <ChevronDown
                    size="1em"
                    strokeWidth={1.75}
                    className={clsx(
                      "ease-tau-out shrink-0 transition-transform duration-[200ms]",
                      folded && "-rotate-90"
                    )}
                  />
                  {section.label}
                  {folded && <span className="ml-auto tabular-nums">{section.items.length}</span>}
                </button>
              )}
              <div
                className={clsx(
                  "ease-tau-out grid transition-[grid-template-rows] duration-[220ms]",
                  folded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                )}
              >
                {/* space-y 行距：选中/hover 色块不再相贴（同菜单 2px 行距口径） */}
                <div className="min-h-0 space-y-0.5 overflow-hidden">
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
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 space-y-0.5 pt-2">
        {NAV_FOOTER.map(item => (
          <NavItemButton
            key={item.key}
            item={item}
            collapsed={collapsed}
            // 浮层入口（设置弹窗）不是页面栈页，无激活态
            active={item.opensOverlay ? false : item.key === currentKey}
            onClick={() =>
              item.opensOverlay === "settings" ? openSettings() : navigator.push(item.key)
            }
          />
        ))}
      </div>
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
  const button = (
    <button
      type="button"
      className={clsx(
        // 行高随字号档位折算（行盒 + 8px 余量）：固定 34px 在大字号下文字会撑满行高
        "text-tau-body relative flex h-[calc(1.65em+8px)] w-full items-center rounded-[10px] text-left",
        "ease-tau-out transition-[background,color] duration-[160ms]",
        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
        active
          ? // 选中态：accent 淡底 + 左缘 accent 小竖点（竖点贴列左缘，超出按钮盒 10px）。
            // 用 bg-selected 而非 bg-hover——后者是 5% 墨的悬停反馈（对 page 1.086），
            // 承担选中语义太弱；bg-selected 带 accent 色相（对 page 1.174），且
            // 02 §1 视觉宪法本就允许 accent 用于"选中"（D-006）。
            "bg-selected text-ink-1 before:bg-accent relative font-medium before:absolute before:-left-2.5 before:bottom-2 before:top-2 before:w-[3px] before:rounded-r-[3px] before:content-['']"
          : "text-ink-2 hover:bg-hover hover:text-ink-1"
      )}
      onClick={onClick}
      title={collapsed ? undefined : item.label}
      aria-label={item.label}
    >
      {/* 图标随字号档位（em）：17px 锚定 fontSize 16 的既有观感，大字号下不被文字甩开 */}
      <ItemIcon className="shrink-0" size="1.06em" strokeWidth={1.75} />
      {/* 窄态（最小 120px）下长标签溢出省略，悬停 title 可见全名 */}
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      {item.badge === "pomodoro-live" && <PomodoroNavBadge collapsed={collapsed} />}
    </button>
  );
  return (
    <Tooltip content={item.label} placement="right" disabled={!collapsed}>
      {button}
    </Tooltip>
  );
}
