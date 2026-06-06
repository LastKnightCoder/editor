import { memo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";

interface SearchToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  showSelectAll?: boolean;
  showOnlySelected?: boolean;
  onlySelected?: boolean;
  onOnlySelectedChange?: (value: boolean) => void;
  allSelected?: boolean;
  onSelectAll?: () => void;
  isFiltering?: boolean;
}

export const SearchToolbar = memo<SearchToolbarProps>(
  ({
    query,
    onQueryChange,
    placeholder = "搜索...",
    showSelectAll = true,
    showOnlySelected = true,
    onlySelected = false,
    onOnlySelectedChange,
    allSelected = false,
    onSelectAll,
    isFiltering = false,
  }) => {
    const themeColors = useThemeColors();

    return (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className={classNames(
                "w-4 h-4",
                isFiltering ? "animate-spin" : "",
                themeColors.secondaryTextClass,
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isFiltering ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              )}
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className={classNames(
              "w-full pl-10 pr-4 py-2 rounded-lg border text-sm transition-colors",
              "bg-zinc-50 dark:bg-zinc-800/80",
              "border-zinc-200 dark:border-zinc-700/80",
              themeColors.textClass,
              "placeholder:text-gray-400 dark:placeholder:text-gray-500",
              "focus:outline-none",
              themeColors.focusRingClass,
            )}
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              className={classNames(
                "absolute inset-y-0 right-0 pr-3 flex items-center",
                themeColors.secondaryTextClass,
                "hover:text-gray-600 dark:hover:text-gray-300",
              )}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          {showSelectAll && onSelectAll && (
            <button
              onClick={onSelectAll}
              className={classNames(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                themeColors.cardBgClass,
                themeColors.cardBorderClass,
                themeColors.hoverClass,
                themeColors.textClass,
              )}
            >
              <CheckboxIcon checked={allSelected} />
              <span>{allSelected ? "取消全选" : "全选"}</span>
            </button>
          )}

          {showOnlySelected && onOnlySelectedChange && (
            <button
              onClick={() => onOnlySelectedChange(!onlySelected)}
              className={classNames(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                onlySelected
                  ? [themeColors.activeClass, themeColors.activeBorderClass]
                  : [
                      themeColors.cardBgClass,
                      themeColors.cardBorderClass,
                      themeColors.hoverClass,
                      themeColors.textClass,
                    ],
              )}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              <span>仅显示已选</span>
            </button>
          )}
        </div>
      </div>
    );
  },
);

SearchToolbar.displayName = "SearchToolbar";

const CheckboxIcon = memo<{ checked: boolean }>(({ checked }) => {
  const themeColors = useThemeColors();

  return (
    <div
      className={classNames(
        "w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
        checked
          ? [themeColors.buttonBg, "border-transparent"]
          : ["border-gray-300 dark:border-gray-600"],
      )}
    >
      {checked && (
        <svg
          className="w-2.5 h-2.5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
    </div>
  );
});

CheckboxIcon.displayName = "CheckboxIcon";
