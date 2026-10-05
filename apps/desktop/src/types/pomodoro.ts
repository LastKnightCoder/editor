export type PomodoroMode = "countdown" | "countup";

export type BackgroundSoundType =
  null | "brook" | "birds" | "autumn" | "tide" | "summer" | "wind-chime" | "bonfire" | "rain";

export interface PomodoroPreset {
  id: number;
  name: string;
  mode: PomodoroMode;
  durationMin: number;
  sortOrder: number;
  archived: boolean;
  createTime: number;
  updateTime: number;
}

export type PomodoroStatus = "running" | "paused" | "completed" | "stopped" | "aborted";

export interface PauseSpan {
  start: number;
  end?: number;
}

export interface PomodoroSession {
  id: number;
  presetId: number;
  startTime: number;
  endTime?: number;
  expectedMs?: number;
  focusMs: number;
  pauseTotalMs: number;
  pauseCount: number;
  pauses: PauseSpan[];
  status: PomodoroStatus;
  createTime: number;
  updateTime: number;
  /** 绑定的日历事件（可能已被删除，读取时须容忍悬空） */
  boundEventId?: number;
  /** 绑定的待办；绑定待办来源事件时由主进程反查填入 */
  boundTodoId?: number;
  /** 绑定对象标题快照：日历标题与展示的兜底 */
  boundTitle?: string;
}

/** 番茄的绑定对象：一条日历事件或一条待办 */
export type PomodoroBindTarget =
  { kind: "event"; eventId: number } | { kind: "todo"; todoId: number };

/** 按待办聚合的专注 */
export interface PomodoroFocusSummary {
  count: number;
  focusMs: number;
}

/** 番茄自身生成的日历事件 → 所属会话的绑定 */
export interface PomodoroEventBinding {
  sessionId: number;
  boundEventId: number | null;
  boundTodoId: number | null;
}
