/**
 * 自然语言快速添加解析（纯函数）：一行文本 → 类型 / 时间 / 周期规则 / 项目 + 剩余标题。
 *
 * 识别词表（中文口语优先，未命中的部分原样留作标题）：
 *  - 项目：`#名称`（包含匹配，取第一个命中的进行中项目）
 *  - 周期：每天 / 每日 / 工作日 / 每周一、三 / 每月 N 号(日)
 *  - 日期：今天 / 今晚 / 明天 / 明晚 / 后天 / (下)周X / M月D日 / M/D
 *  - 时刻：HH:MM、H点(半)；「晚 / 下午」且小时 < 12 时 +12
 *  - 时段：HH:MM-HH:MM（也接受 ~ 到 至）→ 计划任务
 * 判定：有周期词 → 周期任务（时刻忽略：TodoRecurrence 无时刻字段）；有时段 → 计划任务；
 * 有日期或时刻 → 截止任务（只写日期 = 全天，时间部分为 0）；否则普通任务。
 */

import type { RecurrenceType, TodoGroup } from "@/types";
import { DAY_MS, startOfDay } from "./model";

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
  const evening = /晚|下午/.test(text);

  let groupId: number | null = null;
  const tag = rest.match(/#(\S+)/);
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

  const today = startOfDay(now);
  let day: number | null = null;
  if (take(/今天|今晚/)) day = today;
  else if (take(/明天|明晚/)) day = today + DAY_MS;
  else if (take(/后天/)) day = today + 2 * DAY_MS;
  else if ((m = take(/(下)?周([一二三四五六日天])/))) {
    const target = WEEKDAY[m[2]];
    const current = new Date(now).getDay();
    // 本周剩余（含今天之后）；「下周X」固定落在下一个周一起的那一周
    const toMonday = (8 - current) % 7 || 7;
    const offset = m[1] ? toMonday + ((target + 6) % 7) : (target - current + 7) % 7 || 7;
    day = today + offset * DAY_MS;
  } else if ((m = take(/(\d{1,2})\s?月\s?(\d{1,2})\s?[日号]?|(\d{1,2})\/(\d{1,2})/))) {
    const month = Number(m[1] ?? m[3]) - 1;
    const date = Number(m[2] ?? m[4]);
    const y = new Date(now).getFullYear();
    let candidate = new Date(y, month, date).getTime();
    if (candidate < today) candidate = new Date(y + 1, month, date).getTime(); // 已过的日期视为明年
    day = candidate;
  }

  const fixHour = (h: number) => (evening && h < 12 ? h + 12 : h);
  let t1: [number, number] | null = null;
  let t2: [number, number] | null = null;
  if ((m = take(/(\d{1,2})[:：](\d{2})\s?[-–~到至]\s?(\d{1,2})[:：](\d{2})/))) {
    t1 = [fixHour(Number(m[1])), Number(m[2])];
    t2 = [fixHour(Number(m[3])), Number(m[4])];
  } else if ((m = take(/(\d{1,2})[:：](\d{2})/))) t1 = [fixHour(Number(m[1])), Number(m[2])];
  else if ((m = take(/(\d{1,2})\s?点(半|(\d{1,2})分?)?/)))
    t1 = [fixHour(Number(m[1])), m[2] === "半" ? 30 : m[3] ? Number(m[3]) : 0];
  // 已识别出时刻时，「晚上 / 下午」等时段修饰词不进标题
  if (t1) take(/早上|上午|中午|下午|晚上/);

  const title = rest.replace(/\s+/g, " ").trim();
  const at = (base: number, t: [number, number]) => base + (t[0] * 60 + t[1]) * 60_000;
  const valid = (t: [number, number] | null) => !t || (t[0] < 24 && t[1] < 60);
  if (!valid(t1) || !valid(t2)) {
    t1 = null;
    t2 = null;
  }

  if (recurrence) {
    return { title, type: "recurring", dueAt: null, startAt: null, recurrence, groupId };
  }
  if (t1 && t2) {
    const base = day ?? today;
    const startAt = at(base, t1);
    let dueAt = at(base, t2);
    if (dueAt <= startAt) dueAt += DAY_MS; // 跨零点
    return { title, type: "planned", dueAt, startAt, recurrence: null, groupId };
  }
  if (day !== null || t1) {
    let base = day ?? today;
    // 只写了时刻且已过去 → 视为明天
    if (day === null && t1 && at(base, t1) <= now) base += DAY_MS;
    return {
      title,
      type: "deadline",
      dueAt: t1 ? at(base, t1) : base,
      startAt: null,
      recurrence: null,
      groupId,
    };
  }
  return { title, type: "normal", dueAt: null, startAt: null, recurrence: null, groupId };
}
