import { useEffect, useState } from "react";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  onNavigateSettings: () => void;
};

function IconSettings() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9l2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9l2.83-2.83" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
};

export function Sidebar({ open, onClose, onNavigateSettings }: SidebarProps) {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
    } else if (shouldRender) {
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, shouldRender]);

  if (!shouldRender) {
    return null;
  }

  const menuItems: MenuItem[] = [
    { icon: <IconSettings />, label: "设置", onClick: onNavigateSettings },
    { icon: <IconInfo />, label: "关于" },
  ];

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩层 */}
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 dark:bg-black/70 ${open ? "mask-enter" : "mask-exit"}`}
        onClick={onClose}
        aria-label="关闭侧边栏"
      />

      {/* 侧边栏内容 */}
      <aside
        className={`absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 ${open ? "sidebar-enter" : "sidebar-exit"}`}
      >
        <div className="flex h-full flex-col">
          {/* 头部 */}
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 pb-6 pt-safe dark:border-gray-800">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-lg font-semibold text-white">
              U
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                用户
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                本地存储
              </p>
            </div>
          </div>

          {/* 菜单列表 */}
          <div className="flex-1 overflow-y-auto py-2">
            {menuItems.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  item.onClick?.();
                  if (item.onClick) {
                    onClose();
                  }
                }}
                className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 dark:text-gray-400">
                    {item.icon}
                  </span>
                  <span className="text-[15px] text-gray-700 dark:text-gray-200">
                    {item.label}
                  </span>
                </div>
                <span className="text-gray-300 dark:text-gray-600">
                  <IconChevronRight />
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

export default Sidebar;
