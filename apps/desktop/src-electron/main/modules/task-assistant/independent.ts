import type Database from "better-sqlite3";
import {
  occurrenceKey,
  type AssistantTask,
  type TaskOccurrenceRef,
  type TaskRecurrenceRule,
  type TaskRef,
} from "@tau/shared/task-assistant";
import TodoItemTable from "../tables/todo-item";
import TodoRecurrenceTable from "../tables/todo-recurrence";
import TodoRecurrenceCompletionTable from "../tables/todo-recurrence-completion";
import { captureTodos } from "./snapshots";
import { dateTime, fail, localDate, requireGroup, revision, todoRow } from "./common";
import { amendSegments, independentSegments, independentStates, storeSegments } from "./recurrence";
import { assertTaskOccurrence as assertOccurrence } from "./holidays";

export function descendantIds(db: Database.Database, id: number): number[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
    SELECT id FROM todo_item WHERE id=? UNION SELECT t.id FROM todo_item t JOIN descendants d ON t.parent_id=d.id
  ) SELECT id FROM descendants LIMIT 1001`
    )
    .all(id) as { id: number }[];
  if (rows.length > 1000) fail("LIMIT_EXCEEDED", "本次操作影响超过 1000 个子任务，请拆分处理");
  return rows.map(row => row.id);
}
export function readIndependentTask(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "todo" }>
): AssistantTask {
  const row = todoRow(db, ref);
  const due = row.due_at == null ? null : Number(row.due_at);
  const segments = independentSegments(db, ref);
  const reminderBase = segments.length
    ? dateTime(segments.at(-1)!.rule?.startDate ?? localDate(Date.now()))
    : due;
  return {
    taskRef: ref,
    revision: revision(captureTodos(db, descendantIds(db, ref.todoId))),
    title: String(row.title),
    completed: !!row.is_completed,
    archived: !!row.is_archived,
    dueAt: due == null ? null : new Date(due).toISOString(),
    groupId: Number(row.group_id),
    reminderAt:
      reminderBase == null || row.remind_before == null
        ? null
        : new Date(reminderBase - Number(row.remind_before)).toISOString(),
    recurrence: segments,
    writable: true,
  };
}

function deadline(value: string | null | undefined) {
  if (value == null) return null;
  if (value.length !== 10) return dateTime(value);
  const date = new Date(dateTime(value));
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
function reminderBefore(
  due: number | null,
  reminder?: string | null,
  recurring = false
): number | null {
  if (reminder == null) return null;
  if (reminder.length === 10) return fail("INVALID_ARGUMENT", "提醒需要明确时刻");
  if (recurring) return -(dateTime(reminder) - dateTime(localDate(dateTime(reminder))));
  if (due == null) return fail("INVALID_ARGUMENT", "普通待办提醒需要截止时间");
  const difference = due - dateTime(reminder);
  if (difference < 0) fail("INVALID_ARGUMENT", "提醒不能晚于截止时间");
  return difference;
}
export function createIndependent(
  db: Database.Database,
  input: {
    title: string;
    groupId?: number;
    parentRef?: TaskRef;
    dueAt?: string | null;
    reminderAt?: string | null;
    recurrence?: TaskRecurrenceRule;
  }
): Extract<TaskRef, { kind: "todo" }> {
  const parent = input.parentRef ? todoRow(db, input.parentRef) : undefined;
  const groupId =
    input.groupId ??
    (parent ? Number(parent.group_id) : undefined) ??
    (
      db
        .prepare("SELECT id FROM todo_group WHERE is_system=1 AND system_type='normal' LIMIT 1")
        .get() as { id: number } | undefined
    )?.id;
  if (!groupId) return fail("INVALID_ARGUMENT", "请指定待办所属项目");
  requireGroup(db, groupId);
  if (parent && parent.group_id !== groupId) fail("INVALID_ARGUMENT", "父待办必须属于同一项目");
  const dueAt = deadline(input.dueAt);
  const item = TodoItemTable.createItem(db, {
    title: input.title,
    groupId,
    parentId: parent ? Number(parent.id) : null,
    dueAt,
    remindBefore: reminderBefore(dueAt, input.reminderAt, !!input.recurrence),
    type: input.recurrence ? "recurring" : dueAt == null ? "normal" : "deadline",
  });
  const ref = { kind: "todo" as const, todoId: item.id, createdAt: item.createTime };
  if (input.recurrence)
    storeSegments(db, ref, amendSegments([], input.recurrence.startDate, input.recurrence));
  return ref;
}

export function mutateIndependent(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "todo" }>,
  action: string,
  input: {
    patch?: Record<string, unknown>;
    completed?: boolean;
    children?: string;
    occurrence?: TaskOccurrenceRef;
    action?: string;
    scheduledAt?: string;
    effectiveDate?: string;
    rule?: TaskRecurrenceRule | null;
  }
) {
  const row = todoRow(db, ref);
  if (action === "update_todo") {
    const patch = input.patch!;
    if (!patch || !Object.keys(patch).length) fail("INVALID_ARGUMENT", "修改字段不能为空");
    const dueAt =
      "dueAt" in patch ? deadline(patch.dueAt as string | null) : (row.due_at as number | null);
    const recurring = independentSegments(db, ref).length > 0;
    const remindBefore =
      "reminderAt" in patch
        ? reminderBefore(dueAt, patch.reminderAt as string | null, recurring)
        : dueAt == null && !recurring
          ? null
          : (row.remind_before as number | null);
    const type = recurring ? "recurring" : dueAt == null ? "normal" : "deadline";
    TodoItemTable.updateItem(db, {
      id: ref.todoId,
      title: patch.title as string | undefined,
      dueAt,
      remindBefore,
      type,
    });
    if ("archived" in patch)
      TodoItemTable.archiveItem(db, { id: ref.todoId, isArchived: patch.archived === true });
    if ("groupId" in patch || "parentRef" in patch) {
      const ids = descendantIds(db, ref.todoId);
      const parent = patch.parentRef as TaskRef | null | undefined;
      const parentRow = parent ? todoRow(db, parent) : undefined;
      if (parentRow && ids.includes(Number(parentRow.id)))
        fail("INVALID_ARGUMENT", "不能将待办移动到自身或子项之下");
      const group = Number(patch.groupId ?? parentRow?.group_id ?? row.group_id);
      requireGroup(db, group);
      if (parentRow && parentRow.group_id !== group)
        fail("INVALID_ARGUMENT", "父待办必须属于目标项目");
      TodoItemTable.moveAndReorder(db, {
        id: ref.todoId,
        toGroupId: group,
        toParentId:
          "parentRef" in patch
            ? parentRow
              ? Number(parentRow.id)
              : null
            : group === row.group_id
              ? (row.parent_id as number | null)
              : null,
      });
    }
  } else if (action === "delete_todo") {
    const descendants = descendantIds(db, ref.todoId);
    if (descendants.length > 1 && (!input.children || input.children === "reject"))
      fail("HAS_CHILDREN", "待办包含子项，请明确保留或级联删除");
    if (input.children === "preserve")
      db.prepare("UPDATE todo_item SET parent_id=?,update_time=? WHERE parent_id=?").run(
        row.parent_id,
        Date.now(),
        ref.todoId
      );
    const ids = input.children === "cascade" ? descendants : [ref.todoId];
    TodoItemTable.deleteItemsWithRelations(db, ids);
    for (const id of ids) {
      db.prepare("DELETE FROM todo_recurrence_history WHERE todo_item_id=?").run(id);
      db.prepare("DELETE FROM todo_occurrence_override WHERE todo_item_id=?").run(id);
    }
  } else if (action === "set_todo_recurrence") {
    const segments = amendSegments(
      independentSegments(db, ref),
      input.effectiveDate!,
      input.rule ?? null
    );
    storeSegments(db, ref, segments);
  } else {
    const segments = independentSegments(db, ref);
    if (segments.length || input.occurrence) {
      if (!input.occurrence) fail("INVALID_ARGUMENT", "周期待办须指定实例");
      assertOccurrence(segments, input.occurrence!);
      const state = { ...independentStates(db, ref)[occurrenceKey(input.occurrence!)] };
      if (action === "set_todo_completed") {
        state.completedAt = input.completed ? Date.now() : null;
        state.skipped = false;
      } else if (input.action === "reschedule") {
        if (!input.scheduledAt) fail("INVALID_ARGUMENT", "改期必须指定 scheduledAt");
        state.scheduledAt = input.scheduledAt;
      } else {
        state.skipped = input.action === "skip";
        state.completedAt = null;
      }
      db.prepare(
        `INSERT INTO todo_occurrence_override VALUES (?,?,?,?,?,?)
        ON CONFLICT(todo_item_id,todo_created_at,series_id,occurrence_date)
        DO UPDATE SET state_json=excluded.state_json,update_time=excluded.update_time`
      ).run(
        ref.todoId,
        ref.createdAt,
        input.occurrence!.seriesId,
        input.occurrence!.occurrenceDate,
        JSON.stringify(state),
        Date.now()
      );
      const current = TodoRecurrenceTable.getRecurrenceByItemId(db, { todoItemId: ref.todoId });
      if (current && input.action !== "reschedule") {
        const params = {
          recurrenceId: current.id,
          scheduledDate: dateTime(input.occurrence!.occurrenceDate),
          originalOccurrence: true,
        };
        if (state.skipped) TodoRecurrenceCompletionTable.skipRecurrence(db, params);
        else if (state.completedAt) TodoRecurrenceCompletionTable.completeRecurrence(db, params);
        else TodoRecurrenceCompletionTable.uncompleteRecurrence(db, params);
      }
    } else {
      if (action !== "set_todo_completed") fail("INVALID_ARGUMENT", "普通待办没有周期实例");
      TodoItemTable.toggleCompleteCascade(db, {
        id: ref.todoId,
        isCompleted: input.completed === true,
      });
    }
  }
}
