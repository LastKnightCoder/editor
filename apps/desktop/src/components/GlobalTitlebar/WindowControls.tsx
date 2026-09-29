import { memo, useState, useEffect } from "react";
import classnames from "classnames";
import { Minus, Square, Copy, X } from "lucide-react";
import { platform } from "@/platform";
import { minimizeWindow, maximizeWindow, closeWindow } from "@/commands";
import useThemeColors from "@/hooks/useThemeColors";

const WindowControls = memo(() => {
  const [isMaximized, setIsMaximized] = useState(false);
  const themeColors = useThemeColors();
  const iconHoverClass =
    themeColors.hoverClass || "group-hover:bg-gray-200 dark:group-hover:bg-zinc-700";
  const baseButtonClasses = classnames(
    "group w-12 h-10 flex items-center justify-center border-0 outline-none bg-transparent cursor-default transition-colors",
    "text-gray-700 dark:text-gray-300"
  );
  const baseIconContainerClasses = classnames(
    "flex items-center justify-center rounded-full w-7 h-7 transition-colors text-current"
  );
  const iconContainerClasses = classnames(baseIconContainerClasses, iconHoverClass);
  const closeIconContainerClasses = classnames(
    baseIconContainerClasses,
    "group-hover:text-white group-hover:bg-red-500/90 dark:group-hover:bg-red-600/90"
  );

  useEffect(() => {
    // 监听窗口最大化/还原事件
    return platform.window.onMaximizedChange(setIsMaximized);
  }, []);

  return (
    <div className="flex h-full items-center">
      {/* Minimize */}
      <button className={baseButtonClasses} onClick={minimizeWindow} title="最小化">
        <span className={iconContainerClasses}>
          <Minus className="h-3 w-3" strokeWidth={2} />
        </span>
      </button>

      {/* Maximize/Restore */}
      <button
        className={baseButtonClasses}
        onClick={maximizeWindow}
        title={isMaximized ? "还原" : "最大化"}
      >
        <span className={iconContainerClasses}>
          {isMaximized ? (
            <Copy className="h-3 w-3" strokeWidth={2} />
          ) : (
            <Square className="h-3 w-3" strokeWidth={2} />
          )}
        </span>
      </button>

      {/* Close */}
      <button className={classnames(baseButtonClasses, "group")} onClick={closeWindow} title="关闭">
        <span className={closeIconContainerClasses}>
          <X className="h-3 w-3" strokeWidth={2} />
        </span>
      </button>
    </div>
  );
});

WindowControls.displayName = "WindowControls";

export default WindowControls;
