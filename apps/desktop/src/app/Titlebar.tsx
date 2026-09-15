/**
 * 标题栏 —— 类名与结构 1:1 对齐 A2 模板。右列专属，不横贯全宽。
 */

import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { isWinOrLinux } from "@/platform";
import { useSurface } from "@/surface/SurfaceProvider";
import { getSurfaceMeta } from "@/surface/core/surfaceMeta";
import { isEditableTarget } from "@/surface/dom";
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
    <header className="titlebar app-region-drag">
      <div className="app-region-no-drag flex items-center gap-2.5">
        <button
          type="button"
          className="icon-btn"
          onClick={() => navigator.back()}
          disabled={!canBack}
          title="后退 (Alt+←)"
          aria-label="后退"
        >
          <ArrowLeft size={17} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => navigator.forward()}
          disabled={!canForward}
          title="前进 (Alt+→)"
          aria-label="前进"
        >
          <ArrowRight size={17} strokeWidth={1.75} />
        </button>
      </div>
      <span className="titlebar-crumb" id="crumb">
        · {crumb}
      </span>

      <div className="titlebar-spacer" />
      {/* 全局搜索（Ctrl+K 命令面板待接入——03 指南剩余任务） */}
      <button
        type="button"
        className="kbd-pill app-region-no-drag"
        id="palette-open-btn"
        title="搜索或跳转（命令面板待接入）"
      >
        <Search size={13} strokeWidth={1.75} />
        搜索或跳转…
        <kbd>Ctrl K</kbd>
      </button>
      {/* Windows/Linux 三键（Mac：系统红绿灯，不渲染）；拖拽区行为见 titlebar 类 */}
      <div className="app-region-no-drag">{isWinOrLinux && <WindowControls />}</div>
    </header>
  );
}
