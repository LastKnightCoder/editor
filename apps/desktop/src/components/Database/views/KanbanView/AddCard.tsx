import React, { memo } from "react";
import { MdAdd } from "react-icons/md";
import classnames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick }) => {
  const themeColors = useThemeColors();

  return (
    <div
      onClick={onClick}
      className={classnames(
        "group flex items-center justify-center gap-2 h-10 rounded-xl cursor-pointer transition-all border-2 border-dashed shadow-sm hover:shadow-md hover:-translate-y-[1px]",
        "bg-white/35 dark:bg-black/20",
        themeColors.borderClass,
        themeColors.hoverBorderClass,
        themeColors.hoverClass,
        themeColors.secondaryTextClass,
      )}
    >
      <div className="w-5 h-5 rounded-full bg-black/6 dark:bg-white/10 flex items-center justify-center transition-colors group-hover:bg-black/10 dark:group-hover:bg-white/15">
        <MdAdd className="text-sm" />
      </div>
      <span className="text-sm">添加卡片</span>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
