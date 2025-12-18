import { memo, ReactNode } from "react";
import classnames from "classnames";
import useTheme from "@/hooks/useTheme";
import styles from "./index.module.less";

export interface ToolbarMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface ToolbarMenuProps {
  items: ToolbarMenuItem[];
  className?: string;
}

const ToolbarMenu = memo((props: ToolbarMenuProps) => {
  const { items, className } = props;
  const { isDark } = useTheme();

  return (
    <div
      className={classnames(styles.toolbarMenu, className, {
        [styles.dark]: isDark,
      })}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className={classnames(styles.menuItem, {
            [styles.disabled]: item.disabled,
          })}
          onClick={() => {
            if (!item.disabled) {
              item.onSelect();
            }
          }}
        >
          {item.icon && (
            <span className={styles.menuItemIcon}>{item.icon}</span>
          )}
          <div className={styles.menuItemContent}>
            <span className={styles.menuItemLabel}>{item.label}</span>
            {item.description && (
              <span className={styles.menuItemDescription}>
                {item.description}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

ToolbarMenu.displayName = "ToolbarMenu";

export default ToolbarMenu;
