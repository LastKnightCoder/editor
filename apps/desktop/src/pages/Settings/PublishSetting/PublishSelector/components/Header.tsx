import { memo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface HeaderProps {
  totalSelected: number;
}

export const Header = memo<HeaderProps>(({ totalSelected }) => {
  const themeColors = useThemeColors();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h3
          className={classNames(
            "text-base font-semibold",
            themeColors.activeTextClass,
          )}
        >
          发布内容选择
        </h3>
        <p
          className={classNames("text-xs mt-1", themeColors.secondaryTextClass)}
        >
          选择需要发布的卡片、文章、项目和知识库
        </p>
      </div>
      <div
        className={classNames(
          "rounded-full px-4 py-1.5 text-xs font-medium",
          themeColors.tagBgClass,
          themeColors.tagTextClass,
        )}
      >
        已选择 {totalSelected} 项
      </div>
    </header>
  );
});

Header.displayName = "Header";
