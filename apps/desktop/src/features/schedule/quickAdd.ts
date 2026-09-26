/**
 * 快速添加的自然语言解析（纯函数，右栏输入框用）。
 *
 * 识别并从标题中摘除：
 * - 日历：`#工作`（按日历名精确匹配，其次前缀匹配）
 * - 日期：今天 / 明天 / 后天 / 大后天、明早 / 明晚 / 今晚、周X / 星期X / 下周X、
 *   周末 / 这周末 / 下周末（= 该周六；今天已是周末则「周末」取今天）、
 *   M月D日、M/D、D号（未写日期时用当前选中日）
 * - 时间：15:00、3点、3点半、3点15、下午3点、15:00-16:30、3点到5点半；
 *   不带时段的 1–6 点按下午算（「3点开会」多指 15:00）；只有开始时间时默认 1 小时
 * 没有时间 = 全天日程。
 */

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

const PERIOD = "凌晨|早上|早晨|上午|中午|下午|傍晚|晚上";
const H = "\\d{1,2}|[零一二两三四五六七八九十]{1,3}";
const CLOCK = `(?:\\d{1,2}[:：]\\d{2}|(?:${H})(?:点|时)(?:半|一刻|三刻|\\d{1,2}分?)?)`;
const TIME_RE = new RegExp(
  `(${PERIOD})?\\s*(${CLOCK})(?:\\s*(?:-|~|～|—|到|至)\\s*(${PERIOD})?\\s*(${CLOCK}))?`
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

function dayStart(d: Date) {
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

export function parseQuickAdd(
  input: string,
  options: { baseDate: number; now?: Date; calendars: QuickAddCalendar[] }
): QuickAddResult {
  const now = options.now ?? new Date();
  const today = dayStart(now);
  let rest = ` ${input} `;
  const hints: QuickAddResult["hints"] = {};
  let date: number | null = null;
  let impliedPeriod: string | undefined;

  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  // 日历：#名称
  let calendarId: number | null = null;
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
      hints.calendar = found.title;
    }
  }

  // 日期
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

  // 时间
  let startTime: number | null = null;
  let endTime: number | null = null;
  const tm = rest.match(TIME_RE);
  if (tm) {
    const start = parseClock(tm[2], tm[1] ?? impliedPeriod);
    if (start !== null) {
      startTime = start;
      const end = tm[4] ? parseClock(tm[4], tm[3] ?? tm[1] ?? impliedPeriod) : null;
      endTime = end !== null && end > start ? end : Math.min(start + 60, 24 * 60 - 1);
      rest = rest.replace(tm[0], " ");
      hints.time = tm[0].trim();
    }
  }

  return {
    title: rest.replace(/\s+/g, " ").trim(),
    date: date ?? dayStart(new Date(options.baseDate)),
    startTime,
    endTime: startTime === null ? null : endTime,
    calendarId,
    hints,
  };
}
