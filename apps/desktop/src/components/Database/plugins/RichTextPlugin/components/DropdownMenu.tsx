import React, { memo } from "react";
import { MdSearch, MdAdd } from "react-icons/md";
import classNames from "classnames";

interface DropdownMenuProps {
  theme: "light" | "dark";
  onLinkDocument: () => void;
  onCreateDocument: () => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = memo(
  ({ theme, onLinkDocument, onCreateDocument }) => {
    const isDark = theme === "dark";

    const menuItems = [
      {
        icon: <MdSearch className="h-4 w-4" />,
        text: "关联文档",
        onClick: onLinkDocument,
        description: "搜索并关联现有文档",
      },
      {
        icon: <MdAdd className="h-4 w-4" />,
        text: "新建文档",
        onClick: onCreateDocument,
        description: "创建新的富文本文档",
      },
    ];

    return (
      <div
        className={classNames("w-56 overflow-hidden rounded-lg border shadow-lg", {
          "border-gray-200 bg-white": !isDark,
          "border-gray-700 bg-zinc-800": isDark,
        })}
      >
        {menuItems.map((item, index) => (
          <div
            key={index}
            className={classNames(
              "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
              {
                "text-gray-700 hover:bg-gray-50": !isDark,
                "text-gray-200 hover:bg-zinc-700": isDark,
              }
            )}
            onClick={item.onClick}
          >
            <div className="text-[var(--th-accent)]">{item.icon}</div>
            <div className="flex flex-col">
              <div className="text-sm font-medium">{item.text}</div>
              <div
                className={classNames("text-xs", {
                  "text-gray-500": !isDark,
                  "text-gray-400": isDark,
                })}
              >
                {item.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
);

DropdownMenu.displayName = "DropdownMenu";

export default DropdownMenu;
