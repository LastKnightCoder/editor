export const DEFAULT_SYSTEM_PROMPT =
  "你是一位全能的人工助手，用户会问你一些问题，请你尽你所能进行回答。";

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
  const cleanPrompt = stripSessionTimeContext(
    basePrompt || DEFAULT_SYSTEM_PROMPT,
  );
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
当用户提到“今天 / 昨天 / 明天 / 最近”等相对时间时，请优先以以上时间信息为准；若时间语义仍有歧义，可以使用 ask-question 进一步确认。
${SESSION_TIME_CONTEXT_END}`;

  return `${cleanPrompt}\n\n${timeContext}`;
};
