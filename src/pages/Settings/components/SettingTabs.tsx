import React from "react";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface SettingTabsProps {
  activeKey: string;
  onChange: (key: string) => void;
  items: TabItem[];
  className?: string;
}

const SettingTabs: React.FC<SettingTabsProps> = ({
  activeKey,
  onChange,
  items,
  className = "",
}) => {
  const themeColors = useThemeColors();

  return (
    <div className={`flex gap-2 mb-4 flex-wrap ${className}`}>
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className={classNames(
            "px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 border",
            activeKey === item.key
              ? [
                  themeColors.activeClass,
                  themeColors.activeTextClass,
                  themeColors.activeBorderClass,
                ]
              : [
                  themeColors.cardBgClass,
                  "text-gray-600 dark:text-slate-400",
                  themeColors.cardBorderClass,
                  themeColors.hoverClass,
                ],
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default SettingTabs;
