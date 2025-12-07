import { memo, useState } from "react";
import classnames from "classnames";
import { X, Minus, Maximize2 } from "lucide-react";
import { minimizeWindow, toggleFullScreen, closeWindow } from "@/commands";

const CustomTrafficLights = memo(() => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2 pl-3 pr-2 h-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Close - 红色 */}
      <button
        className={classnames(
          "w-3 h-3 rounded-full flex items-center justify-center",
          "bg-[#FF5F57] hover:bg-[#FF5F57]/90 transition-colors",
          "cursor-default border-0 outline-none",
        )}
        onClick={closeWindow}
        title="关闭"
      >
        {isHovered && <X className="w-2 h-2 text-[#7A0C00]" strokeWidth={3} />}
      </button>

      {/* Minimize - 黄色 */}
      <button
        className={classnames(
          "w-3 h-3 rounded-full flex items-center justify-center",
          "bg-[#FEBC2E] hover:bg-[#FEBC2E]/90 transition-colors",
          "cursor-default border-0 outline-none",
        )}
        onClick={minimizeWindow}
        title="最小化"
      >
        {isHovered && (
          <Minus className="w-2 h-2 text-[#7A5400]" strokeWidth={3} />
        )}
      </button>

      {/* Fullscreen/Zoom - 绿色 */}
      <button
        className={classnames(
          "w-3 h-3 rounded-full flex items-center justify-center",
          "bg-[#28C840] hover:bg-[#28C840]/90 transition-colors",
          "cursor-default border-0 outline-none",
        )}
        onClick={toggleFullScreen}
        title="全屏"
      >
        {isHovered && (
          <Maximize2
            className="w-[7px] h-[7px] text-[#006500]"
            strokeWidth={2}
          />
        )}
      </button>
    </div>
  );
});

CustomTrafficLights.displayName = "CustomTrafficLights";

export default CustomTrafficLights;
