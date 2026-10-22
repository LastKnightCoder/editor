// 自定义日期时间选择器：月历网格 + 时/分步进器 + 快捷时间胶囊。
// 替代 datetime-local 原生输入（WebView 下样式失控，且未设置时只能显示空值）。

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { BottomSheet } from "./BottomSheet";

type DateTimeDraft = {
  year: number;
  month: number; // 0-based，与 Date 一致
  day: number;
  hour: number;
  minute: number;
};

type DateTimePickerSheetProps = {
  open: boolean;
  title: string;
  /** 现值；null 表示未设置——打开时落到「今天 + defaultHour」，不显示空输入 */
  value: number | null;
  /** 未设置时的默认钟点（开始时间传 9、截止时间传 18 之类） */
  defaultHour?: number;
  onConfirm: (timestamp: number) => void;
  /** 传入则显示「清除」入口（清空字段） */
  onClear?: () => void;
  onClose: () => void;
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const QUICK_TIMES: Array<{ label: string; hour: number; minute: number }> = [
  { label: "09:00", hour: 9, minute: 0 },
  { label: "12:00", hour: 12, minute: 0 },
  { label: "15:00", hour: 15, minute: 0 },
  { label: "18:00", hour: 18, minute: 0 },
  { label: "20:30", hour: 20, minute: 30 },
  { label: "22:00", hour: 22, minute: 0 },
];

const MINUTE_STEP = 5;

const pad2 = (value: number) => `${value}`.padStart(2, "0");

function draftFromValue(ts: number): DateTimeDraft {
  const date = new Date(ts);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

function defaultDraft(defaultHour: number): DateTimeDraft {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth(),
    day: now.getDate(),
    hour: defaultHour,
    minute: 0,
  };
}

function isSameDay(draft: DateTimeDraft, year: number, month: number, day: number): boolean {
  return draft.year === year && draft.month === month && draft.day === day;
}

function shiftMinute(minute: number, delta: number): number {
  return (minute + delta + 60) % 60;
}

export function DateTimePickerSheet({
  open,
  title,
  value,
  defaultHour = 9,
  onConfirm,
  onClear,
  onClose,
}: DateTimePickerSheetProps) {
  const [draft, setDraft] = useState<DateTimeDraft>(() => defaultDraft(defaultHour));

  // 每次打开重置草稿：有值回填，无值落到今天 + defaultHour
  useEffect(() => {
    if (!open) return;
    setDraft(value != null ? draftFromValue(value) : defaultDraft(defaultHour));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const calendarCells = useMemo(() => {
    // 周一开列：(getDay() + 6) % 7 把周日=0 换算到行尾
    const firstWeekday = (new Date(draft.year, draft.month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(draft.year, draft.month + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [draft.year, draft.month]);

  const today = new Date();
  const isToday = isSameDay(draft, today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const isTomorrow = isSameDay(
    draft,
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate()
  );

  const setQuickDay = (offsetDays: number) => {
    const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
    setDraft(prev => ({
      ...prev,
      year: target.getFullYear(),
      month: target.getMonth(),
      day: target.getDate(),
    }));
  };

  const shiftMonth = (delta: number) => {
    setDraft(prev => {
      const anchor = new Date(prev.year, prev.month + delta, 1);
      const daysInTarget = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
      return {
        ...prev,
        year: anchor.getFullYear(),
        month: anchor.getMonth(),
        day: Math.min(prev.day, daysInTarget),
      };
    });
  };

  const patchTime = (patch: Partial<Pick<DateTimeDraft, "hour" | "minute">>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  };

  const quickDayClass = (active: boolean) =>
    `flex-1 rounded-full px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
      active ? "bg-accent text-ink-inverse shadow-lift" : "bg-page text-ink-2"
    }`;

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      {/* 快捷日期 */}
      <div className="flex gap-2">
        <button type="button" className={quickDayClass(isToday)} onClick={() => setQuickDay(0)}>
          今天
        </button>
        <button type="button" className={quickDayClass(isTomorrow)} onClick={() => setQuickDay(1)}>
          明天
        </button>
      </div>

      {/* 月历 */}
      <div className="mt-4 flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="上个月"
          onClick={() => shiftMonth(-1)}
          className="text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-ink-1 text-[14px] font-extrabold tabular-nums">
          {draft.year}年{draft.month + 1}月
        </span>
        <button
          type="button"
          aria-label="下个月"
          onClick={() => shiftMonth(1)}
          className="text-ink-2 active:bg-hover grid h-9 w-9 place-items-center rounded-full"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mt-1.5 grid grid-cols-7">
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className="text-ink-3 grid h-7 place-items-center text-[11px] font-bold">
            {label}
          </div>
        ))}
        {calendarCells.map((day, index) =>
          day == null ? (
            <div key={`empty-${index}`} className="h-10" />
          ) : (
            <button
              key={day}
              type="button"
              onClick={() => setDraft(prev => ({ ...prev, day }))}
              className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-[13.5px] font-bold tabular-nums transition-all active:scale-90 ${
                isSameDay(draft, draft.year, draft.month, day)
                  ? "bg-accent shadow-lift text-ink-inverse"
                  : isSameDay(draft, today.getFullYear(), today.getMonth(), day)
                    ? "text-accent"
                    : "text-ink-1"
              }`}
            >
              {day}
            </button>
          )
        )}
      </div>

      {/* 时间：时/分步进器 */}
      <div className="mt-4 flex items-center justify-center gap-8">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="减一小时"
            onClick={() => patchTime({ hour: (draft.hour + 23) % 24 })}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Minus size={15} />
          </button>
          <div className="w-[52px] text-center">
            <span className="text-ink-1 text-[22px] font-extrabold tabular-nums">
              {pad2(draft.hour)}
            </span>
            <span className="text-ink-3 ml-1 text-[11px] font-bold">时</span>
          </div>
          <button
            type="button"
            aria-label="加一小时"
            onClick={() => patchTime({ hour: (draft.hour + 1) % 24 })}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="减五分钟"
            onClick={() => patchTime({ minute: shiftMinute(draft.minute, -MINUTE_STEP) })}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Minus size={15} />
          </button>
          <div className="w-[52px] text-center">
            <span className="text-ink-1 text-[22px] font-extrabold tabular-nums">
              {pad2(draft.minute)}
            </span>
            <span className="text-ink-3 ml-1 text-[11px] font-bold">分</span>
          </div>
          <button
            type="button"
            aria-label="加五分钟"
            onClick={() => patchTime({ minute: shiftMinute(draft.minute, MINUTE_STEP) })}
            className="bg-page text-ink-2 grid h-9 w-9 place-items-center rounded-full transition-transform active:scale-90"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* 快捷时间 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_TIMES.map(quick => {
          const active = draft.hour === quick.hour && draft.minute === quick.minute;
          return (
            <button
              key={quick.label}
              type="button"
              onClick={() => patchTime({ hour: quick.hour, minute: quick.minute })}
              className={`flex-1 rounded-full px-2 py-2 text-xs font-bold tabular-nums transition-all active:scale-95 ${
                active ? "bg-accent shadow-lift text-ink-inverse" : "bg-page text-ink-2"
              }`}
            >
              {quick.label}
            </button>
          );
        })}
      </div>

      {/* 操作 */}
      <div className="mt-5 flex gap-2.5">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="bg-page text-ink-2 h-11 flex-1 rounded-full text-sm font-bold transition-transform active:scale-[0.98]"
          >
            清除
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onConfirm(
              new Date(draft.year, draft.month, draft.day, draft.hour, draft.minute).getTime()
            );
          }}
          className="shadow-lift text-ink-inverse bg-accent h-11 flex-1 rounded-full text-sm font-bold transition-transform active:scale-[0.98]"
        >
          确认
        </button>
      </div>
    </BottomSheet>
  );
}

export default DateTimePickerSheet;
