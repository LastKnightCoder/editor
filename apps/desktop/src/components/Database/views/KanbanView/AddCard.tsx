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
      className="border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1 rounded-tau-md group flex h-10 cursor-pointer items-center justify-center gap-2 border-2 border-dashed transition-colors"
    >
      <div className="bg-group group-hover:bg-hover flex size-5 items-center justify-center rounded-full transition-colors">
        <Plus className="size-3.5" strokeWidth={1.75} />
      </div>
      <span className="text-tau-sm">添加卡片</span>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
