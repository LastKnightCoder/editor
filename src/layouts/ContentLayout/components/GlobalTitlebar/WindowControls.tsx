import { memo, useState, useEffect } from "react";
import classnames from "classnames";
import { Minus, Square, Copy, X } from "lucide-react";
import { on, off } from "@/electron";
import { minimizeWindow, maximizeWindow, closeWindow } from "@/commands";

const WindowControls = memo(() => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // 监听窗口最大化/还原事件
    const handleMaximize = () => setIsMaximized(true);
    const handleUnmaximize = () => setIsMaximized(false);

    on("window-maximized", handleMaximize);
    on("window-unmaximized", handleUnmaximize);

    return () => {
      off("window-maximized", handleMaximize);
      off("window-unmaximized", handleUnmaximize);
    };
  }, []);

  return (
    <div className="flex items-center h-full">
      {/* Minimize */}
      <button
        className={classnames(
          "w-12 h-10 flex items-center justify-center",
          "hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
          "text-gray-700 dark:text-gray-300",
          "border-0 outline-none bg-transparent cursor-default",
        )}
        onClick={minimizeWindow}
        title="最小化"
      >
        <Minus className="w-3 h-3" strokeWidth={2} />
      </button>

      {/* Maximize/Restore */}
      <button
        className={classnames(
          "w-12 h-10 flex items-center justify-center",
          "hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
          "text-gray-700 dark:text-gray-300",
          "border-0 outline-none bg-transparent cursor-default",
        )}
        onClick={maximizeWindow}
        title={isMaximized ? "还原" : "最大化"}
      >
        {isMaximized ? (
          <Copy className="w-3 h-3" strokeWidth={2} />
        ) : (
          <Square className="w-3 h-3" strokeWidth={2} />
        )}
      </button>

      {/* Close */}
      <button
        className={classnames(
          "w-12 h-10 flex items-center justify-center",
          "hover:bg-[#E81123] hover:text-white transition-colors",
          "text-gray-700 dark:text-gray-300",
          "border-0 outline-none bg-transparent cursor-default",
        )}
        onClick={closeWindow}
        title="关闭"
      >
        <X className="w-3 h-3" strokeWidth={2} />
      </button>
    </div>
  );
});

WindowControls.displayName = "WindowControls";

export default WindowControls;
