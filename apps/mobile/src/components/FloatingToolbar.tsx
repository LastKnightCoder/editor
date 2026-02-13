import { Plus, Search, Settings } from "lucide-react";

type FloatingToolbarProps = {
  onSearchClick: () => void;
  onAddClick: () => void;
  onSettingsClick: () => void;
};

export function FloatingToolbar({
  onSearchClick,
  onAddClick,
  onSettingsClick,
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
          <Search size={20} aria-hidden="true" />
        </button>

        {/* 添加按钮 */}
        <button
          type="button"
          onClick={onAddClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          aria-label="新建卡片"
        >
          <Plus size={20} aria-hidden="true" />
        </button>

        {/* 设置按钮 */}
        <button
          type="button"
          onClick={onSettingsClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
          aria-label="设置"
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default FloatingToolbar;
