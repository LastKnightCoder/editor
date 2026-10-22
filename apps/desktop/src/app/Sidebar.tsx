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
import { NAV_FOOTER, composeNavSections, type NavItem } from "./navigation";
import { useDesktopPlugins } from "./plugins/context";
import { NAV_CHILDREN_SLOTS, useNavChildrenContent } from "./navSlots";
import { NavItemButton } from "./NavItemButton";
import { PluginNavEntry } from "./PluginNavEntry";
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
                    if (item.plugin)
                      return (
                        <PluginNavEntry
                          key={item.key}
                          item={item}
                          current={current}
                          collapsed={collapsed}
                        />
                      );
                    const slot = item.children ? NAV_CHILDREN_SLOTS[item.children] : undefined;
                    const ChildrenSlot = slot?.Component;
                    const expanded = shouldExpandChildren(item);
                    return (
                      <div key={item.key}>
                        <NavItemButton
                          item={item}
                          collapsed={collapsed}
                          active={item.key === currentKey}
                          hasActiveChild={
                            expanded && Boolean(slot?.selected(current?.params ?? {}))
                          }
                          // 带子项的入口回到该页时沿用已有参数（停留在上次看的子项）；
                          // 已在该页且槽声明 parentResets 时清空参数回到总览
                          onClick={() => {
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
