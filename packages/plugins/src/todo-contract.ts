import {
  TASK_WRITE_SCHEMAS,
  validateTaskValue,
  normalizeTaskRecurrenceRule,
  parseTaskKey,
  type TaskRecurrenceRule,
} from "@tau/shared/task-assistant";
import type {
  PluginTodoOccurrencePatch,
  PluginTodoRecurrenceChange,
  PluginTodoReminder,
} from "./data";

export function readTodoParentId(value: unknown): string {
  const target = typeof value === "string" ? parseTaskKey(value) : null;
  if (typeof value !== "string" || target?.taskRef.kind !== "todo" || target.occurrenceDate)
    throw new Error("父项必须是独立待办");
  return value;
}

export function readTodoCompletionTime(id: string, completed: boolean, value?: number) {
  if (value === undefined) return;
  const target = parseTaskKey(id);
  if (!completed || target?.taskRef.kind !== "todo" || target.occurrenceDate)
    throw new Error("仅完成普通独立待办时可指定完成时间");
  validateTaskValue(TASK_WRITE_SCHEMAS.set_todo_completed.properties!.completedAt!, value);
  return value;
}

export function readTodoRule(value: unknown): TaskRecurrenceRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("重复规则无效");
  const rule = normalizeTaskRecurrenceRule(value as TaskRecurrenceRule);
  validateTaskValue(TASK_WRITE_SCHEMAS.create_todo.properties!.recurrence!, rule);
  return JSON.parse(JSON.stringify(rule));
}
export function readRecurrenceChange(
  value: PluginTodoRecurrenceChange
): PluginTodoRecurrenceChange {
  validateTaskValue(
    TASK_WRITE_SCHEMAS.set_todo_recurrence.properties!.effectiveDate!,
    value?.effectiveFrom
  );
  if (value?.rule !== null) readTodoRule(value?.rule);
  return {
    effectiveFrom: value.effectiveFrom,
    rule: value.rule === null ? null : readTodoRule(value.rule),
  };
}
export function readOccurrencePatch(value: PluginTodoOccurrencePatch): PluginTodoOccurrencePatch {
  validateTaskValue(TASK_WRITE_SCHEMAS.update_todo_occurrence.properties!.statePatch!, value);
  if (!Object.keys(value).length || (value.completed === true && value.skipped === true))
    throw new Error("实例补丁不能为空，完成和跳过不能同时为 true");
  return JSON.parse(JSON.stringify(value));
}
export function readTodoReminders(value: unknown): PluginTodoReminder[] {
  if (!Array.isArray(value)) throw new Error("提醒列表无效");
  return value.map(item => {
    if (!item || typeof item !== "object") throw new Error("提醒无效");
    if ("at" in item) {
      if ("offsetMs" in item || typeof item.at !== "string" || item.at.length <= 10)
        throw new Error("绝对提醒须为明确时刻，不能同时指定偏移");
      validateTaskValue(TASK_WRITE_SCHEMAS.create_todo.properties!.reminderAt!, item.at);
      return { at: item.at };
    }
    if (!Number.isSafeInteger(item.offsetMs)) throw new Error("提醒偏移须为安全整数毫秒");
    return { offsetMs: item.offsetMs };
  });
}
