/**
 * 快速添加共用的中文日期 / 时刻识别（纯函数）：日程快速添加、待办快速添加、命令面板共用一套词表。
 *
 * - 日期：今天 / 明天 / 后天 / 大后天、明早 / 明晚 / 今晚、周X / 星期X / 下周X / 下下周X、
 *   周末 / 这周末 / 下周末（= 该周六；今天已是周末则「周末」取今天）、
 *   M月D日、M/D（已过的按明年）、D号（当月）
 * - 时刻：15:00、3点、3点半、3点15、三点一刻、下午3点、15:00-16:30、3点到5点半；
 *   不带时段的 1–6 点按下午算（「3点开会」多指 15:00）；「明早 / 今晚」带出隐含时段
 * 命中片段从文本中摘除，剩余部分交给调用方继续解析标题。
 */

const PERIOD = "凌晨|早上|早晨|上午|中午|下午|傍晚|晚上";
const H = "\\d{1,2}|[零一二两三四五六七八九十]{1,3}";
const CLOCK = `(?:\\d{1,2}[:：]\\d{2}|(?:${H})(?:点|时)(?:半|一刻|三刻|\\d{1,2}分?)?)`;
const TIME_RE = new RegExp(
  `(${PERIOD})?\\s*(${CLOCK})(?:\\s*(?:-|–|~|～|—|到|至)\\s*(${PERIOD})?\\s*(${CLOCK}))?`
);
const WEEKDAY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
};
const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function cnNumber(text: string): number {
  if (/^\d+$/.test(text)) return Number(text);
  if (!text.includes("十")) return CN_DIGIT[text] ?? NaN;
  const [tens, ones] = text.split("十");
  return (tens ? (CN_DIGIT[tens] ?? NaN) : 1) * 10 + (ones ? (CN_DIGIT[ones] ?? NaN) : 0);
}

export function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addDays(ts: number, n: number) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** 解析单个时刻（分钟数），period 决定 12 小时制换算 */
function parseClock(text: string, period: string | undefined): number | null {
  let hour: number;
  let minute = 0;
  const colon = text.match(/^(\d{1,2})[:：](\d{2})$/);
  if (colon) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else {
    const m = text.match(new RegExp(`^(${H})(?:点|时)(半|一刻|三刻|(\\d{1,2})分?)?$`));
    if (!m) return null;
    hour = cnNumber(m[1]);
    if (m[2] === "半") minute = 30;
    else if (m[2] === "一刻") minute = 15;
    else if (m[2] === "三刻") minute = 45;
    else if (m[3]) minute = Number(m[3]);
  }
  if (Number.isNaN(hour) || hour > 24 || minute > 59) return null;

  if (period) {
    if (/下午|傍晚|晚上/.test(period) && hour < 12) hour += 12;
    else if (period === "中午" && hour < 11) hour += 12;
    else if (/凌晨|早|上午/.test(period) && hour === 12) hour = 0;
  } else if (!colon && hour >= 1 && hour <= 6) {
    hour += 12;
  }
  return Math.min(hour * 60 + minute, 24 * 60 - 1);
}

export interface DateTimeMatch {
  /** 摘除命中片段后的剩余文本（未压缩空白） */
  rest: string;
  /** 日期（本地 0 点时间戳）；null = 没写日期 */
  date: number | null;
  /** 开始时刻（分钟数）；null = 没写时刻 */
  startTime: number | null;
  /** 显式写出的结束时刻（分钟数，可能 ≤ 开始 = 跨零点）；null = 没写范围 */
  endTime: number | null;
  /** 命中的原文片段（回显用） */
  hints: { date?: string; time?: string };
}

export function extractDateTime(input: string, now: Date = new Date()): DateTimeMatch {
  const today = dayStart(now);
  let rest = input;
  const hints: DateTimeMatch["hints"] = {};
  let date: number | null = null;
  let impliedPeriod: string | undefined;

  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  const relative: [RegExp, number, string?][] = [
    [/大后天/, 3],
    [/后天/, 2],
    [/明早/, 1, "早上"],
    [/明晚/, 1, "晚上"],
    [/明[天日]/, 1],
    [/今晚/, 0, "晚上"],
    [/今[天日]/, 0],
  ];
  for (const [re, offset, period] of relative) {
    const m = take(re);
    if (m) {
      date = addDays(today, offset);
      impliedPeriod = period;
      hints.date = m[0];
      break;
    }
  }
  if (date === null) {
    const m = take(/(下下|下|这|本)?(?:周末|礼拜末)/);
    if (m) {
      const dow = ((now.getDay() + 6) % 7) + 1;
      const monday = addDays(today, 1 - dow);
      const weeks = m[1] === "下下" ? 2 : m[1] === "下" ? 1 : 0;
      // 本周末：周六；今天已是周六 / 周日就取今天
      date = weeks === 0 && dow >= 6 ? today : addDays(monday, weeks * 7 + 5);
      hints.date = m[0];
    }
  }
  if (date === null) {
    const m = take(/(下下|下)?(?:周|星期|礼拜)([一二三四五六日天1-7])/);
    if (m) {
      const target = WEEKDAY[m[2]];
      const dow = ((now.getDay() + 6) % 7) + 1;
      const monday = addDays(today, 1 - dow);
      const weeks = m[1] === "下下" ? 2 : m[1] === "下" ? 1 : 0;
      date = addDays(monday, weeks * 7 + target - 1);
      if (!m[1] && date < today) date = addDays(date, 7);
      hints.date = m[0];
    }
  }
  if (date === null) {
    const m = take(/(\d{1,2})月(\d{1,2})[日号]?/) ?? take(/(?<![\d:：])(\d{1,2})\/(\d{1,2})(?!\d)/);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        let candidate = new Date(now.getFullYear(), month - 1, day).getTime();
        // 早于今天的月日按明年算
        if (candidate < today)
          candidate = new Date(now.getFullYear() + 1, month - 1, day).getTime();
        date = candidate;
        hints.date = m[0];
      }
    }
  }
  if (date === null) {
    const m = take(/(?<![\d月])(\d{1,2})[号日]/);
    if (m) {
      const day = Number(m[1]);
      if (day >= 1 && day <= 31) {
        date = new Date(now.getFullYear(), now.getMonth(), day).getTime();
        hints.date = m[0];
      }
    }
  }

  let startTime: number | null = null;
  let endTime: number | null = null;
  const tm = rest.match(TIME_RE);
  if (tm) {
    const start = parseClock(tm[2], tm[1] ?? impliedPeriod);
    if (start !== null) {
      startTime = start;
      endTime = tm[4] ? parseClock(tm[4], tm[3] ?? tm[1] ?? impliedPeriod) : null;
      rest = rest.replace(tm[0], " ");
      hints.time = tm[0].trim();
    }
  }

  return { rest, date, startTime, endTime, hints };
}
