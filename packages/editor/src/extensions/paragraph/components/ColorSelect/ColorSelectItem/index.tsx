import React, { memo, useCallback } from "react";
import { Tooltip } from "antd";
import classnames from "classnames";
import type { TextGradientPresetId } from "../../../../../constants";

interface IColorSelectItemProps {
  isDark: boolean;
  label?: string;
  lightColor?: string;
  darkColor?: string;
  gradientPreset?: TextGradientPresetId;
  gradientPreview?: string;
  onClick: (color?: string, darkColor?: string, gradientPreset?: TextGradientPresetId) => void;
}

const ColorSelectItem = memo((props: IColorSelectItemProps) => {
  const { label, lightColor, darkColor, gradientPreset, gradientPreview, onClick, isDark } = props;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(() => {
    onClick(lightColor, darkColor, gradientPreset);
  }, [lightColor, darkColor, gradientPreset, onClick]);

  const color = isDark ? darkColor : lightColor;
  const isDefault = !lightColor && !darkColor && !gradientPreset;
  const isGradient = Boolean(gradientPreset);

  return (
    <Tooltip title={label} key={label} placement="bottom">
      <div
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={classnames(
          "flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full border border-transparent transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_10px_25px_rgba(15,23,42,0.2)]",
          isDefault && "border-slate-300/80 bg-white/40 dark:border-slate-600 dark:bg-zinc-800/40",
          isGradient && "border-white/70 dark:border-slate-700/80"
        )}
        style={
          isDefault
            ? undefined
            : isGradient
              ? { background: gradientPreview }
              : { backgroundColor: color }
        }
      >
        {isDefault && <span className="text-[12px] font-semibold text-[var(--ed-text)]">A</span>}
      </div>
    </Tooltip>
  );
});

export default ColorSelectItem;
