import React, { ReactNode } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface StatCardProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  icon,
  children,
  onClick,
  className,
}) => {
  const themeColors = useThemeColors();

  return (
    <div
      onClick={onClick}
      className={classNames(
        "rounded-2xl border backdrop-blur-sm backdrop-saturate-150 shadow-md transition-all p-6",
        themeColors.glassPanelBg,
        themeColors.cardBorderClass,
        onClick && "cursor-pointer hover:shadow-lg hover:-translate-y-0.5",
        className,
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        {icon && (
          <div
            className={classNames(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              themeColors.iconBgClass,
            )}
          >
            <div className={classNames("text-sm", themeColors.iconTextClass)}>
              {icon}
            </div>
          </div>
        )}
        <h3
          className={classNames(
            "text-base font-semibold",
            themeColors.textClass,
          )}
        >
          {title}
        </h3>
      </div>
      <div>{children}</div>
    </div>
  );
};

export default StatCard;
