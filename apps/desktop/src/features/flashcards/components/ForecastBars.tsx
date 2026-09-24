import { cn } from "@tau/ui";

/** 7 日到期迷你柱：今天为 accent，其余为轨道色 */
export function ForecastBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-[22px] items-end gap-[3px]" aria-hidden>
      {values.map((v, i) => (
        <i
          key={i}
          className={cn("block w-1.5 rounded-[2px]", i === 0 ? "bg-accent" : "bg-track")}
          style={{ height: Math.max(2, (v / max) * 22) }}
        />
      ))}
    </div>
  );
}
