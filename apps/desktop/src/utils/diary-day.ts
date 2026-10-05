/**
 * 日记的「归属日」：日记现在只有按天的碎片（segment），旧库里的 weekly / monthly 条目
 * （date 为 YYYY-Www / YYYY-MM）归一到该周周一 / 该月 1 日，「周记」「月记」只是标签。
 * 纯函数，主进程（搜索标题、脉络）、渲染端（日记页、打开实体）共用。
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地时区的 YYYY-MM-DD */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 旧格式 YYYY-Www / YYYY-MM 归一到首日；无效时回落到 createTime 当天 */
export function normalizeDiaryDay(entryDate: string, createTime: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return entryDate;
  const week = entryDate.match(/^(\d{4})-W(\d{2})$/);
  if (week) {
    // ISO 周：1 月 4 日所在周为第 1 周，周一起
    const jan4 = new Date(Number(week[1]), 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (Number(week[2]) - 1) * 7);
    return dayKey(monday.getTime());
  }
  const month = entryDate.match(/^(\d{4})-(\d{2})$/);
  if (month) return `${month[1]}-${month[2]}-01`;
  return dayKey(createTime);
}
