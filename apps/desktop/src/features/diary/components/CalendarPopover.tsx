/**
 * 按日期查看（工具栏日历按钮的 Popover，取代方案 A 的右栏日历，D-044）：
 * 热力月历（底色深浅 = 当天字数），点一天只看那天、Shift 连选一段；下方快捷范围。
 */

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton, Popover, cn } from "@tau/ui";
import { dayKey, keyDate, presetRanges, type DayStat } from "../model";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarPopover({
  today,
  stats,
  range,
  onRange,
}: {
  today: string;
  stats: Map<string, DayStat>;
  range: [string, string] | null;
  onRange: (range: [string, string] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      arrow={false}
      className="w-[276px]"
      trigger={
        <IconButton
          title="按日期查看"
          className={cn(range && "bg-accent-soft text-accent-text hover:bg-accent-soft")}
        >
          <CalendarDays className="size-4" strokeWidth={1.75} />
        </IconButton>
      }
    >
      {open && <CalendarPanel today={today} stats={stats} range={range} onRange={onRange} />}
    </Popover>
  );
}

function CalendarPanel({
  today,
  stats,
  range,
  onRange,
}: {
  today: string;
  stats: Map<string, DayStat>;
  range: [string, string] | null;
  onRange: (range: [string, string] | null) => void;
}) {
  const [month, setMonth] = useState(() => (range ? range[1] : today).slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(range?.[0] ?? null);
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const maxWords = Math.max(1, ...[...stats.values()].map(s => s.words));
  const shift = (n: number) => setMonth(dayKey(new Date(y, m - 1 + n, 1).getTime()).slice(0, 7));
  const presets = presetRanges(today);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-1">
        <b className="text-tau-body flex-1 font-semibold">
          {y}年{m}月
        </b>
        <IconButton title="上个月" className="size-6 rounded-[7px]" onClick={() => shift(-1)}>
          <ChevronLeft className="size-[14px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton
          title="下个月"
          className="size-6 rounded-[7px]"
          disabled={month >= today.slice(0, 7)}
          onClick={() => shift(1)}
        >
          <ChevronRight className="size-[14px]" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map(w => (
          <span key={w} className="text-tau-tiny text-ink-3 text-center">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`;
          const stat = stats.get(key);
          // 有记录的日子至少 18% 底色，按字数线性加深到 80%
          const heat = stat ? Math.round(18 + (stat.words / maxWords) * 62) : 0;
          const inRange = range != null && key >= range[0] && key <= range[1];
          return (
            <button
              key={key}
              type="button"
              disabled={key > today}
              title={`${keyDate(key).getMonth() + 1}月${i + 1}日 · ${stat ? `${stat.count} 条 · ${stat.words} 字` : "没有记录"}`}
              onClick={e => {
                if (e.shiftKey && anchor) {
                  onRange(anchor < key ? [anchor, key] : [key, anchor]);
                } else {
                  setAnchor(key);
                  onRange([key, key]);
                }
              }}
              style={
                heat
                  ? {
                      backgroundColor: `color-mix(in srgb, var(--tau-accent) ${heat}%, transparent)`,
                    }
                  : undefined
              }
              className={cn(
                "text-tau-sm relative grid aspect-square place-items-center rounded-[8px] tabular-nums",
                "hover:shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)] disabled:pointer-events-none disabled:opacity-40",
                stat ? "text-ink-1 font-medium" : "text-ink-2",
                heat > 55 && "text-ink-inverse",
                inRange && "shadow-[inset_0_0_0_2px_var(--tau-accent-text)]"
              )}
            >
              {i + 1}
              {key === today && (
                <i
                  className={cn(
                    "absolute bottom-[3px] size-1 rounded-full",
                    heat > 55 ? "bg-ink-inverse" : "bg-accent"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {presets.map(p => {
          const on = range?.[0] === p.range[0] && range?.[1] === p.range[1];
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onRange(on ? null : p.range)}
              className={cn(
                "text-tau-sm h-6 rounded-[7px] px-2.5",
                on
                  ? "bg-accent-soft text-accent-text font-medium"
                  : "bg-hover text-ink-2 hover:bg-press"
              )}
            >
              {p.label}
            </button>
          );
        })}
        {range && (
          <button
            type="button"
            onClick={() => onRange(null)}
            className="text-tau-sm text-ink-2 hover:bg-hover h-6 rounded-[7px] px-2.5"
          >
            全部时间
          </button>
        )}
      </div>
      <p className="text-tau-tiny text-ink-3 mt-2">点一天只看那天，Shift 连选一段</p>
    </div>
  );
}
