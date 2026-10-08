import React, { memo } from "react";
import { FilePlus2, Search } from "lucide-react";

interface DropdownMenuProps {
  theme: "light" | "dark";
  onLinkDocument: () => void;
  onCreateDocument: () => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = memo(({ onLinkDocument, onCreateDocument }) => {
  const menuItems = [
    {
      icon: <Search className="h-4 w-4" strokeWidth={1.75} />,
      text: "关联文档",
      onClick: onLinkDocument,
      description: "搜索并关联现有文档",
    },
    {
      icon: <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />,
      text: "新建文档",
      onClick: onCreateDocument,
      description: "创建新的富文本文档",
    },
  ];

  return (
    <div className="bg-surface shadow-float rounded-tau-md w-56 overflow-hidden py-1">
      {menuItems.map((item, index) => (
        <div
          key={index}
          className="text-ink-1 hover:bg-hover flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors"
          onClick={item.onClick}
        >
          <div className="text-accent-text">{item.icon}</div>
          <div className="flex flex-col">
            <div className="text-tau-body font-medium">{item.text}</div>
            <div className="text-tau-micro text-ink-2">{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
});

DropdownMenu.displayName = "DropdownMenu";

export default DropdownMenu;
