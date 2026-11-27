import { requireGroup } from "./directory-access";
import type Database from "better-sqlite3";
import {
  isTodoPriority,
  type TodoPriority,
  occurrenceKey,
  patchOccurrenceState,
  type TaskOccurrencePatch,
  type AssistantTask,
  type TaskOccurrenceRef,
  type TaskRecurrenceRule,
  type TaskRef,
} from "@tau/shared/task-assistant";
import ContentTable from "../tables/content";
import { pluginContentRevision } from "../tables/plugin-content-write";
import type { IContent } from "@/types/content";
import TodoGroupTable from "../tables/todo-group";
import TodoItemTable from "../tables/todo-item";
import TodoRecurrenceTable from "../tables/todo-recurrence";
import TodoRecurrenceCompletionTable from "../tables/todo-recurrence-completion";
import ItemReminderTable from "../tables/item-reminder";
import { semanticSnapshot } from "./versions";
import { captureTodos } from "./snapshots";
import { dateTime, fail, localDate, revision, todoRow } from "./common";
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
  const parent =
    row.parent_id == null
      ? undefined
      : (db.prepare("SELECT id,create_time FROM todo_item WHERE id=?").get(row.parent_id) as
          | { id: number; create_time: number }
          | undefined);
  const description = row.description_content_id
    ? ContentTable.getContentById(db, Number(row.description_content_id))
    : null;
  const snapshot = semanticSnapshot(captureTodos(db, descendantIds(db, ref.todoId)));
  const segments = independentSegments(db, ref);
  const reminderBase =
    row.type === "recurring" && segments.length
      ? dateTime(segments.at(-1)?.rule?.startDate ?? localDate(Date.now()))
      : due;
  return {
    taskRef: ref,
    isSeries: row.type === "recurring",
    revision: revision(description ? [snapshot, pluginContentRevision(description)] : snapshot),
    ...(parent
      ? { parentRef: { kind: "todo" as const, todoId: parent.id, createdAt: parent.create_time } }
      : {}),
    ...(description
      ? { description: { contentId: description.id, createdAt: description.createTime } }
      : {}),
    startAt: row.start_at == null ? null : new Date(Number(row.start_at)).toISOString(),
    title: String(row.title),
    priority: isTodoPriority(row.priority) ? row.priority : "none",
    tags: TodoItemTable.parseTags(row.tags),
    completed: !!row.is_completed,
    completedAt:
      row.is_completed && row.type !== "recurring" && row.completed_at != null
        ? Number(row.completed_at)
        : null,
    archived: !!row.is_archived,
    dueAt: due == null ? null : new Date(due).toISOString(),
    groupId: Number(row.group_id),
    reminderOffsets: ItemReminderTable.getTodoReminders(db, ref.todoId),
    reminderAt:
      reminderBase == null || row.remind_before == null
        ? null
        : new Date(reminderBase - Number(row.remind_before)).toISOString(),
    recurrence: segments,
    writable: TodoGroupTable.isWritable(db, Number(row.group_id)),
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
    priority?: TodoPriority;
    tags?: string[];
    groupId?: number;
    parentRef?: TaskRef;
    startAt?: string | null;
    description?: import("@/types/plugin-data").PluginContentSource;
    dueAt?: string | null;
    reminderAt?: string | null;
    reminderOffsets?: number[];
    recurrence?: TaskRecurrenceRule;
  },
  description?: Pick<IContent, "content" | "contracts">
): Extract<TaskRef, { kind: "todo" }> {
  if (input.description && !description) fail("INVALID_ARGUMENT", "待办描述尚未准备");
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
    priority: input.priority,
    tags: input.tags,
    groupId,
    parentId: parent ? Number(parent.id) : null,
    startAt: input.startAt == null ? null : dateTime(input.startAt),
    dueAt,
    remindBefore: reminderBefore(dueAt, input.reminderAt, !!input.recurrence),
    type: input.recurrence ? "recurring" : dueAt == null ? "normal" : "deadline",
  });
  if (description) {
    const contentId = ContentTable.createContent(db, description);
    db.prepare("UPDATE todo_item SET description_content_id=? WHERE id=?").run(contentId, item.id);
  }
  if (input.reminderOffsets !== undefined) {
    if (input.recurrence && input.reminderOffsets.some(offset => offset > 0 || offset <= -86400000))
      fail("INVALID_ARGUMENT", "周期提醒需要当日时刻偏移");
    if (input.recurrence && input.reminderOffsets.length > 1)
      fail("INVALID_ARGUMENT", "周期待办只支持一条提醒");
    if (input.reminderOffsets.length && dueAt == null && !input.recurrence)
      fail("INVALID_ARGUMENT", "提醒需要截止时间");
    ItemReminderTable.setTodoReminders(db, item.id, input.reminderOffsets);
  }
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
    completedAt?: number;
    children?: string;
    occurrence?: TaskOccurrenceRef;
    action?: string;
    scheduledAt?: string;
    effectiveDate?: string;
    rule?: TaskRecurrenceRule | null;
    statePatch?: TaskOccurrencePatch;
  },
  description?: Pick<IContent, "content" | "contracts">
) {
  const row = todoRow(db, ref);
  if (action === "update_todo") {
    const patch = input.patch;
    if (!patch || !Object.keys(patch).length) return fail("INVALID_ARGUMENT", "修改字段不能为空");
    if (patch.ensureDescription && row.description_content_id && Object.keys(patch).length === 1)
      return;
    const dueAt =
      "dueAt" in patch ? deadline(patch.dueAt as string | null) : (row.due_at as number | null);
    const recurring = row.type === "recurring";
    if (recurring && "reminderOffsets" in patch && (patch.reminderOffsets as number[]).length > 1)
      fail("INVALID_ARGUMENT", "周期待办只支持一条提醒");
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
      priority: patch.priority as TodoPriority | undefined,
      tags: patch.tags as string[] | undefined,
      ...(patch.startAt === undefined
        ? {}
        : { startAt: patch.startAt == null ? null : dateTime(patch.startAt as string) }),
      ...(patch.ensureDescription && !row.description_content_id
        ? {
            descriptionContentId: ContentTable.createContent(
              db,
              description ?? fail("INVALID_ARGUMENT", "待办描述尚未准备")
            ),
          }
        : {}),
      dueAt,
      remindBefore,
      type,
    });
    if ("reminderOffsets" in patch) {
      const offsets = patch.reminderOffsets as number[];
      if (recurring && offsets.some(offset => offset > 0 || offset <= -86400000))
        fail("INVALID_ARGUMENT", "周期提醒需要当日时刻偏移");
      if (offsets.length && dueAt == null && !recurring)
        fail("INVALID_ARGUMENT", "提醒需要截止时间");
      ItemReminderTable.setTodoReminders(db, ref.todoId, offsets);
    }
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
    const effectiveDate = input.effectiveDate;
    if (!effectiveDate) return fail("INVALID_ARGUMENT", "设置周期必须指定生效日期");
    const previous = independentSegments(db, ref);
    if (!previous.length && !input.rule) fail("INVALID_ARGUMENT", "普通待办没有可停止的重复规则");
    if (!previous.length && ItemReminderTable.getTodoReminders(db, ref.todoId).length)
      fail("INVALID_ARGUMENT", "请先清空普通待办提醒，再设置重复规则");
    const segments = amendSegments(previous, effectiveDate, input.rule ?? null);
    if (revision(segments) === revision(previous)) return;
    storeSegments(db, ref, segments);
  } else {
    const segments = independentSegments(db, ref);
    if ((segments.length && row.type === "recurring") || input.occurrence) {
      const occurrence = input.occurrence;
      if (!occurrence) return fail("INVALID_ARGUMENT", "周期待办须指定实例");
      assertOccurrence(segments, occurrence);
      let state = { ...independentStates(db, ref)[occurrenceKey(occurrence)] };
      if (input.action === "patch") {
        state = patchOccurrenceState(state, input.statePatch ?? {}, Date.now());
      } else if (action === "set_todo_completed") {
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
        occurrence.seriesId,
        occurrence.occurrenceDate,
        JSON.stringify(state),
        Date.now()
      );
      const current = TodoRecurrenceTable.getRecurrenceByItemId(db, { todoItemId: ref.todoId });
      if (current && input.action !== "reschedule") {
        const params = {
          recurrenceId: current.id,
          scheduledDate: dateTime(occurrence.occurrenceDate),
          originalOccurrence: true,
        };
        if (state.skipped) TodoRecurrenceCompletionTable.skipRecurrence(db, params);
        else if (state.completedAt != null)
          TodoRecurrenceCompletionTable.completeRecurrence(db, params);
        else TodoRecurrenceCompletionTable.uncompleteRecurrence(db, params);
      }
    } else {
      if (action !== "set_todo_completed") fail("INVALID_ARGUMENT", "普通待办没有周期实例");
      const completed = input.completed === true;
      const alreadyCompleted = completed && !!row.is_completed;
      const ids = alreadyCompleted ? [ref.todoId] : descendantIds(db, ref.todoId);
      if (
        db
          .prepare(`SELECT 1 FROM todo_item t WHERE t.id IN (${ids.map(() => "?").join(",")})
        AND (t.type='recurring' OR (SELECT h.rule_json FROM todo_recurrence_history h WHERE h.todo_item_id=t.id AND h.todo_created_at=t.create_time AND h.effective_date<=? ORDER BY h.effective_date DESC LIMIT 1) IS NOT NULL) LIMIT 1`)
          .get(...ids, localDate(Date.now()))
      )
        fail("INVALID_ARGUMENT", "包含周期任务，须指定具体实例，不能整系列或连同子项完成");
      const now = Date.now();
      if (alreadyCompleted) {
        if (input.completedAt !== undefined && input.completedAt !== row.completed_at)
          db.prepare("UPDATE todo_item SET completed_at=?,update_time=? WHERE id=?").run(
            input.completedAt,
            now,
            ref.todoId
          );
        return;
      }
      const state = Number(completed);
      db.prepare(`UPDATE todo_item SET is_completed=?,
        completed_at=CASE WHEN id=? THEN ? ELSE ? END, update_time=?
        WHERE id IN (${ids.map(() => "?").join(",")})
        AND (is_completed<>? OR (?=0 AND completed_at IS NOT NULL))`).run(
        state,
        ref.todoId,
        completed ? (input.completedAt ?? now) : null,
        completed ? now : null,
        now,
        ...ids,
        state,
        state
      );
    }
  }
}
