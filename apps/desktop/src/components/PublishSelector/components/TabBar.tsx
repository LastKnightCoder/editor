import { memo } from "react";
import clsx from "clsx";
import { PublishContentType } from "@/types/publish";
import { TabConfig } from "../types";

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: PublishContentType;
  onTabChange: (tab: PublishContentType) => void;
  getSelectedCount: (type: PublishContentType) => number;
}

export const TabBar = memo<TabBarProps>(({ tabs, activeTab, onTabChange, getSelectedCount }) => {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {tabs.map(tab => {
        const isActive = activeTab === tab.key;
        const count = getSelectedCount(tab.key);

        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={clsx(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              isActive
                ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                : "border-line-1 text-ink-2 hover:border-ink-3 hover:bg-hover"
            )}
          >
            <tab.icon size={14} strokeWidth={1.75} />
            <span>{tab.label}</span>
            {count > 0 && (
              <span
                className={clsx(
                  "min-w-[18px] rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums",
                  isActive ? "bg-accent-soft text-accent-text" : "bg-group text-ink-3"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

TabBar.displayName = "TabBar";
