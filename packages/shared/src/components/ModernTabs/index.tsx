import React, { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";

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
  isDark: _isDark = false,
}) => {
  const computedDefault = defaultActiveKey ?? items[0]?.key;
  const [uncontrolledKey, setUncontrolledKey] = useState<string | undefined>(
    computedDefault,
  );
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

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

  useEffect(() => {
    if (!tabsRef.current || !activeKey) return;
    const activeBtn = tabsRef.current.querySelector(
      `[data-tab-key="${activeKey}"]`,
    ) as HTMLElement | null;
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeKey, items]);

  const handleSelect = (key: string) => {
    if (!controlledKey) {
      setUncontrolledKey(key);
    }
    onChange?.(key);
  };

  if (!items.length) {
    return null;
  }

  const isFlat = variant === "flat";

  return (
    <div className={classNames("flex flex-col", className)}>
      <div
        ref={tabsRef}
        className="relative flex items-center gap-[0.125em] border-b border-gray-200 dark:border-zinc-700"
      >
        {items.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              data-tab-key={item.key}
              type="button"
              className={classNames(
                "px-[0.875em] py-[0.5em] text-[0.8125em] font-medium cursor-pointer transition-colors duration-150 border-none bg-transparent leading-normal",
                isActive ? "text-text-1" : "text-text-3 hover:text-text-2",
              )}
              onClick={() => handleSelect(item.key)}
            >
              {item.label}
            </button>
          );
        })}
        <span
          className="absolute bottom-0 h-[0.125em] bg-[var(--th-btn-bg,var(--color-primary))] rounded-full transition-all duration-200"
          style={indicatorStyle}
        />
      </div>
      <div
        className={classNames(
          "pt-[1em]",
          isFlat
            ? ""
            : "border border-t-0 border-[var(--color-border-secondary,#f0f0f0)] rounded-b-[0.75em] p-[1.25em] bg-bg-elevated dark:border-[var(--color-border-primary,#2a2a2a)] dark:bg-[#222]",
          panelClassName,
        )}
      >
        {activeItem?.children}
      </div>
    </div>
  );
};

export default ModernTabs;
