import type { PropsWithChildren, ReactNode } from "react";

const SHADOW_CARD_LIGHT =
  "0 0 0 1px rgba(34,42,53,0.08), 0 1px 5px -4px rgba(19,19,22,0.7), 0 4px 8px rgba(34,42,53,0.05)";
const SHADOW_CARD_DARK =
  "0 0 0 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)";
const SHADOW_DIVIDER_LIGHT = "inset 0 -1px 0 0 rgba(34,42,53,0.08)";
const SHADOW_DIVIDER_DARK = "inset 0 -1px 0 0 rgba(255,255,255,0.06)";

export const ToolBadge = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <span
    className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${
      isDark ? "bg-white/[0.08] text-slate-300" : "bg-slate-100 text-slate-600"
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
    className={`my-3 w-full max-w-full min-w-0 overflow-hidden rounded-xl animate-fadeIn ${
      isDark ? "bg-zinc-900/50" : "bg-white"
    }`}
    style={{
      boxShadow: isDark ? SHADOW_CARD_DARK : SHADOW_CARD_LIGHT,
    }}
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
    className="px-4 py-3.5"
    style={
      divided
        ? {
            boxShadow: isDark ? SHADOW_DIVIDER_DARK : SHADOW_DIVIDER_LIGHT,
          }
        : undefined
    }
  >
    {children}
  </div>
);

export const ToolCardBody = ({ children }: PropsWithChildren) => (
  <div className="space-y-4 px-4 py-4">{children}</div>
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
      isDark ? "bg-zinc-950/50 text-slate-300" : "bg-slate-50 text-slate-600"
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

export const ToolDividerList = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <div
    className={`divide-y ${
      isDark ? "divide-white/[0.06]" : "divide-slate-100"
    }`}
  >
    {children}
  </div>
);

export const ToolDividerListItem = ({
  isDark,
  children,
}: PropsWithChildren<{ isDark: boolean }>) => (
  <div
    className={`py-3 first:pt-0 last:pb-0 transition-colors duration-150 ${
      isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50"
    }`}
  >
    {children}
  </div>
);

export const ToolProgressBar = ({
  isDark,
  segments,
}: {
  isDark: boolean;
  segments: Array<{ value: number; color: string }>;
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div
      className={`flex h-2 w-full overflow-hidden rounded-full ${
        isDark ? "bg-zinc-800" : "bg-slate-100"
      }`}
    >
      {segments.map((segment, i) =>
        segment.value > 0 ? (
          <div
            key={i}
            className="transition-all duration-200"
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ) : null,
      )}
    </div>
  );
};
