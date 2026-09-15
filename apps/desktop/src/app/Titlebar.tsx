/**
 * 标题栏 —— 右列专属，不横贯全宽；样式 Tailwind 优先（D-013）。
 */

import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { isWinOrLinux } from "@/platform";
import { useSurface } from "@/surface/SurfaceProvider";
import { getSurfaceMeta } from "@/surface/core/surfaceMeta";
import { isEditableTarget } from "@/surface/dom";
import { IconButton } from "@/ui/primitives/IconButton";
import { WindowControls } from "./WindowControls";

export function Titlebar() {
  const { navigator, state } = useSurface();

  // Alt+←/→ 全局键盘导航（Esc 在 SurfaceProvider 内处理）；
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
  const crumb = currentKey ? (getSurfaceMeta(currentKey)?.label ?? currentKey) : "";
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
      <span className="text-tau-meta text-ink-2">· {crumb}</span>

      <div className="flex-1" />
      {/* 全局搜索（Ctrl+K 命令面板待接入——03 指南剩余任务） */}
      <button
        type="button"
        title="搜索或跳转（命令面板待接入）"
        className="app-region-no-drag bg-surface text-tau-sm text-ink-2 shadow-card hover:text-ink-1 flex h-[30px] items-center gap-2 rounded-full pl-3 pr-1"
      >
        <Search size={13} strokeWidth={1.75} />
        搜索或跳转…
        <kbd className="bg-group text-tau-tiny text-ink-2 inline-flex h-5 items-center rounded-md px-1.5 font-mono">
          Ctrl K
        </kbd>
      </button>
      {/* Windows/Linux 三键（Mac：系统红绿灯，占位见 Sidebar）；拖拽区行为见 header 类 */}
      <div className="app-region-no-drag">{isWinOrLinux && <WindowControls />}</div>
    </header>
  );
}
