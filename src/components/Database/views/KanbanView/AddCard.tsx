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
        "flex items-center justify-center gap-2 h-10 rounded-lg cursor-pointer transition-colors border-2 border-dashed",
        themeColors.borderClass,
        themeColors.hoverBorderClass,
        themeColors.hoverClass,
        themeColors.secondaryTextClass,
      )}
    >
      <MdAdd className="text-lg" />
      <span className="text-sm">添加卡片</span>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
