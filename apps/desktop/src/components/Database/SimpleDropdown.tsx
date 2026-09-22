import { memo, ReactElement } from "react";
import { Menu } from "@tau/ui";

interface DropdownItem {
  key: string;
  label: React.ReactNode;
}

interface SimpleDropdownProps {
  items: DropdownItem[];
  onSelect: (key: string) => void;
  /** 触发器（单一元素，透传 props/ref 供 Menu 克隆注入开合事件） */
  children: ReactElement;
  className?: string;
}

const SimpleDropdown = memo<SimpleDropdownProps>(({ items, onSelect, children, className }) => (
  <Menu trigger={children} className={className}>
    {items.map(item => (
      <Menu.Item key={item.key} onSelect={() => onSelect(item.key)}>
        {item.label}
      </Menu.Item>
    ))}
  </Menu>
));

SimpleDropdown.displayName = "SimpleDropdown";

export default SimpleDropdown;
