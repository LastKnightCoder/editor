/**
 * 重建的 Tau 桌面窗口：壳层结构与类名摘自 apps/desktop/src/app（AppShell / Sidebar / Titlebar），
 * 颜色经 data-theme/data-mode 走 @tau/themes 真实 token，可在同一画面里并存浅色与深色窗口。
 */
import { useAppTheme } from "./theme";
import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronsLeft, Map as MapIcon, MessageCircle, Moon, Search, Sun } from "lucide-react";
import { Img, staticFile } from "remotion";
import { IconButton } from "@tau/ui";
import { NAV_FOOTER, NAV_SECTIONS, type NavItem, type NavKey } from "./navigation";

export const WINDOW = { width: 1440, height: 900 } as const;

const shellVars = {
  "--tau-sidebar-w": "218px",
  "--tau-sidebar-w-collapsed": "58px",
  "--tau-titlebar-h": "46px",
} as CSSProperties;

export function AppWindow({
  mode = "light",
  active,
  crumb,
  assist,
  assistOpen = false,
  mapActive = false,
  size = WINDOW,
  pluginNav,
  pressedNav,
  children,
  style,
}: {
  mode?: "light" | "dark";
  active: NavKey;
  /** 标题栏面包屑；缺省取侧栏条目名 */
  crumb?: ReactNode;
  /** 右侧 AI 停靠栏内容 */
  assist?: ReactNode;
  assistOpen?: boolean;
  mapActive?: boolean;
  /** 窗口尺寸；创作模式等双栏页面用更宽的窗口 */
  size?: { width: number; height: number };
  /** 插件贡献的侧栏入口（插在「学习」组末尾），appear 0→1 为出现进度 */
  pluginNav?: { item: NavItem; appear: number };
  /** 正被点按的侧栏条目（按下态） */
  pressedNav?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const appTheme = useAppTheme();
  const items: readonly NavItem[] = [...NAV_SECTIONS.flatMap(s => s.items as readonly NavItem[]), ...NAV_FOOTER, ...(pluginNav ? [pluginNav.item] : [])];
  const label = items.find(i => i.key === active)?.label;
  return (
    <div
      data-theme={appTheme}
      data-mode={mode}
      className="bg-page font-tau text-tau-body text-ink-1 relative grid grid-cols-[auto_4px_minmax(0,1fr)] overflow-hidden antialiased"
      style={{
        ...shellVars,
        width: size.width,
        height: size.height,
        gridTemplateRows: `${size.height}px`,
        borderRadius: 14,
        boxShadow:
          mode === "dark"
            ? "0 0 0 1px rgba(255,255,255,0.08), 0 40px 120px -30px rgba(0,0,0,0.8)"
            : "0 0 0 1px rgba(22,34,49,0.08), 0 2px 6px rgba(22,34,49,0.06), 0 50px 120px -40px rgba(22,34,49,0.45)",
        ...style,
      }}
    >
      <Sidebar active={active} pluginNav={pluginNav} pressedNav={pressedNav} />
      <div />
      <div className="grid min-w-0 grid-rows-[var(--tau-titlebar-h)_minmax(0,1fr)]">
        <Titlebar crumb={crumb ?? label} mode={mode} assistOpen={assistOpen} mapActive={mapActive} />
        <div className="relative flex min-h-0 min-w-0 overflow-x-clip">
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
          {assist}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active, pluginNav, pressedNav }: { active: NavKey; pluginNav?: { item: NavItem; appear: number }; pressedNav?: string }) {
  return (
    <nav className="flex w-[var(--tau-sidebar-w)] flex-col px-2.5 pb-3">
      <div className="mb-1.5 flex h-[var(--tau-titlebar-h)] shrink-0 items-center gap-2 px-1.5">
        <TrafficLights />
        <span className="flex items-center gap-2">
          <Img src={staticFile("tau-logo.png")} className="size-6 shrink-0 mix-blend-multiply dark:mix-blend-normal dark:brightness-[0.85]" />
          <span className="text-tau-body-lg font-semibold">Tau</span>
        </span>
        <IconButton className="ml-auto size-[27px]">
          <ChevronsLeft size={16} strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {NAV_SECTIONS.map(section => (
          <div key={section.label} className="mt-3">
            <div className="rounded-tau-sm text-tau-tiny text-ink-3 flex w-full items-center gap-1 px-2.5 pb-1.5">
              <ChevronDown size="1em" strokeWidth={1.75} className="shrink-0" />
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => (
                <NavItemButton key={item.key} item={item} active={item.key === active} pressed={item.key === pressedNav} />
              ))}
              {section.label === "学习" && pluginNav && pluginNav.appear > 0 && (
                <div style={{ height: `calc((1.65em + 10px) * ${Math.min(1, pluginNav.appear * 2)})`, opacity: pluginNav.appear }}>
                  <NavItemButton item={pluginNav.item} active={pluginNav.item.key === active} pressed={pluginNav.item.key === pressedNav} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 space-y-0.5 pt-2">
        {NAV_FOOTER.map(item => (
          <NavItemButton key={item.key} item={item} active={item.key === active} pressed={item.key === pressedNav} />
        ))}
      </div>
    </nav>
  );
}

function NavItemButton({ item, active, pressed = false }: { item: NavItem; active: boolean; pressed?: boolean }) {
  const Icon = item.icon;
  return (
    <div
      className={clsx(
        "text-tau-body relative flex h-[calc(1.65em+8px)] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left",
        active
          ? "bg-selected text-ink-1 before:bg-accent relative font-medium before:absolute before:top-2 before:bottom-2 before:-left-2.5 before:w-[3px] before:rounded-r-[3px] before:content-['']"
          : pressed
            ? "bg-hover text-ink-1"
            : "text-ink-2"
      )}
    >
      <Icon className="shrink-0" size="1.06em" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{item.label}</span>
      {item.badge?.tone === "review" && (
        <span className="bg-accent text-ink-inverse ml-auto min-w-[18px] shrink-0 rounded-full px-[5px] text-center text-[11px] leading-[18px] font-[600] tabular-nums">{item.badge.count}</span>
      )}
      {item.badge?.tone === "muted" && <span className="text-ink-3 ml-auto shrink-0 text-[11px] tabular-nums">{item.badge.count}</span>}
    </div>
  );
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-2 pr-1">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

function Titlebar({ crumb, mode, assistOpen, mapActive }: { crumb: ReactNode; mode: "light" | "dark"; assistOpen: boolean; mapActive: boolean }) {
  const pressed = "bg-selected text-accent-text";
  return (
    <header className="flex items-center gap-2.5 px-3.5 select-none">
      <div className="flex items-center gap-2.5">
        <IconButton>
          <ArrowLeft size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton disabled>
          <ArrowRight size={17} strokeWidth={1.75} />
        </IconButton>
      </div>
      <span className="text-tau-meta text-ink-2">{crumb}</span>
      <div className="flex-1" />
      <div className="bg-surface text-tau-sm text-ink-2 shadow-card flex h-[30px] items-center gap-2 rounded-full border border-transparent pr-1 pl-3">
        <Search size={13} strokeWidth={1.75} />
        搜索或跳转…
        <kbd className="bg-hover text-tau-tiny text-ink-2 inline-flex h-5 items-center rounded-md px-1.5 font-mono">⌘ K</kbd>
      </div>
      <IconButton className={mapActive ? pressed : undefined} data-hit="map">
        <MapIcon size={17} strokeWidth={1.75} />
      </IconButton>
      <IconButton className={assistOpen ? pressed : undefined} data-hit="assist">
        <MessageCircle size={17} strokeWidth={1.75} />
      </IconButton>
      <IconButton>{mode === "dark" ? <Moon size={17} strokeWidth={1.75} /> : <Sun size={17} strokeWidth={1.75} />}</IconButton>
    </header>
  );
}
