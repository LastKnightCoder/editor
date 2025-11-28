import { useEffect, useRef, memo } from "react";
import { ChevronRight } from "lucide-react";

import { IBlockPanelListItem } from "@/components/Editor/types";

interface IItemProps {
  item: IBlockPanelListItem;
  active: boolean;
  onClick?: () => void;
}

const Item = memo((props: IItemProps) => {
  const { item, active, onClick } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) {
      // 滚动到可视区域
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, [active]);

  const hasChildren = item.children && item.children.length > 0;
  const IconComponent = item.icon;

  return (
    <div
      onClick={onClick}
      ref={ref}
      className={`h-9 flex items-center px-3 mx-2 mb-1 last:mb-0 rounded-lg cursor-pointer transition-all duration-150 text-sm font-normal leading-normal border ${
        active
          ? "bg-white/70 dark:bg-white/25 text-blue-600 dark:text-blue-200 border-white/50 dark:border-white/30"
          : "text-gray-700 dark:text-gray-200 hover:bg-white/40 dark:hover:bg-white/8 border-transparent"
      }`}
    >
      <IconComponent className="w-4 h-4 mr-2 flex-shrink-0" />
      <div className="truncate flex-1">{item.title}</div>
      {hasChildren && (
        <ChevronRight className="w-4 h-4 ml-2 flex-shrink-0 opacity-50" />
      )}
    </div>
  );
});

export default Item;
