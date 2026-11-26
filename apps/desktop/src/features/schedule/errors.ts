export type ScheduleErrorCode =
  | "DATABASE_CHANGED"
  | "EVENT_ID_MISSING"
  | "CALENDAR_NOT_FOUND"
  | "EVENT_NOT_FOUND";

export class ScheduleError extends Error {
  constructor(
    readonly code: ScheduleErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}
