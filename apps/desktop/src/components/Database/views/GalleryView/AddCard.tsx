import React, { memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import useThemeColors from "@/hooks/useThemeColors";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick }) => {
  const themeColors = useThemeColors();

  return (
    <div
      className={classNames(
        "h-[240px] rounded-lg cursor-pointer transition-all duration-300 bg-transparent border-2 border-dashed flex flex-col items-center justify-center gap-2",
        themeColors.borderClass,
        themeColors.secondaryTextClass,
        themeColors.hoverBorderClass,
        themeColors.hoverTextClass,
      )}
      onClick={onClick}
    >
      <div className="text-5xl flex items-center justify-center">
        <MdAdd />
      </div>
      <div className="text-sm font-medium">新页面</div>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
