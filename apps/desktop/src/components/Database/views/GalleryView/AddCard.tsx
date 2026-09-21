import React, { memo } from "react";
import { Plus } from "lucide-react";

interface AddCardProps {
  onClick: () => void;
  theme: "light" | "dark";
}

const AddCard: React.FC<AddCardProps> = memo(({ onClick }) => {
  return (
    <div
      className="border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1 hover:bg-hover rounded-tau-md flex h-[240px] cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed bg-transparent transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-center">
        <Plus className="size-8" strokeWidth={1.75} />
      </div>
      <div className="text-tau-sm font-medium">新页面</div>
    </div>
  );
});

AddCard.displayName = "AddCard";

export default AddCard;
