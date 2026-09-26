/**
 * 快速添加的自然语言解析（纯函数，右栏输入框用）。
 *
 * 识别并从标题中摘除：
 * - 日历：`#工作`（按日历名精确匹配，其次前缀匹配）
 * - 日期 / 时间：见 utils/quickDateTime（未写日期时用当前选中日）；
 *   只有开始时间时默认 1 小时，结束早于开始按 1 小时
 * 没有时间 = 全天日程。
 */

import { dayStart, extractDateTime } from "@/utils/quickDateTime";

export interface QuickAddCalendar {
  id: number;
  title: string;
}

export interface QuickAddResult {
  title: string;
  /** 日期（本地 0 点时间戳） */
  date: number;
  /** 分钟数；null = 全天 */
  startTime: number | null;
  endTime: number | null;
  calendarId: number | null;
  /** 解析命中的片段（输入框下方回显） */
  hints: { date?: string; time?: string; calendar?: string };
}

export function parseQuickAdd(
  input: string,
  options: { baseDate: number; now?: Date; calendars: QuickAddCalendar[] }
): QuickAddResult {
  let rest = ` ${input} `;

  // 日历：#名称
  let calendarId: number | null = null;
  let calendarHint: string | undefined;
  const tag = rest.match(/[#＃](\S+)/);
  if (tag) {
    const name = tag[1];
    const found =
      options.calendars.find(c => c.title === name) ??
      options.calendars.find(c => c.title.startsWith(name));
    // 匹配不到日历的标签原样留在标题里
    if (found) {
      rest = rest.replace(tag[0], " ");
      calendarId = found.id;
      calendarHint = found.title;
    }
  }

  const dt = extractDateTime(rest, options.now ?? new Date());
  const { startTime } = dt;
  const endTime =
    startTime === null
      ? null
      : dt.endTime !== null && dt.endTime > startTime
        ? dt.endTime
        : Math.min(startTime + 60, 24 * 60 - 1);

  return {
    title: dt.rest.replace(/\s+/g, " ").trim(),
    date: dt.date ?? dayStart(new Date(options.baseDate)),
    startTime,
    endTime,
    calendarId,
    hints: { ...dt.hints, ...(calendarHint ? { calendar: calendarHint } : {}) },
  };
}
