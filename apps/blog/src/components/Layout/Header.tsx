import {
  memo,
  useState,
  ReactNode,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";
import classNames from "classnames";
import { NavItem } from "@blog/types";
import { toggleTheme, isDarkMode, joinPath } from "@blog/utils";
import { SearchButton, SearchDialog } from "@blog/components/Search";

interface HeaderProps {
  title: string;
  basePath: string;
  navigation: NavItem[];
  customNav?: ReactNode;
  mobileCustomNav?: ReactNode;
  rssHref?: string;
  searchHref?: string;
}

function resolveCopyHref(href: string): string {
  if (typeof window === "undefined") {
    return href;
  }

  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return href;
  }
}

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
    className="group relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-bg-canvas)]"
    role="switch"
    aria-checked={checked}
    aria-label="切换主题"
  >
    <svg
      className={classNames(
        "absolute h-[18px] w-[18px] transition-all duration-300",
        checked
          ? "rotate-90 scale-0 opacity-0"
          : "rotate-0 scale-100 opacity-100 text-[var(--color-text-primary)]",
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
    <svg
      className={classNames(
        "absolute h-[18px] w-[18px] transition-all duration-300",
        checked
          ? "rotate-0 scale-100 opacity-100 text-[var(--color-text-primary)]"
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

const NavLink = ({ item, basePath }: { item: NavItem; basePath: string }) => (
  <a
    href={joinPath(basePath, item.href)}
    className={classNames(
      "relative px-3 py-2 text-sm transition-colors",
      item.active
        ? "font-semibold text-[var(--color-text-primary)]"
        : "font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
    )}
  >
    {item.label}
  </a>
);

const MenuButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => (
  <button
    className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)] md:hidden"
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

const RssButton = ({
  href,
  copied,
  onCopy,
}: {
  href: string;
  copied: boolean;
  onCopy: () => void;
}) => (
  <button
    type="button"
    onClick={onCopy}
    className="group relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
    aria-label={copied ? "RSS 链接已复制" : "复制 RSS 链接"}
    title={copied ? "RSS 链接已复制" : "复制 RSS 链接"}
    data-rss-href={href}
  >
    {copied ? (
      <svg
        className="h-[18px] w-[18px] text-[var(--color-text-primary)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <svg
        className="h-[18px] w-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 19h.01M5 5c7.18 0 13 5.82 13 13M5 11a7 7 0 017 7"
        />
      </svg>
    )}
  </button>
);

const Header = memo(
  ({
    title,
    basePath,
    navigation,
    customNav,
    mobileCustomNav,
    rssHref,
    searchHref,
  }: HeaderProps) => {
    const [dark, setDark] = useState(() => isDarkMode());
    const [menuOpen, setMenuOpen] = useState(false);
    const [rssCopied, setRssCopied] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    const handleToggleTheme = () => {
      toggleTheme();
      setDark((prev) => !prev);
    };

    const handleCopyRss = async () => {
      if (!rssHref) return;

      const copyHref = resolveCopyHref(rssHref);
      try {
        await navigator.clipboard.writeText(copyHref);
        setRssCopied(true);
        window.setTimeout(() => setRssCopied(false), 1600);
      } catch {
        window.open(rssHref, "_blank", "noopener,noreferrer");
      }
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

    useEffect(() => {
      if (!searchHref) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        const isEditable =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable;

        if (isEditable) {
          return;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          setSearchOpen(true);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [searchHref]);

    return (
      <header
        ref={headerRef}
        className="sticky top-0 z-50 h-14 border-b border-[var(--color-border-ring)] bg-[var(--color-bg-page)]/95 backdrop-blur-sm"
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <a
            href={joinPath(basePath, "/")}
            className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)]"
          >
            {title}
          </a>

          {/* 桌面端导航 */}
          <nav className="hidden items-center gap-1 md:flex">
            <div className="flex items-center">
              {navigation.map((item) => (
                <NavLink key={item.href} item={item} basePath={basePath} />
              ))}
            </div>
            {customNav && (
              <div className="flex items-center text-sm text-[var(--color-text-secondary)]">
                {customNav}
              </div>
            )}
            <div className="mx-2 h-5 w-px bg-[var(--color-border-ring)]" />
            {searchHref && <SearchButton onClick={() => setSearchOpen(true)} />}
            {rssHref && (
              <RssButton
                href={rssHref}
                copied={rssCopied}
                onCopy={handleCopyRss}
              />
            )}
            <ThemeSwitch checked={dark} onToggle={handleToggleTheme} />
          </nav>

          {/* 移动端操作 */}
          <div className="flex items-center gap-1 md:hidden">
            {searchHref && (
              <SearchButton compact onClick={() => setSearchOpen(true)} />
            )}
            {rssHref && (
              <RssButton
                href={rssHref}
                copied={rssCopied}
                onCopy={handleCopyRss}
              />
            )}
            <ThemeSwitch checked={dark} onToggle={handleToggleTheme} />
            <MenuButton
              isOpen={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            />
          </div>
        </div>

        {/* 移动端菜单 */}
        {menuOpen && (
          <div className="absolute left-0 right-0 top-14 z-40 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-[var(--color-border-ring)] bg-[var(--color-bg-page)] md:hidden">
            <nav className="px-4 py-3">
              <div className="flex flex-col gap-1">
                {navigation.map((item) => (
                  <a
                    key={item.href}
                    href={joinPath(basePath, item.href)}
                    className={classNames(
                      "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                      item.active
                        ? "bg-[var(--color-primary-subtle)] text-[var(--color-text-primary)]"
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
                {rssHref && (
                  <button
                    type="button"
                    onClick={handleCopyRss}
                    className="mt-2 rounded-lg px-4 py-2.5 text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-canvas)] hover:text-[var(--color-text-primary)]"
                  >
                    {rssCopied ? "RSS 链接已复制" : "复制 RSS 链接"}
                  </button>
                )}
              </div>
            </nav>
          </div>
        )}
        {searchHref && (
          <SearchDialog
            open={searchOpen}
            searchHref={joinPath(basePath, searchHref, { raw: true })}
            basePath={basePath}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </header>
    );
  },
);

Header.displayName = "Header";

export default Header;
