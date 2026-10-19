/** 分段选择的静态外观（@tau/ui Segmented 依赖交互状态，这里只画结果） */
import clsx from "clsx";

export function SegmentedLook({ items, active, size = "sm" }: { items: string[]; active: number; size?: "sm" | "md" }) {
  return (
    <div className={clsx("bg-hover inline-flex rounded-[9px] p-[2px]", size === "sm" ? "h-7" : "h-8")}>
      {items.map((item, i) => (
        <span key={item} className={clsx("text-tau-sm flex items-center rounded-[7px] px-2.5", i === active ? "bg-surface text-ink-1 shadow-card font-medium" : "text-ink-2")}>
          {item}
        </span>
      ))}
    </div>
  );
}
