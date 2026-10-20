import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUpRight, FileText } from "lucide-react";

export function DocumentCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(15em,1fr))] gap-[0.75em]">
      {children}
    </div>
  );
}

/** 尺寸使用 em，让编辑器与发布站点的卡片随正文字号一起缩放。 */
export function DocumentCard({
  title,
  description,
  href,
  onClick,
}: {
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
}) {
  const Tag = href ? "a" : "div";
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!href && onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onClick();
    }
  };
  return (
    <Tag
      href={href}
      contentEditable={false}
      role={!href && onClick ? "button" : undefined}
      tabIndex={!href && onClick ? 0 : undefined}
      aria-label={`打开文档：${title}`}
      className="rounded-tau-md border-line-1 bg-surface text-ink-1 ease-tau-out hover:border-accent hover:bg-hover hover:shadow-card active:bg-press focus-visible:border-accent group flex min-w-0 cursor-pointer select-none flex-col gap-[0.625em] border px-[1.125em] py-[1em] no-underline outline-none transition-[border-color,background-color,box-shadow] duration-[160ms] focus-visible:shadow-[var(--tau-focus-ring)]"
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex min-w-0 items-center gap-[0.625em]">
        <span
          aria-hidden
          className="rounded-tau-sm bg-accent-soft text-accent-text grid size-[2em] flex-none place-items-center"
        >
          <FileText className="size-[1.125em]" />
        </span>
        <div className="group-hover:text-accent-text ease-tau-out min-w-0 flex-1 truncate text-[1.0625em] font-semibold leading-[1.4] transition-colors duration-[160ms]">
          {title}
        </div>
        <ArrowUpRight
          aria-hidden
          className="text-accent-text ease-tau-out size-[1em] flex-none -translate-x-0.5 translate-y-0.5 opacity-0 transition-[opacity,translate] duration-[160ms] group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
        />
      </div>
      <div className="text-ink-2 line-clamp-2 min-h-[3.2em] text-[0.875em] leading-[1.6]">
        {description || "暂无内容"}
      </div>
    </Tag>
  );
}
