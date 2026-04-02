import { useEffect, useState } from "react";
import { ChevronRight, CircleHelp, Settings } from "lucide-react";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  onNavigateSettings: () => void;
  onNavigateAbout: () => void;
};

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
};

export function Sidebar({
  open,
  onClose,
  onNavigateSettings,
  onNavigateAbout,
}: SidebarProps) {
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
    {
      icon: <Settings size={20} strokeWidth={1.8} aria-hidden="true" />,
      label: "设置",
      onClick: onNavigateSettings,
    },
    {
      icon: <CircleHelp size={20} strokeWidth={1.8} aria-hidden="true" />,
      label: "关于",
      onClick: onNavigateAbout,
    },
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
        className={`absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-neutral-950 ${open ? "sidebar-enter" : "sidebar-exit"}`}
      >
        <div className="flex h-full flex-col">
          {/* 头部 */}
          <div className="mobile-safe-top-gap flex items-center gap-3 border-b border-gray-100 px-5 pb-6 dark:border-neutral-800">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-lg font-semibold text-white dark:bg-neutral-800">
              U
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-neutral-100">
                用户
              </p>
              <p className="text-sm text-gray-500 dark:text-neutral-400">
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
                }}
                className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors active:bg-gray-50 dark:active:bg-neutral-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 dark:text-neutral-400">
                    {item.icon}
                  </span>
                  <span className="text-[15px] text-gray-700 dark:text-neutral-200">
                    {item.label}
                  </span>
                </div>
                <span className="text-gray-300 dark:text-neutral-600">
                  <ChevronRight size={16} aria-hidden="true" />
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
