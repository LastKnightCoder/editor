import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";

import styles from "./index.module.less";

export interface ModernTabItem {
  key: string;
  label: React.ReactNode;
  children: React.ReactNode;
}

interface ModernTabsProps {
  items: ModernTabItem[];
  defaultActiveKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  className?: string;
  variant?: "elevated" | "flat";
  panelClassName?: string;
  isDark?: boolean;
}

const ModernTabs: React.FC<ModernTabsProps> = ({
  items,
  defaultActiveKey,
  activeKey: controlledKey,
  onChange,
  className,
  variant = "elevated",
  panelClassName,
  isDark = false,
}) => {
  const computedDefault = defaultActiveKey ?? items[0]?.key;
  const [uncontrolledKey, setUncontrolledKey] = useState<string | undefined>(
    computedDefault,
  );

  useEffect(() => {
    if (computedDefault) {
      setUncontrolledKey(computedDefault);
    }
  }, [computedDefault]);

  const activeKey = controlledKey ?? uncontrolledKey;

  const activeItem = useMemo(() => {
    if (!items.length) return undefined;
    return items.find((item) => item.key === activeKey) ?? items[0];
  }, [items, activeKey]);

  const handleSelect = (key: string) => {
    if (!controlledKey) {
      setUncontrolledKey(key);
    }
    onChange?.(key);
  };

  if (!items.length) {
    return null;
  }

  return (
    <div
      className={classNames(styles.tabs, className, {
        [styles.dark]: isDark,
      })}
    >
      <div className={styles.tabList}>
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              type="button"
              className={classNames(styles.tabTrigger, {
                [styles.active]: isActive,
              })}
              onClick={() => handleSelect(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        className={classNames(
          styles.tabPanel,
          variant === "elevated" && styles.tabPanelElevated,
          panelClassName,
          {
            [styles.tabPanelDark]: isDark,
          },
        )}
      >
        {activeItem?.children}
      </div>
    </div>
  );
};

export default ModernTabs;
