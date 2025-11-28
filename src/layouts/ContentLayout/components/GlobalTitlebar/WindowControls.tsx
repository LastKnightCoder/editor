import { memo, useState, useEffect } from "react";
import classnames from "classnames";
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
        <svg width="10" height="1" viewBox="0 0 10 1">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
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
          // Restore icon
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M2,0 L10,0 L10,8 L8,8 L8,2 L2,2 Z M0,2 L8,2 L8,10 L0,10 Z M1,3 L7,3 L7,9 L1,9 Z"
              fill="currentColor"
            />
          </svg>
        ) : (
          // Maximize icon
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M0,0 L10,0 L10,10 L0,10 Z M1,1 L9,1 L9,9 L1,9 Z"
              fill="currentColor"
            />
          </svg>
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
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path
            d="M0,0 L10,10 M10,0 L0,10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
});

WindowControls.displayName = "WindowControls";

export default WindowControls;
