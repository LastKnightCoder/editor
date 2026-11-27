import { documentReminderAccess } from "../doc-tasks/settings";
import { canScheduleDocumentReminder } from "@tau/shared/reminders";
import type Database from "better-sqlite3";
import {
  taskKey,
  taskReminderOnDay,
  occurrenceKey,
  TaskAssistantError,
  type TaskRef,
  type TaskOccurrenceRef,
  type DocumentTaskAttributes,
} from "@tau/shared/task-assistant";
import { readTask } from "./engine";
import { independentStates, occurrences } from "./recurrence";
import { readTaskContent, taskNode } from "../content-task-patches";
import { dateTime, localDate, refOfTodo, type Row } from "./common";
import holidayService from "../holiday-service";
import { warnThrottled } from "../../utils/throttled-log";

export interface AssistantReminder {
  taskRef: TaskRef;
  occurrence?: TaskOccurrenceRef;
  title: string;
  /** 截止时间；周期任务为当次所在日零点（allDay）；没有截止时间为 null */
  dueAt: number | null;
  /** 只有日期没有时刻（周期任务、只写了日期的文档待办） */
  allDay?: boolean;
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
    const accessByContent = new Map<number, ReturnType<typeof documentReminderAccess>>();
    for (const row of rows) {
      let access = accessByContent.get(row.content_id);
      if (!access) {
        access = documentReminderAccess(db, row.content_id);
        accessByContent.set(row.content_id, access);
      }
      if (!canScheduleDocumentReminder(access, row.task_id)) continue;
      const content = db
        .prepare("SELECT create_time FROM content_snapshots WHERE id=?")
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
    } catch (error) {
      // 任务已删除属预期；其他读库错误会让这条提醒静默漏发
      if (!(error instanceof TaskAssistantError && error.code === "NOT_FOUND"))
        warnThrottled(
          `reminder-read:${taskKey(ref)}`,
          "[task-assistant] 读取提醒对应的任务失败，该提醒跳过",
          error,
          { taskRef: taskKey(ref) }
        );
      continue;
    }
    if (task.archived) continue;
    if (!task.recurrence?.length) {
      if (task.completed) continue;
      for (const reminder of task.reminders ?? []) {
        if (!("at" in reminder)) continue;
        const remindAt = dateTime(reminder.at);
        if (remindAt > now - 86_400_000 && remindAt <= now)
          result.push({
            taskRef: ref,
            title: task.title,
            dueAt: task.dueAt ? dateTime(task.dueAt) : null,
            allDay: task.dueAt?.length === 10,
            remindAt,
          });
      }
      continue;
    }
    const offsets =
      task.reminderOffsets ??
      task.reminders?.flatMap(r => ("offsetMs" in r ? [r.offsetMs] : [])) ??
      [];
    if (!offsets.length) continue;
    const states =
      ref.kind === "todo"
        ? independentStates(db, ref)
        : ((
            taskNode(
              readTaskContent(db, ref.contentId, ref.createdAt),
              ref.taskId
            ) as DocumentTaskAttributes
          )?.taskOccurrenceState ?? {});
    let holidays: Set<number> | undefined;
    if (task.recurrence.some(segment => segment.rule?.excludeHolidays)) {
      try {
        holidays = holidayService.cachedHolidayWindow(now - 367 * 86_400_000, now + 86_400_000);
      } catch (error) {
        // 排除节假日的重复任务拿不到节假日数据时整条跳过，用户就收不到这次提醒
        warnThrottled(
          "reminder-holidays",
          "[task-assistant] 节假日数据读取失败，该提醒跳过",
          error,
          {
            taskRef: taskKey(ref),
          }
        );
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
      if (entry.state.completedAt != null || entry.state.skipped) continue;
      for (const offset of offsets) {
        const remindAt = taskReminderOnDay(dueAt, offset);
        if (remindAt !== null && remindAt > now - 86_400_000 && remindAt <= now)
          result.push({
            taskRef: ref,
            occurrence: entry.occurrence,
            title: task.title,
            dueAt: dateTime(localDate(dueAt)),
            allDay: true,
            remindAt,
          });
      }
    }
  }
  return result;
}
