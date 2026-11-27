import React, { memo } from "react";
import { FilePlus2, Search } from "lucide-react";
import { useSharedDatabaseI18n } from "@/features/shared/database/i18n";

interface DropdownMenuProps {
  theme: "light" | "dark";
  onLinkDocument: () => void;
  onCreateDocument: () => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = memo(({ onLinkDocument, onCreateDocument }) => {
  const { t } = useSharedDatabaseI18n();
  const menuItems = [
    {
      icon: <Search className="h-4 w-4" strokeWidth={1.75} />,
      text: t("editor.menu.link"),
      onClick: onLinkDocument,
      description: t("editor.menu.linkHint"),
    },
    {
      icon: <FilePlus2 className="h-4 w-4" strokeWidth={1.75} />,
      text: t("editor.menu.create"),
      onClick: onCreateDocument,
      description: t("editor.menu.createHint"),
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
