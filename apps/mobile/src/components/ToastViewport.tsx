import { ToastHost } from "@tau/ui";

/** 全局提示：顶栏下方的深色胶囊，层级低于开发面板、高于弹层（Z_INDEX.TOAST） */
export function ToastViewport() {
  return (
    <div data-no-tab-swipe className="contents">
      <ToastHost
        variant="inverse"
        zoneClassName="top-[calc(var(--mobile-safe-top)+var(--mobile-nav-row-height)+8px)] z-[80] gap-2"
      />
    </div>
  );
}

export default ToastViewport;
