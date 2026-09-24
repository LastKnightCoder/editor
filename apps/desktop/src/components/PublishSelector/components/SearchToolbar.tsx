import { memo, type ReactNode } from "react";
import clsx from "clsx";
import { RefreshCw, Search, X } from "lucide-react";
import { SelectionFilter } from "../types";

/* ── 搜索框 ─────────────────────────────────────────────── */

interface SearchInputProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  isFiltering?: boolean;
}

export const SearchInput = memo<SearchInputProps>(
  ({ query, onQueryChange, placeholder = "搜索…", isFiltering = false }) => (
    <div className="relative min-w-[180px] max-w-[360px] flex-[1_1_220px]">
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
          "focus:border-accent h-[30px] w-full rounded-[8px] border pl-8 pr-8 text-[12.5px]",
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
  )
);

SearchInput.displayName = "SearchInput";

/* ── 分段控件：全部 / 已选 / 未选 ─────────────────────────── */

const SELECTION_FILTER_OPTIONS: Array<{ value: SelectionFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "selected", label: "已选" },
  { value: "unselected", label: "未选" },
];

interface SelectionSegmentProps {
  value: SelectionFilter;
  onChange: (value: SelectionFilter) => void;
}

export const SelectionSegment = memo<SelectionSegmentProps>(({ value, onChange }) => (
  <div className="bg-hover flex shrink-0 rounded-[8px] p-[2px] text-[12px]" role="radiogroup">
    {SELECTION_FILTER_OPTIONS.map(option => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(option.value)}
          className={clsx(
            "rounded-[6px] px-[11px] py-[3px] transition-colors",
            active ? "bg-surface text-ink-1 shadow-card font-medium" : "text-ink-2 hover:text-ink-1"
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
));

SelectionSegment.displayName = "SelectionSegment";

/* ── 全选 / 取消全选（ghost） ─────────────────────────────── */

interface SelectAllButtonProps {
  allSelected: boolean;
  onClick: () => void;
}

export const SelectAllButton = memo<SelectAllButtonProps>(({ allSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-ink-2 hover:bg-hover hover:text-ink-1 h-7 shrink-0 rounded-[8px] px-[11px] text-[12.5px] transition-colors"
  >
    {allSelected ? "取消全选" : "全选"}
  </button>
));

SelectAllButton.displayName = "SelectAllButton";

/* ── 组合工具栏 ─────────────────────────────────────────── */

interface SearchToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder?: string;
  showSelectAll?: boolean;
  selectionFilter?: SelectionFilter;
  onSelectionFilterChange?: (value: SelectionFilter) => void;
  allSelected?: boolean;
  onSelectAll?: () => void;
  isFiltering?: boolean;
  /** 工具栏下方的附加行（如状态筛选） */
  children?: ReactNode;
}

export const SearchToolbar = memo<SearchToolbarProps>(
  ({
    query,
    onQueryChange,
    placeholder,
    showSelectAll = true,
    selectionFilter = "all",
    onSelectionFilterChange,
    allSelected = false,
    onSelectAll,
    isFiltering = false,
    children,
  }) => {
    return (
      <div className="shrink-0 px-4 pb-2 pt-3.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <SearchInput
            query={query}
            onQueryChange={onQueryChange}
            placeholder={placeholder}
            isFiltering={isFiltering}
          />
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {onSelectionFilterChange && (
              <SelectionSegment value={selectionFilter} onChange={onSelectionFilterChange} />
            )}
            {showSelectAll && onSelectAll && (
              <SelectAllButton allSelected={allSelected} onClick={onSelectAll} />
            )}
          </div>
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    );
  }
);

SearchToolbar.displayName = "SearchToolbar";
