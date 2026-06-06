import { Search } from "lucide-react";

interface SearchButtonProps {
  onClick: () => void;
  compact?: boolean;
}

const SearchButton = ({ onClick, compact = false }: SearchButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={
      compact
        ? "group flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
        : "group flex h-8 min-w-[176px] items-center gap-2 rounded-md border border-[var(--color-border-ring)] bg-[var(--color-bg-canvas)]/55 px-2.5 text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-border-ring-heavy)] hover:bg-[var(--color-bg-container)] hover:text-[var(--color-text-secondary)]"
    }
    aria-label="搜索"
    title="搜索"
  >
    <Search className="h-[14px] w-[14px]" aria-hidden="true" />
    {!compact && (
      <>
        <span className="min-w-0 flex-1 text-left text-xs">搜索</span>
        <kbd className="rounded border border-[var(--color-border-ring)] bg-[var(--color-bg-page)] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[var(--color-text-tertiary)]">
          Ctrl&nbsp;K
        </kbd>
      </>
    )}
  </button>
);

export default SearchButton;
