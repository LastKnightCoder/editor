import type { ReactNode } from "react";

/** 「一整张纸」页面的通用页头（番茄 / 待办 / 日程共用的工具栏结构） */
export function PaperPage({ children, row = false }: { children: ReactNode; row?: boolean }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div
        className={row ? "bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 overflow-hidden" : "bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden"}
      >
        {children}
      </div>
    </div>
  );
}

export function PageToolbar({ title, summary, children }: { title: string; summary?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-none flex-col px-8 pt-5">
      <div className="mb-3 flex h-10 flex-none items-center gap-3">
        <h1 className="text-tau-title-lg shrink-0 font-semibold tracking-[-0.01em] whitespace-nowrap">{title}</h1>
        <span className="text-ink-2 text-tau-meta w-0 flex-1 truncate whitespace-nowrap tabular-nums">{summary}</span>
        {children}
      </div>
    </div>
  );
}

export const Sep = () => <span className="text-ink-3 mx-2">·</span>;
export const Num = ({ children }: { children: ReactNode }) => <b className="text-ink-1 font-semibold">{children}</b>;
