import type { ReactNode } from "react";
import { isMac, isWinOrLinux } from "@/platform";
import { MacTrafficLights, WindowControls } from "./WindowControls";
import { useFullScreen } from "./useFullScreen";

/**
 * 辅助窗口（编辑窗口 / Markdown 窗口）标题栏：与主窗口同高（--tau-titlebar-h）、同底色、
 * 同 IconButton 体系。左：mac 自绘信号灯（全屏隐藏）· leading；右：actions · Win/Linux 三键。
 * leading 里的可交互元素须自带 app-region-no-drag。
 */
export function AuxWindowTitlebar({
  leading,
  actions,
}: {
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  const fullScreen = useFullScreen();
  return (
    <header className="app-region-drag flex h-[var(--tau-titlebar-h)] shrink-0 select-none items-center gap-2.5 pl-4 pr-3">
      {isMac && !fullScreen && <MacTrafficLights collapsed={false} />}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">{leading}</div>
      {actions && <div className="app-region-no-drag flex items-center gap-1">{actions}</div>}
      {isWinOrLinux && (
        <div className="app-region-no-drag">
          <WindowControls />
        </div>
      )}
    </header>
  );
}
