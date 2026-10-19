const dateTime = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO UTC → 本地时间 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTime.format(date);
}

const shortDate = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
const longDate = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** 列表里的相对时间：一周内说「N 天前」，更早给日期 */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "昨天" : `${days} 天前`;
  const date = new Date(time);
  return date.getFullYear() === new Date(now).getFullYear()
    ? shortDate.format(date)
    : longDate.format(date);
}

/** 下载量等计数：万以上缩写 */
export function formatCount(value: number): string {
  return value >= 10_000
    ? `${(value / 10_000).toFixed(1).replace(/\.0$/, "")} 万`
    : value.toLocaleString("zh-CN");
}
