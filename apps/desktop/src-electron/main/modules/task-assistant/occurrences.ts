import type Database from "better-sqlite3";
import {
  occurrenceKey,
  taskKey,
  TaskAssistantError,
  type TaskRef,
  type DocumentTaskAttributes,
  type TaskOccurrenceRef,
} from "@tau/shared/task-assistant";
import type { PluginTodoOccurrencePage } from "@tau/plugins";
import { readTask } from "./engine";
import { readTaskContent, taskNode } from "../content-task-patches";
import { assertPluginTaskVisible } from "./document-access";
export { assertPluginTaskVisible } from "./document-access";
import { independentStates } from "./recurrence";
import { assertTaskOccurrence } from "./holidays";
import { fail, instanceRevision, revision } from "./common";

export function taskStates(db: Database.Database, ref: TaskRef) {
  return ref.kind === "todo"
    ? independentStates(db, ref)
    : ((
        taskNode(readTaskContent(db, ref.contentId, ref.createdAt), ref.taskId) as
          | DocumentTaskAttributes
          | undefined
      )?.taskOccurrenceState ?? {});
}
export function readTaskInstance(db: Database.Database, ref: TaskRef, originalDate: string) {
  assertPluginTaskVisible(db, ref);
  const task = readTask(db, ref);
  const segment = [...(task.recurrence ?? [])]
    .reverse()
    .find(value => value.effectiveDate <= originalDate);
  if (!segment?.rule) return fail("NOT_FOUND", "指定周期实例不存在");
  const occurrence = { seriesId: segment.seriesId, occurrenceDate: originalDate };
  assertTaskOccurrence(task.recurrence ?? [], occurrence);
  const state = taskStates(db, ref)[occurrenceKey(occurrence)] ?? {};
  return {
    ...task,
    revision: instanceRevision(task, occurrence, state),
    occurrence,
    occurrenceState: state,
    completed: state.completedAt != null,
    dueAt: state.scheduledAt ?? originalDate,
  };
}
export function readOccurrenceStatePage(
  db: Database.Database,
  ref: TaskRef,
  limit: number,
  cursor?: string,
  scope = db.name
) {
  assertPluginTaskVisible(db, ref);
  const task = readTask(db, ref);
  const binding = revision([scope, taskKey(ref)]);
  let after = "";
  if (cursor) {
    let value: { binding: string; revision: string; after: string };
    try {
      value = JSON.parse(cursor);
    } catch {
      return fail("INVALID_ARGUMENT", "实例状态游标无效");
    }
    if (value.binding !== binding || typeof value.after !== "string")
      fail("INVALID_ARGUMENT", "实例状态游标范围无效");
    if (value.revision !== task.revision) fail("VERSION_CONFLICT", "实例状态已变化，请重新读取");
    after = value.after;
  }
  const states = taskStates(db, ref);
  const keys = Object.keys(states)
    .sort()
    .filter(key => key > after)
    .slice(0, limit + 1);
  return { task, binding, states, keys };
}
export function queryOccurrenceStates(
  db: Database.Database,
  ref: TaskRef,
  limit: number,
  cursor?: string,
  scope = db.name
): PluginTodoOccurrencePage {
  const { task, binding, states, keys } = readOccurrenceStatePage(db, ref, limit, cursor, scope);
  const items = keys.slice(0, limit).map(key => {
    const split = key.lastIndexOf("/"),
      seriesId = key.slice(0, split),
      originalDate = key.slice(split + 1);
    const occurrence: TaskOccurrenceRef = { seriesId, occurrenceDate: originalDate };
    let active = true;
    try {
      assertTaskOccurrence(task.recurrence ?? [], occurrence);
    } catch (error) {
      if (error instanceof TaskAssistantError && error.code === "NOT_FOUND") active = false;
      else throw error;
    }
    return { taskId: taskKey(ref), seriesId, originalDate, state: states[key], active };
  });
  return {
    taskRevision: task.revision,
    items,
    ...(keys.length > limit
      ? { cursor: JSON.stringify({ binding, revision: task.revision, after: keys[limit - 1] }) }
      : {}),
  };
}
