export type TaskRef =
  | { kind: "todo"; todoId: number; createdAt: number }
  | { kind: "document"; contentId: number; createdAt: number; taskId: string };

export interface TaskOccurrenceRef {
  seriesId: string;
  occurrenceDate: string;
}

export interface TaskRecurrenceRule {
  type: "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  startDate: string;
  endDate?: string | null;
  weekdays?: number[];
  monthDay?: number;
  yearMonth?: number;
  yearDay?: number;
  maxOccurrences?: number | null;
  excludeHolidays?: boolean;
}

export interface TaskRecurrenceSegment {
  seriesId: string;
  effectiveDate: string;
  rule: TaskRecurrenceRule | null;
}

export function normalizeTaskRecurrenceRule(rule: TaskRecurrenceRule): TaskRecurrenceRule {
  const result = { ...rule };
  for (const key of ["weekdays", "monthDay", "yearMonth", "yearDay", "excludeHolidays"] as const)
    if (result[key] == null) delete result[key];
  if (Array.isArray(result.weekdays))
    result.weekdays = [...new Set(result.weekdays)].sort((a, b) => a - b);
  return result;
}

export interface TaskOccurrenceState {
  completedAt?: number | null;
  skipped?: boolean;
  scheduledAt?: string | null;
}

export interface DocumentTaskAttributes {
  taskReminder?: { version: 1; at: string } | null;
  taskRecurrence?: { version: 1; segments: TaskRecurrenceSegment[] } | null;
  taskOccurrenceState?: Record<string, TaskOccurrenceState>;
  taskArchived?: boolean;
  taskCompletedAt?: number | null;
}

export interface AssistantTask {
  isSeries?: boolean;
  taskRef: TaskRef;
  revision: string;
  title: string;
  completed: boolean;
  archived: boolean;
  dueAt: string | null;
  groupId: number | null;
  sourceTitle?: string;
  sourceRef?: { kind: "card" | "article" | "project-item" | "diary-moment"; id: number };
  documentRevision?: string;
  occurrence?: TaskOccurrenceRef;
  reminderAt?: string | null;
  reminderOffsets?: number[];
  occurrenceState?: TaskOccurrenceState;
  recurrence?: TaskRecurrenceSegment[];
  writable: boolean;
  readonlyReason?: string;
}

export interface AssistantCalendarEvent {
  eventId: number;
  createdAt: number;
  revision: string;
  title: string;
  calendarId: number;
  reminderOffsets?: number[];
  notes?: { contentId: number; createdAt: number };
  start: string;
  end: string;
  allDay: boolean;
  taskRef?: TaskRef;
  occurrence?: TaskOccurrenceRef;
  writable: boolean;
}

export interface AssistantQueryResult<T> {
  type: "assistant-tasks" | "assistant-calendar" | "assistant-operations";
  databaseName: string;
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  incomplete: boolean;
  warnings: string[];
  document?: { contentId: number; createdAt: number; revision: string };
}

export interface TaskOperationResult {
  requestId: string;
  operationId?: string;
  status: "succeeded" | "pending" | "failed" | "notExecuted";
  result?: unknown;
  error?: { code: string; message: string };
  undoableUntil?: number;
}

export interface TaskBatchResult {
  type: "assistant-task-operation";
  databaseName: string;
  batchId: string;
  items: TaskOperationResult[];
}

export class TaskAssistantError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TaskAssistantError";
  }
}

export function taskKey(ref: TaskRef): string {
  if (ref.kind === "todo") return `todo:${ref.todoId}:${ref.createdAt}`;
  const component = encodeTaskIdComponent(ref.taskId);
  return component === ref.taskId
    ? `document:${ref.contentId}:${ref.createdAt}:${ref.taskId}`
    : `document:v2:${ref.contentId}:${ref.createdAt}:${component.slice(1)}`;
}

export function encodeTaskIdComponent(value: string): string {
  if (!value.startsWith("~") && !/[@\r\n\u2028\u2029]/.test(value)) return value;
  return (
    "~" +
    Array.from(new TextEncoder().encode(value), byte =>
      byte.toString(16).padStart(2, "0").toUpperCase()
    ).join("")
  );
}

export function decodeTaskIdComponent(value: string): string {
  if (!/^~(?:[0-9A-F]{2})+$/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value.slice(1).match(/../g)!, pair => parseInt(pair, 16));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return encodeTaskIdComponent(decoded) === value ? decoded : value;
  } catch {
    return value;
  }
}

export function parseTaskKey(value: string): { taskRef: TaskRef; occurrenceDate?: string } | null {
  const suffix = /@(\d{4}-\d{2}-\d{2})$/.exec(value);
  const key = suffix ? value.slice(0, -suffix[0].length) : value;
  const todo = /^todo:(\d+):(\d+)$/.exec(key);
  const versioned = /^document:v2:(\d+):(\d+):([0-9A-F]+)$/.exec(key);
  const document = versioned ?? /^document:(\d+):(\d+):([\s\S]+)$/.exec(key);
  const match = todo ?? document;
  if (!match) return null;
  const id = Number(match[1]),
    createdAt = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(createdAt) || createdAt < 0)
    return null;
  const taskId = versioned ? decodeTaskIdComponent("~" + versioned[3]) : document?.[3];
  if (versioned && encodeTaskIdComponent(taskId!) !== "~" + versioned[3]) return null;
  const taskRef: TaskRef = todo
    ? { kind: "todo", todoId: id, createdAt }
    : { kind: "document", contentId: id, createdAt, taskId: taskId! };
  return { taskRef, ...(suffix ? { occurrenceDate: suffix[1] } : {}) };
}

export function occurrenceKey(ref: TaskOccurrenceRef): string {
  return `${ref.seriesId}/${ref.occurrenceDate}`;
}
