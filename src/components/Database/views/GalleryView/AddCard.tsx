import React, { memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick, theme }) => {
  return (
    <div
      className={classNames(
        "h-[240px] rounded-lg cursor-pointer transition-all duration-300 bg-transparent border-2 border-dashed flex flex-col items-center justify-center gap-2",
        {
          "border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-50/50":
            theme === "light",
          "border-[#434343] text-gray-500 hover:border-[#177ddc] hover:text-[#177ddc] hover:bg-[#177ddc]/10":
            theme === "dark",
        },
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
