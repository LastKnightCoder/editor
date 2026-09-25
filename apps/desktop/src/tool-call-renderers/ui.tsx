/**
 * 工具渲染器共用 UI 件（D-048 tau 化）：颜色只走 --tau-* 语义类，深浅主题无需分支——
 * isDark 形参保留仅为兼容既有调用方，不再参与取色。
 *
 * 层次口径（同设置页「卡片 > 内框 > 行」）：对话纸面上的工具卡 = line-1 描边圆角内框（不投影），
 * 卡头与卡体之间留白分组，不画横线；卡内的值块 = bg-hover 淡墨小面积填充。
 */

import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@tau/ui";

type DarkProp = { isDark?: boolean };

export const ToolBadge = ({ children }: PropsWithChildren<DarkProp>) => (
  <span className="bg-hover text-ink-2 text-tau-tiny inline-flex max-w-full items-center rounded-full px-2 py-0.5 font-medium">
    <span className="truncate">{children}</span>
  </span>
);

export const ToolCard = ({ children }: PropsWithChildren<DarkProp>) => (
  <div className="border-line-1 bg-surface rounded-tau-md my-2 w-full min-w-0 max-w-full overflow-hidden border">
    {children}
  </div>
);

export const ToolCardHeader = ({ children }: PropsWithChildren<DarkProp>) => (
  // 分组靠卡体留白，不再画分隔线
  <div className="px-3.5 pb-1 pt-3">{children}</div>
);

export const ToolCardBody = ({ children }: PropsWithChildren) => (
  <div className="space-y-3 px-3.5 pb-3.5 pt-2">{children}</div>
);

export const ToolMutedText = ({
  children,
  className = "",
}: PropsWithChildren<DarkProp & { className?: string }>) => (
  <div className={cn("text-tau-sm text-ink-3", className)}>{children}</div>
);

export const ToolValuePill = ({ children }: PropsWithChildren<DarkProp>) => (
  <div className="bg-hover text-ink-2 text-tau-sm rounded-tau-sm px-2.5 py-1.5">{children}</div>
);

export const ToolSectionTitle = ({
  children,
  action,
}: PropsWithChildren<DarkProp & { action?: ReactNode }>) => (
  <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="text-tau-body text-ink-1 font-semibold">{children}</div>
    {action}
  </div>
);

/** 行列表：行间 line-2 弱分隔（列表行间允许的细线档） */
export const ToolDividerList = ({ children }: PropsWithChildren<DarkProp>) => (
  <div className="divide-line-2 divide-y">{children}</div>
);

export const ToolDividerListItem = ({ children }: PropsWithChildren<DarkProp>) => (
  <div className="py-2.5 first:pt-0 last:pb-0">{children}</div>
);

export const ToolProgressBar = ({
  segments,
}: DarkProp & {
  segments: Array<{ value: number; color: string }>;
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div className="bg-sunken flex h-1.5 w-full overflow-hidden rounded-full">
      {segments.map((segment, i) =>
        segment.value > 0 ? (
          <div
            key={i}
            className="ease-tau-out transition-[width] duration-[240ms]"
            style={{
              width: `${(segment.value / total) * 100}%`,
              backgroundColor: segment.color,
            }}
          />
        ) : null
      )}
    </div>
  );
};
