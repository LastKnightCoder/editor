import React, { memo, useCallback } from "react";
import classnames from "classnames";
import { Ban } from "lucide-react";

interface IHighlightSelectItemProps {
  label?: string;
  bgColor: string;
  onClick: (label: string | undefined) => void;
}

const HighlightSelectItem = memo((props: IHighlightSelectItemProps) => {
  const { label, bgColor, onClick } = props;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleClick = useCallback(() => {
    onClick(label);
  }, [label, onClick]);

  const isDefault = !label;

  return (
    <div
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      className={classnames(
        "w-[26px] h-[26px] rounded-lg border border-transparent flex items-center justify-center cursor-pointer transition-all duration-150 ease-out hover:scale-110 hover:shadow-[0_10px_20px_rgba(15,23,42,0.2)]",
        isDefault &&
          "bg-white/40 dark:bg-slate-800/40 border-slate-300/80 dark:border-slate-600 text-slate-400",
      )}
      style={{ backgroundColor: isDefault ? "transparent" : bgColor }}
      title={label}
    >
      {isDefault && <Ban size={14} />}
    </div>
  );
});

export default HighlightSelectItem;
