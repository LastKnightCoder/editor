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
  const [uncontrolledKey, setUncontrolledKey] = useState<string | undefined>(computedDefault);
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
    return items.find(item => item.key === activeKey) ?? items[0];
  }, [items, activeKey]);

  useEffect(() => {
    if (!tabsRef.current || !activeKey) return;
    const activeBtn = tabsRef.current.querySelector(
      `[data-tab-key="${activeKey}"]`
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
        className="border-line-1 relative flex items-center gap-[0.125em] border-b"
      >
        {items.map(item => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              data-tab-key={item.key}
              type="button"
              className={classNames(
                "cursor-pointer border-none bg-transparent px-[0.875em] py-[0.5em] text-[0.8125em] font-medium leading-normal transition-colors duration-150",
                isActive ? "text-ink-1" : "text-ink-3 hover:text-ink-2"
              )}
              onClick={() => handleSelect(item.key)}
            >
              {item.label}
            </button>
          );
        })}
        <span
          className="bg-accent absolute bottom-0 h-[0.125em] rounded-full transition-all duration-200"
          style={indicatorStyle}
        />
      </div>
      <div
        className={classNames(
          "pt-[1em]",
          isFlat ? "" : "border-line-2 bg-surface rounded-b-[0.75em] border border-t-0 p-[1.25em]",
          panelClassName
        )}
      >
        {activeItem?.children}
      </div>
    </div>
  );
};

export default ModernTabs;
