import React, { memo } from "react";
import { Plus } from "lucide-react";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="text-ink-3 hover:bg-hover hover:text-ink-1 active:bg-press rounded-tau-md ease-tau-out flex h-9 cursor-pointer items-center justify-center gap-1.5 transition-colors duration-[160ms]"
    >
      <Plus className="size-3.5" strokeWidth={1.75} />
      <span className="text-tau-sm">添加卡片</span>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
