import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { isMac, isWinOrLinux } from "@/platform";
import { MacTrafficLights, WindowControls } from "@/app/WindowControls";
import { useFullScreen } from "@/app/useFullScreen";

/**
 * 编辑窗口标题栏：与主窗口同高（--tau-titlebar-h）、同底色、同 IconButton 体系。
 * 左：mac 自绘信号灯（全屏隐藏）· 类型徽标 · 标题；右：调用方传入的操作 · Win/Linux 三键。
 */
export function EditorWindowTitlebar({
  icon: Icon,
  label,
  title,
  children,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  children?: ReactNode;
}) {
  const fullScreen = useFullScreen();
  return (
    <header className="app-region-drag flex h-[var(--tau-titlebar-h)] shrink-0 select-none items-center gap-2.5 pl-4 pr-3">
      {isMac && !fullScreen && <MacTrafficLights collapsed={false} />}
      <span className="rounded-tau-sm bg-hover text-tau-micro text-ink-2 flex h-[22px] shrink-0 items-center gap-1 px-2">
        <Icon className="size-3" strokeWidth={1.75} />
        {label}
      </span>
      <span className="text-tau-meta text-ink-1 min-w-0 truncate font-medium">{title}</span>
      <div className="flex-1" />
      <div className="app-region-no-drag flex items-center gap-1">{children}</div>
      {isWinOrLinux && (
        <div className="app-region-no-drag">
          <WindowControls />
        </div>
      )}
    </header>
  );
}
