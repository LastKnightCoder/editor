import type { PropsWithChildren, ReactNode } from "react";

export const ToolBadge = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <span
    className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
      isDark
        ? "border-white/10 bg-white/5 text-slate-300"
        : "border-slate-200 bg-slate-50 text-slate-600"
    }`}
  >
    <span className="truncate">{children}</span>
  </span>
);

export const ToolCard = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <div
    className={`my-3 w-full max-w-full min-w-0 overflow-hidden rounded-xl border ${
      isDark ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white"
    }`}
  >
    {children}
  </div>
);

export const ToolCardHeader = ({
  isDark,
  children,
  divided = false,
}: PropsWithChildren<{ isDark: boolean; divided?: boolean }>) => (
  <div
    className={`${divided ? "border-b" : ""} px-4 py-3 ${
      isDark ? "border-white/10" : "border-slate-200"
    }`}
  >
    {children}
  </div>
);

export const ToolCardBody = ({ children }: PropsWithChildren) => (
  <div className="space-y-3 px-4 py-3">{children}</div>
);

export const ToolMutedText = ({
  isDark,
  children,
  className = "",
}: PropsWithChildren<{ isDark: boolean; className?: string }>) => (
  <div
    className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} ${className}`}
  >
    {children}
  </div>
);

export const ToolValuePill = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <div
    className={`rounded-lg px-3 py-2 text-xs ${
      isDark ? "bg-slate-950/50 text-slate-300" : "bg-slate-50 text-slate-600"
    }`}
  >
    {children}
  </div>
);

export const ToolSectionTitle = ({
  isDark,
  children,
  action,
}: PropsWithChildren<{ isDark: boolean; action?: ReactNode }>) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div
      className={`text-sm font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}
    >
      {children}
    </div>
    {action}
  </div>
);
