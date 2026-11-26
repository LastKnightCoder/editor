import type { SuggestionKey } from "./askI18n";
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
