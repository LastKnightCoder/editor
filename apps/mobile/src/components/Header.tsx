type HeaderProps = {
  title?: string;
  onMenuClick: () => void;
  rightAction?: React.ReactNode;
};

function IconMenu() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function Header({
  title = "卡片",
  onMenuClick,
  rightAction,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white/95 px-4 pt-safe backdrop-blur-sm dark:border-neutral-900 dark:bg-black/95">
      <button
        type="button"
        onClick={onMenuClick}
        className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        aria-label="打开菜单"
      >
        <IconMenu />
      </button>

      <h1 className="text-base font-semibold text-gray-900 dark:text-neutral-100">
        {title}
      </h1>

      <div className="flex h-10 w-10 items-center justify-center">
        {rightAction}
      </div>
    </header>
  );
}

export default Header;
