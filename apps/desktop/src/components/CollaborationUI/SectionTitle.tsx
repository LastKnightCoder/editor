/** 小节题：标题 + 计数 + 右侧附注 */

import type { ReactNode } from "react";

export function SectionTitle({
  children,
  count,
  aside,
}: {
  children: string;
  count?: number;
  aside?: ReactNode;
}) {
  return (
    <div className="text-tau-meta text-ink-1 flex items-baseline gap-2 font-[600]">
      {children}
      {count !== undefined && <span className="text-ink-3 font-normal tabular-nums">{count}</span>}
      {aside && <span className="text-ink-3 text-tau-sm ml-auto font-normal">{aside}</span>}
    </div>
  );
}
