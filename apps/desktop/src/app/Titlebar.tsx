/**
 * 标题栏 —— 右列专属，不横贯全宽；样式 Tailwind 优先（D-001）。
 */

import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Monitor, Moon, Search, Sun } from "lucide-react";
import { isWinOrLinux } from "@/platform";
import { usePage } from "@/page/PageProvider";
import { getPageMeta } from "@/page/core/pageMeta";
import { isEditableTarget } from "@/page/dom";
import { IconButton } from "@tau/ui";
import { getTheme } from "@tau/ui/theme";
import { nextMode, useThemeStore } from "@tau/ui/theme/runtime";
import { useSearchStore } from "@/features/search/searchStore";
import { WindowControls } from "./WindowControls";

export function Titlebar() {
  const { navigator, state, breadcrumbs } = usePage();
  const togglePalette = useSearchStore(s => s.togglePalette);

  // Alt+←/→ 全局键盘导航（Esc 在 PageProvider 内处理）；
  // 编辑上下文让位（macOS Option+←/→ 是按词移动光标）、输入法组合期间不抢键
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!e.altKey || e.isComposing || isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigator.back();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigator.forward();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  const currentKey = state.back[state.back.length - 1]?.key;
  const crumb = currentKey ? (getPageMeta(currentKey)?.label ?? currentKey) : "";
  /* 页面注册的自定义面包屑（usePageBreadcrumb）整条替换默认「· label」；
     自定义内容可能可交互（如文章详情的速切器），须让出拖拽区 */
  const customCrumb = currentKey ? breadcrumbs.get(currentKey) : undefined;
  const canBack = state.back.length > 1;
  const canForward = state.forward.length > 0;

  return (
    <header className="app-region-drag flex select-none items-center gap-2.5 px-3.5">
      <div className="app-region-no-drag flex items-center gap-2.5">
        <IconButton
          onClick={() => navigator.back()}
          disabled={!canBack}
          title="后退 (Alt+←)"
          aria-label="后退"
        >
          <ArrowLeft size={17} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          onClick={() => navigator.forward()}
          disabled={!canForward}
          title="前进 (Alt+→)"
          aria-label="前进"
        >
          <ArrowRight size={17} strokeWidth={1.75} />
        </IconButton>
      </div>
      {/* 自定义面包屑可能可交互（如详情页速切器），须让出拖拽区；null（加载中）回退默认 */}
      {customCrumb != null ? (
        <div className="app-region-no-drag flex min-w-0 items-center">{customCrumb}</div>
      ) : (
        <span className="text-tau-meta text-ink-2">· {crumb}</span>
      )}

      <div className="flex-1" />
      {/* 全局搜索/命令面板（Ctrl+K，D-003） */}
      <button
        type="button"
        onClick={togglePalette}
        title="搜索或跳转 (Ctrl+K)"
        className="app-region-no-drag bg-surface text-tau-sm text-ink-2 shadow-card hover:border-accent hover:text-ink-1 flex h-[30px] items-center gap-2 rounded-full border border-transparent pl-3 pr-1"
      >
        <Search size={13} strokeWidth={1.75} />
        搜索或跳转…
        <kbd className="bg-group text-tau-tiny text-ink-2 inline-flex h-5 items-center rounded-md px-1.5 font-mono">
          Ctrl K
        </kbd>
      </button>
      {/* 主题切换：浅色 → 深色 → 跟随系统 循环（完整外观设置在 M5 设置中心） */}
      <ThemeToggle />
      {/* Windows/Linux 三键（Mac：系统红绿灯，占位见 Sidebar）；拖拽区行为见 header 类 */}
      <div className="app-region-no-drag">{isWinOrLinux && <WindowControls />}</div>
    </header>
  );
}

/** 快捷主题切换：icon 反映当前模式，点击按 浅色 → 深色 → 跟随系统 循环。 */
function ThemeToggle() {
  const mode = useThemeStore(s => s.mode);
  const resolved = useThemeStore(s => s.resolved);
  const setMode = useThemeStore(s => s.setMode);

  const label = mode === "system" ? "跟随系统" : (getTheme(mode)?.name ?? mode);
  const Icon = mode === "system" ? Monitor : getTheme(resolved)?.mode === "dark" ? Moon : Sun;

  return (
    <div className="app-region-no-drag">
      <IconButton
        onClick={() => setMode(nextMode(mode))}
        title={`主题：${label}（点击切换）`}
        aria-label={`切换主题，当前：${label}`}
      >
        <Icon size={17} strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
