import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Menu, Star, X } from "lucide-react";
import { formatStars, loadGithubStars } from "../lib/githubStars.ts";
import { GITHUB_MARK_PATH, GITHUB_URL, SITE_LINKS, type SiteLink } from "../lib/site.ts";

function GithubLink() {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    void loadGithubStars().then(setStars);
  }, []);
  const label = formatStars(stars);

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener"
      aria-label={label ? `在 GitHub 上查看源码，${stars} 个星标` : "在 GitHub 上查看源码"}
      className="text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[14px] transition-colors"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[17px] shrink-0">
        <path fill="currentColor" d={GITHUB_MARK_PATH} />
      </svg>
      <span className="max-sm:hidden">GitHub</span>
      {label && (
        <span className="border-line-1 inline-flex items-center gap-1 border-l pl-2 tabular-nums">
          <Star className="size-[13px]" strokeWidth={1.75} />
          <b className="font-medium">{label}</b>
        </span>
      )}
    </a>
  );
}

interface DocsHeaderProps {
  /** 当前所在的站点入口，导航里高亮 */
  current: SiteLink["key"];
  /** 窄屏目录开关；页面没有侧栏目录时不传 */
  nav?: { open: boolean; onToggle: () => void };
  search?: ReactNode;
}

/** 使用文档与更新日志共用的吸顶导航 */
export function DocsHeader({ current, nav, search }: DocsHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭移动端菜单
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mobileMenuOpen]);

  return (
    <header className="border-line-1 bg-page/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-3 px-6 max-sm:px-4 sm:gap-4 lg:gap-6">
        {nav && (
          <button
            type="button"
            onClick={nav.onToggle}
            aria-label={nav.open ? "收起文档目录" : "展开文档目录"}
            aria-expanded={nav.open}
            className="text-ink-2 hover:bg-hover -ml-1.5 grid size-9 place-items-center rounded-[10px] lg:hidden"
          >
            {nav.open ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
          </button>
        )}
        <a
          href="/"
          className="flex shrink-0 items-center gap-2.5 font-serif text-[20px] font-semibold"
        >
          <img src="/tau-icon.png" alt="" className="shadow-card size-7 rounded-[8px]" />
          Tau
        </a>
        <nav className="text-ink-2 flex shrink-0 items-center gap-4 text-[15px] whitespace-nowrap max-md:hidden lg:gap-7">
          {SITE_LINKS.map(link => (
            <a
              key={link.key}
              href={link.href}
              {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
              aria-current={link.key === current ? "page" : undefined}
              className="hover:text-ink-1 aria-[current=page]:text-ink-1 transition-colors aria-[current=page]:font-medium"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {search}
          <GithubLink />
          <a
            href="/#download"
            aria-label="下载 Tau"
            className="bg-ink-1 text-page inline-flex h-9 items-center gap-2 rounded-[10px] px-4 text-[14px] font-medium whitespace-nowrap transition-transform hover:-translate-y-px max-sm:px-2.5"
          >
            <Download className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="max-sm:hidden">下载</span>
          </a>
          {/* 移动端汉堡菜单，768px 以下显示 */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
              aria-expanded={mobileMenuOpen}
              className="text-ink-2 hover:bg-hover grid size-9 place-items-center rounded-[10px]"
            >
              {mobileMenuOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
            </button>
            {mobileMenuOpen && (
              <div className="bg-page border-line-1 absolute top-[calc(100%+8px)] right-0 min-w-[160px] rounded-[12px] border py-1.5 shadow-lg">
                {SITE_LINKS.map(link => (
                  <a
                    key={link.key}
                    href={link.href}
                    {...(link.external ? { target: "_blank", rel: "noopener" } : {})}
                    aria-current={link.key === current ? "page" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-ink-2 hover:bg-hover hover:text-ink-1 aria-[current=page]:text-ink-1 flex items-center px-4 py-2.5 text-[15px] transition-colors aria-[current=page]:font-medium"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
