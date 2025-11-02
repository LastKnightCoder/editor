import React, { memo } from "react";
import { MdAdd } from "react-icons/md";
import classnames from "classnames";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick, theme }) => {
  return (
    <div
      onClick={onClick}
      className={classnames(
        "flex items-center justify-center gap-2 h-10 rounded-lg cursor-pointer transition-colors border-2 border-dashed",
        {
          "border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-500":
            theme === "light",
          "border-gray-600 hover:border-gray-500 hover:bg-gray-800 text-gray-400":
            theme === "dark",
        },
      )}
    >
      <MdAdd className="text-lg" />
      <span className="text-sm">添加卡片</span>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
