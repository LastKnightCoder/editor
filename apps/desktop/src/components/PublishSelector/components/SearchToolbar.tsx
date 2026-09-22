import { memo } from "react";
import clsx from "clsx";
import { Filter, RefreshCw, Search, X } from "lucide-react";
import { SelectionCheckbox } from "./SelectionCheckbox";

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
    placeholder = "搜索…",
    showSelectAll = true,
    showOnlySelected = true,
    onlySelected = false,
    onOnlySelectedChange,
    allSelected = false,
    onSelectAll,
    isFiltering = false,
  }) => {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-ink-3 pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
            {isFiltering ? (
              <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <Search size={14} strokeWidth={1.75} />
            )}
          </span>
          <input
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className={clsx(
              "border-line-1 bg-surface text-ink-1 placeholder:text-ink-3",
              "focus:border-accent rounded-tau-sm h-[30px] w-full border pl-8 pr-8 text-[12.5px]",
              "transition-colors focus:outline-none"
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="清空搜索"
              className="text-ink-3 hover:text-ink-1 absolute inset-y-0 right-0 flex items-center pr-2.5"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showSelectAll && onSelectAll && (
            <button
              type="button"
              onClick={onSelectAll}
              className="border-line-1 text-ink-2 hover:border-ink-3 hover:bg-hover flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
            >
              <SelectionCheckbox checked={allSelected} size="sm" interactive={false} />
              <span>{allSelected ? "取消全选" : "全选"}</span>
            </button>
          )}

          {showOnlySelected && onOnlySelectedChange && (
            <button
              type="button"
              onClick={() => onOnlySelectedChange(!onlySelected)}
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                onlySelected
                  ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                  : "border-line-1 text-ink-2 hover:border-ink-3 hover:bg-hover"
              )}
            >
              <Filter size={13} strokeWidth={1.75} />
              <span>仅显示已选</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);

SearchToolbar.displayName = "SearchToolbar";
