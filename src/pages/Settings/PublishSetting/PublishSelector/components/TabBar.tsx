import { memo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { PublishContentType } from "@/types/publish";
import { TabConfig } from "../types";

interface TabBarProps {
  tabs: TabConfig[];
  activeTab: PublishContentType;
  onTabChange: (tab: PublishContentType) => void;
  getSelectedCount: (type: PublishContentType) => number;
}

export const TabBar = memo<TabBarProps>(
  ({ tabs, activeTab, onTabChange, getSelectedCount }) => {
    const themeColors = useThemeColors();

    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getSelectedCount(tab.key);

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={classNames(
                "relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border",
                isActive
                  ? [themeColors.activeClass, themeColors.activeBorderClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.cardBorderClass,
                      themeColors.hoverClass,
                      "text-gray-600 dark:text-slate-400",
                    ],
              )}
            >
              <span className="opacity-80">{tab.icon}</span>
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={classNames(
                    "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[18px] text-center",
                    isActive
                      ? "bg-white/30 dark:bg-black/20"
                      : themeColors.badgeBgClass +
                          " " +
                          themeColors.badgeTextClass,
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
  },
);

TabBar.displayName = "TabBar";
