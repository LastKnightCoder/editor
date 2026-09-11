import { memo, ReactNode } from "react";
import classnames from "classnames";
import { isMac, isWinOrLinux } from "@/platform";
import useFullScreen from "@/hooks/useFullScreen";
import CustomTrafficLights from "./CustomTrafficLights";
import WindowControls from "./WindowControls";

interface GlobalTitlebarProps {
  className?: string;
  children?: ReactNode;
  title?: string;
}

const GlobalTitlebar = memo(({ className, children, title }: GlobalTitlebarProps) => {
  const isFullScreen = useFullScreen();

  // 全屏时隐藏 Titlebar（macOS 自动处理，Windows/Linux 保留）
  if (isFullScreen && isMac) {
    return null;
  }

  return (
    <div
      className={classnames(
        "flex h-10 w-full shrink-0 items-center justify-between",
        "app-region-drag", // 允许拖拽窗口
        "border-b border-[var(--th-border)] bg-[var(--th-card-bg)]",
        className
      )}
    >
      {/* 左侧区域 - macOS 流量灯按钮 */}
      {isMac && (
        <div className="app-region-no-drag flex items-center">
          <CustomTrafficLights />
        </div>
      )}

      {/* 中间区域 - 标题或拖拽区域 */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        {title && (
          <div className="truncate text-sm font-semibold text-[var(--th-text)]">{title}</div>
        )}
      </div>

      {/* 右侧区域 - 全局操作 */}
      <div className="app-region-no-drag flex items-center gap-2 px-2">
        {/* 自定义内容 */}
        {children}
        {/* Windows/Linux 窗口控制按钮 */}
        {isWinOrLinux && <WindowControls />}
      </div>
    </div>
  );
});

GlobalTitlebar.displayName = "GlobalTitlebar";

export default GlobalTitlebar;
