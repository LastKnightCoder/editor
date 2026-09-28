import React, { memo, useCallback } from "react";
import classnames from "classnames";
import { Minus, MoreHorizontal, Waves } from "lucide-react";

interface IUnderlineSelectItemProps {
  type: "color" | "lineType";
  color?: string;
  lineType?: "solid" | "dashed" | "dotted" | "wavy";
  label?: string;
  onClick: (value: any) => void;
  isSelected?: boolean;
  currentColor?: string; // 当前选中的颜色，用于线型预览
}

const getColorValue = (color: string) => {
  switch (color) {
    case "yellow":
      return "rgb(255, 212, 0)";
    case "green":
      return "rgb(42, 157, 143)";
    case "blue":
      return "rgb(162, 210, 255)";
    case "purple":
      return "rgb(94, 84, 142)";
    case "red":
      return "rgb(239, 35, 60)";
    default:
      return "currentColor";
  }
};

const UnderlineSelectItem = memo((props: IUnderlineSelectItemProps) => {
  const { type, color, lineType, label, onClick, isSelected, currentColor } = props;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (type === "color" && color) {
        onClick(color);
      } else if (type === "lineType" && lineType) {
        onClick(lineType);
      }
    },
    [type, color, lineType, onClick]
  );

  if (type === "color") {
    const isDefault = color === "default";
    return (
      <div
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        className={classnames(
          "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-transparent transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_8px_20px_rgba(15,23,42,0.15)]",
          isSelected && "border-blue-500 shadow-[0_10px_25px_rgba(59,130,246,0.35)]",
          isDefault && "border-slate-300/80 bg-white/40 dark:border-slate-600 dark:bg-zinc-800/40"
        )}
        style={{
          backgroundColor: isDefault ? undefined : getColorValue(color || ""),
        }}
        title={label}
      >
        {isDefault && <span className="text-[12px] font-semibold text-[var(--ed-text)]">A</span>}
      </div>
    );
  }

  // 线型选择项
  const lineColor = getColorValue(currentColor || "default");
  const iconSize = 16;

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={classnames(
        "flex h-8 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-200/90 bg-white/60 transition-all duration-200 dark:border-slate-600 dark:bg-zinc-900/70",
        isSelected && "border-2 border-blue-500 bg-blue-50/70 dark:bg-blue-900/30"
      )}
      title={label}
    >
      {lineType === "solid" && (
        <Minus size={iconSize} strokeWidth={2.5} style={{ color: lineColor }} />
      )}
      {lineType === "dashed" && (
        <div className="flex items-center gap-1 text-current" style={{ color: lineColor }}>
          <span className="h-0.5 w-2 rounded-sm bg-current" />
          <span className="h-0.5 w-2 rounded-sm bg-current" />
          <span className="h-0.5 w-2 rounded-sm bg-current" />
        </div>
      )}
      {lineType === "dotted" && <MoreHorizontal size={iconSize} style={{ color: lineColor }} />}
      {lineType === "wavy" && <Waves size={iconSize} style={{ color: lineColor }} />}
    </div>
  );
});

export default UnderlineSelectItem;
