import { cn } from "@tau/ui";

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="text-ink-2 mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {items.map(([cls, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <i className={cn("size-2 rounded-[2.5px]", cls)} />
          {label}
        </span>
      ))}
    </div>
  );
}
