import type Database from "better-sqlite3";
import {
  taskKey,
  occurrenceKey,
  type TaskRef,
  type TaskOccurrenceRef,
  type DocumentTaskAttributes,
} from "@tau/shared/task-assistant";
import { readTask } from "./engine";
import { independentStates, occurrences } from "./recurrence";
import { readTaskContent, taskNode } from "../content-task-patches";
import { dateTime, localDate, refOfTodo, type Row } from "./common";
import holidayService from "../holiday-service";

export interface AssistantReminder {
  taskRef: TaskRef;
  occurrence?: TaskOccurrenceRef;
  title: string;
  dueAt: number;
  remindAt: number;
}
export const assistantReminderKey = (value: AssistantReminder) =>
  `${taskKey(value.taskRef)}:${value.occurrence ? occurrenceKey(value.occurrence) : ""}:${value.remindAt}`;

export function assistantReminders(
  db: Database.Database,
  indexDb: Database.Database | undefined,
  now: number
): AssistantReminder[] {
  const refs: TaskRef[] = (
    db
      .prepare(
        "SELECT * FROM todo_item WHERE type='recurring' AND is_archived=0 AND remind_before IS NOT NULL"
      )
      .all() as Row[]
  ).map(refOfTodo);
  if (indexDb) {
    const rows = indexDb
      .prepare(
        "SELECT content_id,task_id FROM doc_task_attributes WHERE reminder_at IS NOT NULL AND archived=0"
      )
      .all() as Array<{ content_id: number; task_id: string }>;
    for (const row of rows) {
      if (
        db
          .prepare(
            "SELECT 1 FROM doc_task_settings WHERE content_id=? AND (kind='excluded' OR (kind='promoted' AND task_id=?))"
          )
          .get(row.content_id, row.task_id)
      )
        continue;
      const content = db
        .prepare("SELECT create_time FROM contents WHERE id=?")
        .get(row.content_id) as { create_time: number } | undefined;
      if (content)
        refs.push({
          kind: "document",
          contentId: row.content_id,
          createdAt: content.create_time,
          taskId: row.task_id,
        });
    }
  }
  const result: AssistantReminder[] = [];
  for (const ref of refs) {
    let task: ReturnType<typeof readTask>;
    try {
      task = readTask(db, ref);
    } catch {
      continue;
    }
    if (!task.reminderAt || task.archived) continue;
    if (!task.recurrence?.length) {
      const remindAt = dateTime(task.reminderAt);
      if (!task.completed && remindAt > now - 86_400_000 && remindAt <= now)
        result.push({
          taskRef: ref,
          title: task.title,
          dueAt: task.dueAt ? dateTime(task.dueAt) : remindAt,
          remindAt,
        });
      continue;
    }
    const states =
      ref.kind === "todo"
        ? independentStates(db, ref)
        : ((
            taskNode(
              readTaskContent(db, ref.contentId, ref.createdAt),
              ref.taskId
            ) as DocumentTaskAttributes
          )?.taskOccurrenceState ?? {});
    const configured = dateTime(task.reminderAt),
      offset = configured - dateTime(localDate(configured));
    let holidays: Set<number> | undefined;
    if (task.recurrence.some(segment => segment.rule?.excludeHolidays)) {
      try {
        holidays = holidayService.cachedHolidayWindow(now - 367 * 86_400_000, now + 86_400_000);
      } catch {
        continue;
      }
    }
    for (const entry of occurrences(
      task.recurrence,
      states,
      localDate(now - 86_400_000),
      localDate(now + 86_400_000),
      holidays
    )) {
      const dueAt = dateTime(entry.scheduledAt);
      const remindAt = dateTime(localDate(dueAt)) + offset;
      if (
        !entry.state.completedAt &&
        !entry.state.skipped &&
        remindAt > now - 86_400_000 &&
        remindAt <= now
      )
        result.push({
          taskRef: ref,
          occurrence: entry.occurrence,
          title: task.title,
          dueAt,
          remindAt,
        });
    }
  }
  return result;
}
