const SESSION_TIME_CONTEXT_START = "<SESSION_TIME_CONTEXT>";
const SESSION_TIME_CONTEXT_END = "</SESSION_TIME_CONTEXT>";

const WEEKDAY_LABELS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const stripSessionTimeContext = (prompt: string) => {
  const pattern = new RegExp(
    `${SESSION_TIME_CONTEXT_START}[\\s\\S]*?${SESSION_TIME_CONTEXT_END}\\n?`,
    "g",
  );
  return prompt.replace(pattern, "").trimEnd();
};

export const buildSessionAwareSystemPrompt = (
  basePrompt: string,
  now = new Date(),
) => {
  const cleanPrompt = stripSessionTimeContext(basePrompt || "");
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const weekday = WEEKDAY_LABELS[now.getDay()] || "星期一";

  const timeContext = `${SESSION_TIME_CONTEXT_START}
当前会话时间信息：
- 今天日期：${year}-${month}-${day}
- 今天星期：${weekday}
- 当前本地时间：${year}-${month}-${day} ${hours}:${minutes}
当用户提到“今天 / 昨天 / 明天 / 最近”等相对时间时，请优先以以上时间信息为准；若时间语义仍有歧义，可以进一步向用户确认。
${SESSION_TIME_CONTEXT_END}`;

  return cleanPrompt ? `${cleanPrompt}\n\n${timeContext}` : timeContext;
};

export const injectInlineTimeContext = (prompt: string, now = new Date()) => {
  const cleanPrompt = stripSessionTimeContext(prompt || "");
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const weekday = WEEKDAY_LABELS[now.getDay()] || "星期一";
  const currentDate = `${year}-${month}-${day}`;
  const suffix = `${SESSION_TIME_CONTEXT_START}
当前本地日期：${currentDate}
当前星期：${weekday}
回答涉及“今天 / 昨天 / 明天 / 最近”时，请以该日期为准。
${SESSION_TIME_CONTEXT_END}`;
  return cleanPrompt ? `${cleanPrompt}\n\n${suffix}` : suffix;
};

export const isDateOnlyString = (value: string) =>
  DATE_ONLY_PATTERN.test(value);
