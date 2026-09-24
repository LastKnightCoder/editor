/** 发布页时间文案：分钟/小时粒度的「多久前」与耗时。 */

export function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}
