import React, { memo, useCallback } from "react";
import { Tooltip } from "antd";
import classnames from "classnames";

interface IColorSelectItemProps {
  isDark: boolean;
  label?: string;
  lightColor?: string;
  darkColor?: string;
  onClick: (color?: string, darkColor?: string) => void;
}

const ColorSelectItem = memo((props: IColorSelectItemProps) => {
  const { label, lightColor, darkColor, onClick, isDark } = props;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(() => {
    onClick(lightColor, darkColor);
  }, [lightColor, darkColor, onClick]);

  const color = isDark ? darkColor : lightColor;
  const isDefault = !lightColor && !darkColor;

  return (
    <Tooltip title={label} key={label} placement="bottom">
      <div
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={classnames(
          "w-[26px] h-[26px] rounded-full border border-transparent flex items-center justify-center cursor-pointer transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_10px_25px_rgba(15,23,42,0.2)]",
          isDefault &&
            "bg-white/40 dark:bg-slate-800/40 border-slate-300/80 dark:border-slate-600",
        )}
        style={{ backgroundColor: isDefault ? undefined : color }}
      >
        {isDefault && (
          <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-200">
            A
          </span>
        )}
      </div>
    </Tooltip>
  );
});

export default ColorSelectItem;
