export const CPU_INTERVAL_US = 10_000;
export const CPU_DURATION_MS = 5000;
export const CPU_PROFILE_BYTES = 1024 * 1024;

export interface CpuFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}
export interface CpuProfile {
  nodes: Array<{ id: number; callFrame: CpuFrame; children?: number[]; hitCount?: number }>;
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}
export interface CpuSummary {
  samples: number;
  sampledMs: number;
  omittedSamples: number;
  top: Array<{ frame: CpuFrame; selfMs: number; totalMs: number }>;
}
export interface PerfCpuCapture {
  buildId: string;
  pid: number;
  type: string;
  webContentsId?: number;
  status: "recording" | "complete" | "failed" | "skipped" | "interrupted";
  reason?: string;
  startedAt: number;
  endedAt?: number;
  intervalUs: number;
  durationMs: number;
  actualDurationMs?: number;
  profileOmitted?: boolean;
  summary?: CpuSummary;
  profile?: CpuProfile;
}
