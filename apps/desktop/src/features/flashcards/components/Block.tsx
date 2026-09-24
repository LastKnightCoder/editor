import type { ReactNode } from "react";

export function Block({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[13.5px] font-semibold">{title}</span>
        {meta && <span className="text-ink-3 ml-auto text-[11.5px] tabular-nums">{meta}</span>}
      </div>
      {children}
    </section>
  );
}
