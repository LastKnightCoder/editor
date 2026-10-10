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
  return ref.kind === "todo"
    ? `todo:${ref.todoId}:${ref.createdAt}`
    : `document:${ref.contentId}:${ref.createdAt}:${ref.taskId}`;
}

export function occurrenceKey(ref: TaskOccurrenceRef): string {
  return `${ref.seriesId}/${ref.occurrenceDate}`;
}
