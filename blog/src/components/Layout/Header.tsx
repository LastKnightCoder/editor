import { memo, useState, useEffect } from "react";
import classNames from "classnames";
import { NavItem } from "@blog/types";
import { toggleTheme, isDarkMode, joinPath } from "@blog/utils";

interface HeaderProps {
  title: string;
  basePath: string;
  navigation: NavItem[];
}

const Header = memo(({ title, basePath, navigation }: HeaderProps) => {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDark(isDarkMode());
  }, []);

  const handleToggleTheme = () => {
    toggleTheme();
    setDark(!dark);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-container)]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <a
          href={joinPath(basePath, "/")}
          className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          {title}
        </a>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={joinPath(basePath, item.href)}
              className={classNames(
                "text-sm transition-colors",
                item.active
                  ? "text-[var(--color-primary)] font-medium"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {item.label}
            </a>
          ))}

          {/* Theme Toggle */}
          <button
            onClick={handleToggleTheme}
            className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
            aria-label="切换主题"
          >
            {dark ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-canvas)] md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="菜单"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="border-t border-[var(--color-border-primary)] bg-[var(--color-bg-container)] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={joinPath(basePath, item.href)}
                className={classNames(
                  "text-sm transition-colors",
                  item.active
                    ? "text-[var(--color-primary)] font-medium"
                    : "text-[var(--color-text-secondary)]",
                )}
              >
                {item.label}
              </a>
            ))}
            <button
              onClick={handleToggleTheme}
              className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
            >
              {dark ? "切换到亮色模式" : "切换到暗色模式"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
});

Header.displayName = "Header";

export default Header;
