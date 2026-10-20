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
import { NAV_FOOTER, composeNavSections, isNavItemActive, type NavItem } from "./navigation";
import { useDesktopPlugins } from "./plugins/context";
import { appNotify } from "@/features/notifications/notify";
import { NAV_BADGE_SLOTS, NAV_CHILDREN_SLOTS, useNavChildrenContent } from "./navSlots";
import { MacTrafficLights } from "./WindowControls";
import { useFullScreen } from "./useFullScreen";
import { openFeedbackWindow } from "@/commands/feedback";

export function Sidebar({ resizing }: { resizing: boolean }) {
  const { navigator, state } = usePage();
  const plugins = useDesktopPlugins();
  const sections = composeNavSections(plugins?.listSidebar());
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

  const current = state.back[state.back.length - 1];
  const currentKey = current?.key;
  // 子项只在所属页位于栈顶、且槽内有内容时展开（侧栏收起为图标列时不展开）
  const childrenContent = useNavChildrenContent();
  const shouldExpandChildren = (item: NavItem) =>
    !collapsed &&
    item.key === currentKey &&
    (item.children ? childrenContent[item.children] : false);

  return (
    <nav
      aria-label="主导航"
      className={clsx(
        "ease-tau-out flex flex-col pb-3 transition-[width,padding] duration-[220ms]",
        // 拖宽时宽度需逐帧跟随鼠标，关过渡避免 220ms 缓动滞后
        resizing && "transition-none",
        // 收起态左 20 / 右 0：右侧另有 4px 拖拽热区 + 页面 px-4 共 20px 留白，
        // 图标列到窗口左缘与到内容纸面的间距才对称
        collapsed
          ? "w-[var(--tau-sidebar-w-collapsed)] pl-5 pr-0"
          : "w-[var(--tau-sidebar-w)] px-2.5"
      )}
    >
      <div
        className={clsx(
          "app-region-drag flex shrink-0 items-center gap-2",
          // 收起态无 mb，头部 pb(10px) 直接承担与首个图标的间距（第一组亦无 mt）；
          // 有信号灯带时无 pt——带子自身撑满标题栏高度（见 MacTrafficLights），中线与
          // 右侧对齐；无信号灯（全屏 / Windows/Linux）补回 pt 避免折叠按钮贴顶。
          // 收起态头部无水平内边距：» 按钮居中，与下方图标列同中线（39px）；信号灯带
          // self-start 贴左、不水平居中——52px 的带子居中后红点只剩 3px 贴窗口圆角，
          // 太局促，带子自身负 margin 回到绝对 14px 左缩进（见 MacTrafficLights）
          collapsed
            ? clsx("flex-col gap-3 pb-2.5", !lightsShown && "pt-2.5")
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

      {/* 滚动收口在导航列表：头部 logo 区与底部设置不随滚动。滚动条始终隐藏
          （scrollbar-hide），可滚方向由边缘渐隐（edge-fade-scroll + useEdgeFade）提示 */}
      <div
        ref={setScrollEl}
        className="edge-fade-scroll scrollbar-hide min-h-0 flex-1 overflow-y-auto"
      >
        {sections.map((section, sectionIndex) => {
          // 组折叠收纳：收起条目留组头 + 条目数，
          // grid-rows 0fr↔1fr 过渡；侧栏收起态（图标列）无组头，强制展开不受影响
          const collapseKey = section.collapseKey ?? section.label;
          const folded = !collapsed && (navSectionCollapsed[collapseKey] ?? false);
          return (
            <div
              key={section.id}
              // 首组收起态无 mt：与头部的间距由头部 pb 承担，避免 mt 堆叠出大空隙
              className={clsx(collapsed && sectionIndex === 0 ? "mt-0" : "mt-3")}
            >
              {!collapsed && (
                <button
                  type="button"
                  className="ease-tau-out rounded-tau-sm text-tau-tiny text-ink-3 hover:text-ink-2 flex w-full items-center gap-1 px-2.5 pb-1.5 transition-colors duration-[160ms]"
                  onClick={() => toggleNavSection(collapseKey)}
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
                  {section.items.map(item => {
                    const slot = item.children ? NAV_CHILDREN_SLOTS[item.children] : undefined;
                    const ChildrenSlot = slot?.Component;
                    const expanded = shouldExpandChildren(item);
                    return (
                      <div key={item.key}>
                        <NavItemButton
                          item={item}
                          collapsed={collapsed}
                          active={isNavItemActive(item, current)}
                          hasActiveChild={
                            expanded && Boolean(slot?.selected(current?.params ?? {}))
                          }
                          // 带子项的入口回到该页时沿用已有参数（停留在上次看的子项）；
                          // 已在该页且槽声明 parentResets 时清空参数回到总览
                          onClick={() => {
                            if (item.plugin) {
                              void item.plugin.open().catch(error =>
                                appNotify({
                                  title: "无法打开插件页面",
                                  body: error instanceof Error ? error.message : String(error),
                                  tone: "danger",
                                })
                              );
                              return;
                            }
                            navigator.push(
                              item.key,
                              slot && !(slot.parentResets && item.key === currentKey)
                                ? state.back.find(entry => entry.key === item.key)?.params
                                : undefined
                            );
                          }}
                        />
                        {ChildrenSlot && expanded && (
                          <ChildrenSlot
                            selectedId={current?.params.id as string | undefined}
                            onSelect={id => navigator.push(item.key, { id })}
                          />
                        )}
                      </div>
                    );
                  })}
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
            // 浮层 / 独立窗口入口（设置弹窗、反馈窗口）不是页面栈页，无激活态
            active={item.opensOverlay || item.opensWindow ? false : item.key === currentKey}
            onClick={() =>
              item.opensOverlay === "settings"
                ? openSettings()
                : item.opensWindow === "feedback"
                  ? void openFeedbackWindow({ page: currentKey ?? null })
                  : navigator.push(item.key)
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
  hasActiveChild = false,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  /** 选中态落在下方子项上：本项降为「所在区」（accent 文字、无底无竖标），不和子项抢选中 */
  hasActiveChild?: boolean;
  collapsed: boolean;
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
      {BadgeSlot && <BadgeSlot collapsed={collapsed} />}
    </button>
  );
  return (
    <Tooltip content={item.label} placement="right" disabled={!collapsed}>
      {button}
    </Tooltip>
  );
}
