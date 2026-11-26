import type { TodoItemType, TodoQueryItem } from "@/types";
import type { TodoToolTranslate } from "../todo.i18n";
export type SecondaryInfoKind = "notes" | "calendar" | "recurrence";
export function todoResultTime(value: number | null | undefined, locale: string): string {
  return value
    ? new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(value)
    : "—";
}
export function todoTypeLabel(type: TodoItemType, t: TodoToolTranslate): string {
  return t(`todo.type.${type}`);
}
export function todoSecondaryInfo(item: TodoQueryItem, t: TodoToolTranslate) {
  const items: Array<{ kind: SecondaryInfoKind; text: string; tooltip: string }> = [];
  if (item.noteCount)
    items.push({
      kind: "notes",
      text: String(item.noteCount),
      tooltip: t("todo.notesTooltip", { count: item.noteCount }),
    });
  if (item.calendarMappings?.length)
    items.push({
      kind: "calendar",
      text: String(item.calendarMappings.length),
      tooltip: t("todo.calendarTooltip", { count: item.calendarMappings.length }),
    });
  if (item.recurrence)
    items.push({ kind: "recurrence", text: "", tooltip: t("todo.recurrenceTooltip") });
  return items;
}
