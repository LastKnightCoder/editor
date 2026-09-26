/**
 * 自然语言快速添加解析（纯函数）：一行文本 → 类型 / 时间 / 周期规则 / 项目 + 剩余标题。
 *
 * 识别词表（中文口语优先，未命中的部分原样留作标题）：
 *  - 项目：`#名称`（包含匹配，取第一个命中的进行中项目）
 *  - 周期：每天 / 每日 / 工作日 / 每周一、三 / 每月 N 号(日)
 *  - 日期 / 时刻 / 时段：与日程快速添加同一套词表（utils/quickDateTime）
 * 判定：有周期词 → 周期任务（时刻忽略：TodoRecurrence 无时刻字段）；有时段 → 计划任务；
 * 有日期或时刻 → 截止任务（只写日期 = 全天，时间部分为 0）；否则普通任务。
 */

import type { RecurrenceType, TodoGroup } from "@/types";
import { extractDateTime } from "@/utils/quickDateTime";
import { DAY_MS, dateTimeWord, hm, recurrenceText, startOfDay } from "./model";

export interface QuickAddRecurrence {
  type: RecurrenceType;
  weekdays?: number[];
  monthDay?: number;
}

export interface QuickAddResult {
  title: string;
  type: "normal" | "deadline" | "planned" | "recurring";
  dueAt: number | null;
  startAt: number | null;
  recurrence: QuickAddRecurrence | null;
  groupId: number | null;
}

const WEEKDAY: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

export function parseQuickAdd(
  text: string,
  options: { now: number; groups: Pick<TodoGroup, "id" | "title">[] }
): QuickAddResult {
  const { now, groups } = options;
  let rest = ` ${text} `;
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  let groupId: number | null = null;
  const tag = rest.match(/[#＃](\S+)/);
  if (tag) {
    const hit = groups.find(g => g.title.includes(tag[1]) || tag[1].includes(g.title));
    // 未命中的 #词保留在标题里
    if (hit) {
      groupId = hit.id;
      rest = rest.replace(tag[0], " ");
    }
  }

  let recurrence: QuickAddRecurrence | null = null;
  let m: RegExpMatchArray | null;
  if (take(/每天|每日/)) recurrence = { type: "daily" };
  else if (take(/工作日/)) recurrence = { type: "weekdays" };
  else if ((m = take(/每周([一二三四五六日天、,，]+)/)))
    recurrence = {
      type: "weekly",
      weekdays: [...new Set([...m[1].replace(/[、,，]/g, "")].map(c => WEEKDAY[c]))],
    };
  else if ((m = take(/每月\s?(\d{1,2})\s?[号日]/)))
    recurrence = { type: "monthly", monthDay: Math.min(31, Math.max(1, Number(m[1]))) };

  const dt = extractDateTime(rest, new Date(now));
  const title = dt.rest.replace(/\s+/g, " ").trim();
  const today = startOfDay(now);
  const at = (base: number, minutes: number) => base + minutes * 60_000;

  if (recurrence) {
    return { title, type: "recurring", dueAt: null, startAt: null, recurrence, groupId };
  }
  if (dt.startTime !== null && dt.endTime !== null) {
    const base = dt.date ?? today;
    const startAt = at(base, dt.startTime);
    let dueAt = at(base, dt.endTime);
    if (dueAt <= startAt) dueAt += DAY_MS; // 跨零点
    return { title, type: "planned", dueAt, startAt, recurrence: null, groupId };
  }
  if (dt.date !== null || dt.startTime !== null) {
    let base = dt.date ?? today;
    // 只写了时刻且已过去 → 视为明天
    if (dt.date === null && dt.startTime !== null && at(base, dt.startTime) <= now) base += DAY_MS;
    return {
      title,
      type: "deadline",
      dueAt: dt.startTime !== null ? at(base, dt.startTime) : base,
      startAt: null,
      recurrence: null,
      groupId,
    };
  }
  return { title, type: "normal", dueAt: null, startAt: null, recurrence: null, groupId };
}

/** 识别结果的一句话描述：「截止 · 明天 17:00」「计划 · 周六 10:00–12:00」「周期 · 每周一、四」 */
export function describeQuickAdd(parsed: QuickAddResult, now: number): string {
  switch (parsed.type) {
    case "recurring":
      return `周期 · ${recurrenceText({
        id: 0,
        todoItemId: 0,
        type: parsed.recurrence!.type,
        interval: 1,
        weekdays: parsed.recurrence!.weekdays ?? null,
        monthDay: parsed.recurrence!.monthDay ?? null,
        excludeHolidays: false,
        startDate: now,
        createTime: now,
        updateTime: now,
      })}`;
    case "planned":
      return `计划 · ${dateTimeWord(parsed.startAt!, now)}–${hm(parsed.dueAt!)}`;
    case "deadline":
      return `截止 · ${dateTimeWord(parsed.dueAt!, now)}`;
    default:
      return "普通任务";
  }
}
