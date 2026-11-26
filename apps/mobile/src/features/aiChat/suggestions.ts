import type { SuggestionKey } from "./askMessages";
/** 按时段给建议问题：早上问计划，下午看安排，晚上做回顾 */
export function suggestionsFor(now = new Date()): SuggestionKey[] {
  const hour = now.getHours();
  return hour < 12
    ? [
        "suggestion.todayEvents",
        "suggestion.weekTasks",
        "suggestion.yesterdayJournal",
        "suggestion.todayPriority",
      ]
    : hour < 18
      ? [
          "suggestion.remainingEvents",
          "suggestion.weekTasks",
          "suggestion.recentNotes",
          "suggestion.tomorrowPlan",
        ]
      : [
          "suggestion.tomorrowEvents",
          "suggestion.weekTasks",
          "suggestion.todayJournal",
          "suggestion.weekJournal",
        ];
}

const SUGGESTION_PROMPTS: Record<SuggestionKey, string> = {
  "suggestion.todayEvents": "今天有哪些日程",
  "suggestion.weekTasks": "这周还有哪些没完成的待办",
  "suggestion.yesterdayJournal": "总结昨天的日记",
  "suggestion.todayPriority": "今天该先做什么",
  "suggestion.remainingEvents": "今天还剩哪些安排",
  "suggestion.recentNotes": "最近在写哪些笔记",
  "suggestion.tomorrowPlan": "帮我把明天的安排理一理",
  "suggestion.tomorrowEvents": "明天有哪些日程",
  "suggestion.todayJournal": "总结一下今天的日记",
  "suggestion.weekJournal": "这周日记里有什么值得记下来的",
};
export const suggestionPrompt = (key: SuggestionKey) => SUGGESTION_PROMPTS[key];
