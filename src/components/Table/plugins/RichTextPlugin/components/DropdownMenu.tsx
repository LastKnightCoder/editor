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
        icon: <MdSearch className="w-4 h-4" />,
        text: "关联文档",
        onClick: onLinkDocument,
        description: "搜索并关联现有文档",
      },
      {
        icon: <MdAdd className="w-4 h-4" />,
        text: "新建文档",
        onClick: onCreateDocument,
        description: "创建新的富文本文档",
      },
    ];

    return (
      <div
        className={classNames(
          "w-56 rounded-lg shadow-lg border overflow-hidden",
          {
            "bg-white border-gray-200": !isDark,
            "bg-gray-800 border-gray-700": isDark,
          },
        )}
      >
        {menuItems.map((item, index) => (
          <div
            key={index}
            className={classNames(
              "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
              {
                "hover:bg-gray-50 text-gray-700": !isDark,
                "hover:bg-gray-700 text-gray-200": isDark,
              },
            )}
            onClick={item.onClick}
          >
            <div
              className={classNames("text-blue-500", {
                "text-blue-400": isDark,
              })}
            >
              {item.icon}
            </div>
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
  },
);

DropdownMenu.displayName = "DropdownMenu";

export default DropdownMenu;
