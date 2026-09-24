import { cn } from "@tau/ui";

const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export function ForecastChart({ values, now }: { values: number[]; now: number }) {
  const max = Math.max(1, ...values);
  return (
    <>
      <div className="grid h-16 grid-cols-7 items-end gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-col items-center justify-end gap-[3px]">
            <span className="text-ink-2 text-[10.5px] tabular-nums">{v}</span>
            <i
              className={cn(
                "block w-full max-w-[22px] rounded-[4px_4px_2px_2px]",
                i === 0 ? "bg-accent" : "bg-track"
              )}
              style={{ height: Math.max(3, (v / max) * 44) }}
            />
          </div>
        ))}
      </div>
      <div className="text-ink-3 mt-1.5 grid grid-cols-7 gap-2 text-center text-[10.5px]">
        {values.map((_, i) => (
          <span key={i} className={cn(i === 0 && "text-accent-text font-semibold")}>
            {i === 0 ? "今" : WEEK[new Date(now + i * 86_400_000).getDay()].slice(1)}
          </span>
        ))}
      </div>
    </>
  );
}
