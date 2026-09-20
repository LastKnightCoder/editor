import { memo, useState } from "react";
import classnames from "classnames";
import { X, Minus, Maximize2 } from "lucide-react";
import { minimizeWindow, toggleFullScreen, closeWindow } from "@/commands";

const CustomTrafficLights = memo(() => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex h-full items-center gap-2 pl-3 pr-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Close - 红色 */}
      <button
        className={classnames(
          "flex h-3 w-3 items-center justify-center rounded-full",
          "bg-[#FF5F57] transition-colors hover:bg-[#FF5F57]/90",
          "cursor-default border-0 outline-none"
        )}
        onClick={closeWindow}
        title="关闭"
      >
        {isHovered && <X className="h-2 w-2 text-[#7A0C00]" strokeWidth={3} />}
      </button>

      {/* Minimize - 黄色 */}
      <button
        className={classnames(
          "flex h-3 w-3 items-center justify-center rounded-full",
          "bg-[#FEBC2E] transition-colors hover:bg-[#FEBC2E]/90",
          "cursor-default border-0 outline-none"
        )}
        onClick={minimizeWindow}
        title="最小化"
      >
        {isHovered && <Minus className="h-2 w-2 text-[#7A5400]" strokeWidth={3} />}
      </button>

      {/* Fullscreen/Zoom - 绿色 */}
      <button
        className={classnames(
          "flex h-3 w-3 items-center justify-center rounded-full",
          "bg-[#28C840] transition-colors hover:bg-[#28C840]/90",
          "cursor-default border-0 outline-none"
        )}
        onClick={toggleFullScreen}
        title="全屏"
      >
        {isHovered && <Maximize2 className="h-[7px] w-[7px] text-[#006500]" strokeWidth={2} />}
      </button>
    </div>
  );
});

CustomTrafficLights.displayName = "CustomTrafficLights";

export default CustomTrafficLights;
