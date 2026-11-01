/**
 * 待办与日程提醒的共享口径：预设、文案与「首个 + 追加」的拆合。
 *
 * offset 为「基准时刻 - 提醒时刻」的毫秒数：截止任务的基准是截止时间，定时日程是开始时间，
 * 全天日程是当天零点（所以「当天 9:00」是负数）。存储上待办首个提醒在 todo_item.remind_before，
 * 其余在 item_reminder；日程全部在 item_reminder。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MAX_REMINDERS = 3;

export interface ReminderPreset {
  offset: number;
  label: string;
}

/** 截止任务与定时日程 */
export const TIMED_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: 0, label: "准时" },
  { offset: 5 * MINUTE, label: "5 分钟前" },
  { offset: 15 * MINUTE, label: "15 分钟前" },
  { offset: 30 * MINUTE, label: "30 分钟前" },
  { offset: HOUR, label: "1 小时前" },
  { offset: 2 * HOUR, label: "2 小时前" },
  { offset: DAY, label: "1 天前" },
  { offset: 2 * DAY, label: "2 天前" },
];

/** 全天日程：以当天零点为基准 */
export const ALL_DAY_REMINDER_PRESETS: ReminderPreset[] = [
  { offset: -9 * HOUR, label: "当天 9:00" },
  { offset: 15 * HOUR, label: "前一天 9:00" },
  { offset: 4 * HOUR, label: "前一天 20:00" },
  { offset: 39 * HOUR, label: "前两天 9:00" },
  { offset: 6 * DAY + 15 * HOUR, label: "一周前 9:00" },
];

export function reminderPresets(allDay = false): ReminderPreset[] {
  return allDay ? ALL_DAY_REMINDER_PRESETS : TIMED_REMINDER_PRESETS;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function reminderLabel(offset: number, allDay = false): string {
  const preset = reminderPresets(allDay).find(item => item.offset === offset);
  if (preset) return preset.label;
  if (allDay) {
    const days = Math.max(0, Math.ceil(offset / DAY));
    const clock = days * DAY - offset;
    const time = `${Math.floor(clock / HOUR)}:${pad(Math.floor((clock % HOUR) / MINUTE))}`;
    return days === 0 ? `当天 ${time}` : days === 1 ? `前一天 ${time}` : `前 ${days} 天 ${time}`;
  }
  if (offset <= 0) return "准时";
  if (offset % DAY === 0) return `${offset / DAY} 天前`;
  if (offset % HOUR === 0) return `${offset / HOUR} 小时前`;
  return `${Math.round(offset / MINUTE)} 分钟前`;
}

/** 去重、升序、截断到上限；首个即最靠近基准的提醒 */
export function normalizeReminders(offsets: readonly number[]): number[] {
  return [...new Set(offsets.filter(Number.isFinite))]
    .sort((a, b) => a - b)
    .slice(0, MAX_REMINDERS);
}

/** 待办：首个缺失即视为没有提醒（追加提醒不单独生效） */
export function joinTodoReminders(
  first: number | null | undefined,
  extras: readonly number[]
): number[] {
  return first == null ? [] : normalizeReminders([first, ...extras]);
}

export function splitTodoReminders(offsets: readonly number[]): {
  first: number | null;
  extras: number[];
} {
  const [first = null, ...extras] = normalizeReminders(offsets);
  return { first, extras };
}

export function summarizeReminders(offsets: readonly number[], allDay = false): string {
  const list = normalizeReminders(offsets);
  if (!list.length) return "不提醒";
  const labels = list.map(offset => reminderLabel(offset, allDay));
  return labels.length > 2 ? `${labels[0]} +${labels.length - 1}` : labels.join(" · ");
}

function clock(time: number) {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayWord(time: number, now: number) {
  const start = (value: number) => new Date(value).setHours(0, 0, 0, 0);
  const days = Math.round((start(time) - start(now)) / DAY);
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === 2) return "后天";
  const date = new Date(time);
  const week = "日一二三四五六"[date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 周${week}`;
}

export interface ReminderText {
  kind: "todo" | "event";
  /** 截止时间 / 开始时间；全天为当天零点；没有截止时间的待办为 null */
  anchor: number | null;
  allDay?: boolean;
  end?: number | null;
}

/** 不含倒计时的时间描述，供「稍后提醒」重写正文：「明天 18:00 截止」「14:00 – 15:30」「明天 · 全天」 */
export function reminderDetail(input: ReminderText & { now: number }): string {
  const { kind, anchor, now } = input;
  if (anchor == null) return "";
  const day = dayWord(anchor, now);
  if (input.allDay) return kind === "todo" ? `${day}到期` : `${day} · 全天`;
  const range =
    kind === "event" && input.end != null && input.end > anchor
      ? `${clock(anchor)} – ${clock(input.end)}`
      : clock(anchor);
  const prefix = day === "今天" ? "" : `${day} `;
  return kind === "todo" ? `${prefix}${range} 截止` : `${prefix}${range}`;
}

/**
 * 通知正文（标题用事项本身）：remindAt 为通知送达时刻，文案以送达时视角书写。
 * - 待办：「15 分钟后截止 · 18:00」「明天 18:00 截止」「已逾期 10 分钟」「今天到期」「待办提醒」
 * - 日程：「15 分钟后开始 · 14:00 – 15:30」「明天 14:00 – 15:30」「明天 · 全天」
 */
export function reminderBody(input: ReminderText & { remindAt: number }): string {
  const { kind, anchor, remindAt } = input;
  if (anchor == null) return "待办提醒";
  if (input.allDay) return reminderDetail({ ...input, now: remindAt });
  const range =
    kind === "event" && input.end != null && input.end > anchor
      ? `${clock(anchor)} – ${clock(input.end)}`
      : clock(anchor);
  const diff = anchor - remindAt;
  const verb = kind === "todo" ? "截止" : "开始";
  if (diff < 0) {
    const late = Math.max(1, Math.round(-diff / MINUTE));
    return kind === "todo" ? `已逾期 ${late} 分钟` : `已开始 ${late} 分钟 · ${range}`;
  }
  if (diff < MINUTE) return `现在${verb} · ${range}`;
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} 分钟后${verb} · ${range}`;
  const day = dayWord(anchor, remindAt);
  return kind === "todo" ? `${day} ${range} 截止` : `${day} ${range}`;
}
