export type PomodoroMode = "countdown" | "countup";

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

export type PomodoroStatus =
  | "running"
  | "paused"
  | "completed"
  | "stopped"
  | "aborted";

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
}
