import type { ReactNode } from "react";
import { Panel } from "@tau/ui";

/** 编辑页的编号分区卡片 */
export function Section({
  index,
  title,
  description,
  children,
}: {
  index?: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel className="flex flex-col gap-4">
      <header className="flex items-start gap-3">
        {index !== undefined && (
          <span className="bg-accent-soft text-accent-text text-tau-micro grid size-6 shrink-0 place-items-center rounded-full font-semibold">
            {index}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-tau-title text-ink-1 font-semibold">{title}</h2>
          {description && (
            <p className="text-tau-sm text-ink-3 mt-0.5 leading-[1.6]">{description}</p>
          )}
        </div>
      </header>
      {children}
    </Panel>
  );
}
