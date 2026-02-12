type FloatingToolbarProps = {
  onSearchClick: () => void;
  onAddClick: () => void;
};

function IconSearch() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function FloatingToolbar({
  onSearchClick,
  onAddClick,
}: FloatingToolbarProps) {
  return (
    <nav className="fixed bottom-safe left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-950">
        {/* 搜索按钮 */}
        <button
          type="button"
          onClick={onSearchClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          aria-label="搜索"
        >
          <IconSearch />
        </button>

        {/* 添加按钮 */}
        <button
          type="button"
          onClick={onAddClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          aria-label="新建卡片"
        >
          <IconPlus />
        </button>
      </div>
    </nav>
  );
}

export default FloatingToolbar;
