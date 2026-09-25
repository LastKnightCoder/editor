import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Menu } from "@tau/ui";

import { ChromeButton } from "../../chrome";

export interface ToolMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/** 带子菜单的工具按钮：按钮右下角小三角，点开是 Menu 公共件 */
export function ToolMenu({
  label,
  icon,
  items,
  active,
}: {
  label: string;
  icon: ReactNode;
  items: ToolMenuItem[];
  active?: boolean;
}) {
  return (
    <Menu
      trigger={
        <ChromeButton label={label} sub active={active}>
          {icon}
        </ChromeButton>
      }
    >
      {items.map(({ key, label: text, icon: Icon, onSelect }) => (
        <Menu.Item key={key} icon={<Icon size={15} strokeWidth={1.75} />} onSelect={onSelect}>
          {text}
        </Menu.Item>
      ))}
    </Menu>
  );
}
