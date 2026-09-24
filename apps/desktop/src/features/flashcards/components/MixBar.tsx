import { cn } from "@tau/ui";
import { type DeckStats } from "../model";

/** 新 / 学习中 / 巩固 三色构成条（暂停不计入分母） */
export function MixBar({ stats, className }: { stats: DeckStats; className?: string }) {
  const base = Math.max(1, stats.total - stats.suspended);
  return (
    <div
      className={cn("bg-track flex h-1.5 gap-[1.5px] overflow-hidden rounded-full", className)}
      title={`新卡 ${stats.fresh} · 学习中 ${stats.learning} · 巩固 ${stats.review}`}
    >
      <i className="bg-info block h-full" style={{ width: `${(stats.fresh / base) * 100}%` }} />
      <i className="bg-warn block h-full" style={{ width: `${(stats.learning / base) * 100}%` }} />
      <i className="bg-ok block h-full" style={{ width: `${(stats.review / base) * 100}%` }} />
    </div>
  );
}
