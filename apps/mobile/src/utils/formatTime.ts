/** 相对时间展示：今天 HH:mm / 昨天 / 今年 M月D日 / 跨年 YYYY/M/D */
export function formatTimeDisplay(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  if (isToday) {
    return time;
  } else if (isYesterday) {
    return `昨天 ${time}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** 字数与阅读时长（约 300 字/分钟，最少 1 分钟） */
export function readingMinutes(count: number): number {
  return Math.max(1, Math.round(count / 300));
}

/** 绝对时间展示（详情页 meta 行）：M月D日 HH:mm，跨年补年份 */
export function formatDateTimeCompact(ts: number): string {
  if (!ts) return "--";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const now = new Date();
  const base = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === now.getFullYear()
    ? `${base} ${time}`
    : `${date.getFullYear()}年${base} ${time}`;
}
