import React, { ReactNode } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatItemProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    direction: "up" | "down";
    percentage: number;
  };
  color?: string;
}

const StatItem: React.FC<StatItemProps> = ({
  icon,
  label,
  value,
  trend,
  color,
}) => {
  const themeColors = useThemeColors();

  return (
    <div className="flex items-center gap-3">
      {icon && (
        <div
          className={classNames(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            color || themeColors.iconBgClass,
          )}
        >
          <div className={classNames("text-base", themeColors.iconTextClass)}>
            {icon}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className={classNames(
            "text-sm mb-0.5",
            themeColors.secondaryTextClass,
          )}
        >
          {label}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={classNames("text-2xl font-bold", themeColors.textClass)}
          >
            {value}
          </div>
          {trend && (
            <div
              className={classNames(
                "flex items-center gap-0.5 text-xs font-medium",
                trend.direction === "up"
                  ? "text-green-500 dark:text-green-400"
                  : "text-red-500 dark:text-red-400",
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{trend.percentage}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatItem;
