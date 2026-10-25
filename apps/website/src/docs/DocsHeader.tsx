import { useEffect, useState } from "react";
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
}

/** 使用文档与更新日志共用的吸顶导航 */
export function DocsHeader({ current, nav }: DocsHeaderProps) {
  return (
    <header className="border-line-1 bg-page/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-6 px-6 max-sm:px-4">
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
        <a href="/" className="flex items-center gap-2.5 font-serif text-[20px] font-semibold">
          <img src="/tau-icon.png" alt="" className="shadow-card size-7 rounded-[8px]" />
          Tau
        </a>
        <nav className="text-ink-2 flex items-center gap-7 text-[15px] max-sm:hidden">
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
        <div className="ml-auto flex items-center gap-2.5">
          <GithubLink />
          <a
            href="/#download"
            className="bg-ink-1 text-page inline-flex h-9 items-center gap-2 rounded-[10px] px-4 text-[14px] font-medium transition-transform hover:-translate-y-px"
          >
            <Download className="size-4" strokeWidth={1.75} />
            下载
          </a>
        </div>
      </div>
    </header>
  );
}
