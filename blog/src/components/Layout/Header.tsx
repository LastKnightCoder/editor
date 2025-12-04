import {
  memo,
  useState,
  useEffect,
  ReactNode,
  useRef,
  useLayoutEffect,
} from "react";
import classNames from "classnames";
import { NavItem } from "@blog/types";
import { toggleTheme, isDarkMode, joinPath } from "@blog/utils";

interface HeaderProps {
  title: string;
  basePath: string;
  navigation: NavItem[];
  customNav?: ReactNode;
  mobileCustomNav?: ReactNode;
}

// 主题切换开关
const ThemeSwitch = ({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    className={classNames(
      "group relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300",
      "hover:bg-[var(--color-bg-canvas)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2",
    )}
    role="switch"
    aria-checked={checked}
    aria-label="切换主题"
  >
    {/* 太阳图标 */}
    <svg
      className={classNames(
        "absolute h-5 w-5 transition-all duration-300",
        checked
          ? "rotate-90 scale-0 opacity-0"
          : "rotate-0 scale-100 opacity-100 text-amber-500",
      )}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
    {/* 月亮图标 */}
    <svg
      className={classNames(
        "absolute h-5 w-5 transition-all duration-300",
        checked
          ? "rotate-0 scale-100 opacity-100 text-[var(--color-primary)]"
          : "-rotate-90 scale-0 opacity-0",
      )}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  </button>
);

// Logo 组件
const Logo = ({ title, basePath }: { title: string; basePath: string }) => (
  <a href={joinPath(basePath, "/")} className="group flex items-center gap-2.5">
    {/* Logo 图标 */}
    <div className="relative flex h-9 w-9 items-center justify-center">
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-cyan-400 opacity-90 transition-transform duration-300 group-hover:scale-110" />
      <svg
        className="relative h-5 w-5 text-white"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    </div>
    {/* Logo 文字 */}
    <span className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-primary)]">
      {title}
    </span>
  </a>
);

// 导航链接
const NavLink = ({ item, basePath }: { item: NavItem; basePath: string }) => (
  <a
    href={joinPath(basePath, item.href)}
    className={classNames(
      "relative px-3 py-2 text-sm font-medium transition-colors",
      item.active
        ? "text-[var(--color-primary)]"
        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
    )}
  >
    {item.label}
    {/* 活动指示器 */}
    {item.active && (
      <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--color-primary)]" />
    )}
  </a>
);

// 移动端菜单按钮
const MenuButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => (
  <button
    className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)] md:hidden"
    onClick={onClick}
    aria-label="菜单"
    aria-expanded={isOpen}
  >
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {isOpen ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 6h16M4 12h16M4 18h16"
        />
      )}
    </svg>
  </button>
);

const Header = memo(
  ({
    title,
    basePath,
    navigation,
    customNav,
    mobileCustomNav,
  }: HeaderProps) => {
    const [dark, setDark] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
      setDark(isDarkMode());
    }, []);

    const handleToggleTheme = () => {
      toggleTheme();
      setDark((prev) => !prev);
    };

    const headerRef = useRef<HTMLElement>(null);

    useLayoutEffect(() => {
      const updateHeight = () => {
        if (!headerRef.current) return;
        document.documentElement.style.setProperty(
          "--header-offset",
          `${headerRef.current.offsetHeight}px`,
        );
      };
      updateHeight();
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }, []);

    return (
      <header
        ref={headerRef}
        className="sticky top-0 z-50 h-16 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-container)]"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Logo title={title} basePath={basePath} />

          {/* 桌面端导航 */}
          <nav className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-1">
              {navigation.map((item) => (
                <NavLink key={item.href} item={item} basePath={basePath} />
              ))}
            </div>
            {customNav && (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                {customNav}
              </div>
            )}
            <div className="mx-2 h-5 w-px bg-[var(--color-border-primary)]" />
            <ThemeSwitch checked={dark} onToggle={handleToggleTheme} />
          </nav>

          {/* 移动端操作 */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeSwitch checked={dark} onToggle={handleToggleTheme} />
            <MenuButton
              isOpen={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            />
          </div>
        </div>

        {/* 移动端菜单 - 使用 absolute 定位避免影响 header 高度 */}
        {menuOpen && (
          <div className="absolute left-0 right-0 top-16 z-40 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-container)] shadow-lg md:hidden">
            <nav className="px-4 py-3">
              <div className="flex flex-col gap-1">
                {navigation.map((item) => (
                  <a
                    key={item.href}
                    href={joinPath(basePath, item.href)}
                    className={classNames(
                      "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                      item.active
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-primary)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    {item.label}
                  </a>
                ))}
                {(mobileCustomNav || customNav) && (
                  <div className="mt-2 flex flex-col gap-2">
                    {mobileCustomNav || customNav}
                  </div>
                )}
              </div>
            </nav>
          </div>
        )}
      </header>
    );
  },
);

Header.displayName = "Header";

export default Header;
