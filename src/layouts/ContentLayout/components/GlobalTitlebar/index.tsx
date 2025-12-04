import { memo } from "react";
import classnames from "classnames";
import { platform } from "@/electron";
import useFullScreen from "@/hooks/useFullScreen";
import useBackgroundMode from "@/hooks/useBackgroundMode";
import CustomTrafficLights from "./CustomTrafficLights";
import WindowControls from "./WindowControls";

interface GlobalTitlebarProps {
  className?: string;
}

const GlobalTitlebar = memo(({ className }: GlobalTitlebarProps) => {
  const isFullScreen = useFullScreen();
  const isMac = platform === "darwin";
  const isWinOrLinux = platform === "win32" || platform === "linux";

  const { isGradient } = useBackgroundMode();

  // 全屏时隐藏 Titlebar（macOS 自动处理，Windows/Linux 保留）
  if (isFullScreen && isMac) {
    return null;
  }

  return (
    <div
      className={classnames(
        "w-full h-10 flex items-center justify-between shrink-0",
        "app-region-drag", // 允许拖拽窗口
        isGradient
          ? "bg-white/50 dark:bg-[#0a0a0a]/40 backdrop-blur-xl backdrop-saturate-150 border-b border-white/20 dark:border-white/10"
          : "bg-(--main-bg-color)",
        className,
      )}
    >
      {/* 左侧区域 - macOS 流量灯按钮 */}
      {isMac && (
        <div className="flex items-center app-region-no-drag">
          <CustomTrafficLights />
        </div>
      )}

      {/* 中间区域 - 拖拽区域（留空） */}
      <div className="flex-1 min-w-0" />

      {/* 右侧区域 - 全局操作 */}
      <div className="flex items-center gap-2 px-2 app-region-no-drag">
        {/* Windows/Linux 窗口控制按钮 */}
        {isWinOrLinux && <WindowControls />}
      </div>
    </div>
  );
});

GlobalTitlebar.displayName = "GlobalTitlebar";

export default GlobalTitlebar;
