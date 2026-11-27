import type { PerfCpuCapture } from "./perf-cpu";

export const PERF_EVENT_CHANNEL = "perf-monitor:renderer-event";
export const PERF_TIMELINE_MS = 120_000;
export const PERF_TIMELINE_BYTES = 2 * 1024 * 1024;
export const PERF_EVENT_BYTES = 4096;
export const PERF_BATCH_SIZE = 64;

export interface PerfContext {
  role?: string;
  pageKey?: string;
  pageId?: string;
  contentId?: number;
  editorId?: string;
  connectionId?: string;
  editorCount?: number;
  livePageCount?: number;
  visible?: boolean;
  focused?: boolean;
}

export type PerfKind =
  | "context"
  | "operation-start"
  | "operation-end"
  | "stage-start"
  | "stage"
  | "ipc"
  | "db-command"
  | "sync-io"
  | "event-loop"
  | "longtask"
  | "interaction"
  | "frame"
  | "heap"
  | "resource"
  | "query"
  | "exception"
  | "unresponsive"
  | "collector";

export interface PerfInput {
  t: number;
  kind: PerfKind;
  label?: string;
  ms?: number;
  operationId?: string;
  parentId?: string;
  status?: "ok" | "error" | "cancelled";
  context?: PerfContext;
  values?: Record<string, number>;
}

export interface PerfSource {
  pid: number;
  type: string;
  windowId?: number;
  webContentsId?: number;
  role?: string;
}

export interface PerfEvent extends PerfInput {
  id: number;
  receivedAt: number;
  source: PerfSource;
}

export interface PerfTrace {
  operationId: string;
  context: PerfContext;
}

export interface PerfBatch {
  events: PerfInput[];
  dropped: number;
}

export interface PerfSummary {
  from: number | null;
  to: number | null;
  events: number;
  slowStages: Array<{
    label: string;
    count: number;
    totalMs: number;
    maxMs: number;
    pid: number;
    context?: PerfContext;
    operationId?: string;
  }>;
  errors: number;
  unfinished: Array<{ operationId: string; label: string; pid: number }>;
  processes: Array<{ pid: number; maxCpuCorePercent: number; maxRssMB: number; maxHeapMB: number }>;
}

export interface PerfIncident {
  cpu?: PerfCpuCapture;
  id: string;
  sessionId: string;
  startedAt: number;
  endsAt: number;
  status: "recording" | "complete" | "interrupted";
  reasons: Array<{ reason: string; pid: number; count: number }>;
  events: PerfEvent[];
  summary: PerfSummary;
  dropped: number;
  beforeAvailableMs: number;
  environment?: {
    buildId?: string;
    appVersion: string;
    electronVersion?: string;
    platform: string;
    logicalCpuCount: number;
  };
}

const kinds = new Set<PerfKind>([
  "context",
  "operation-start",
  "operation-end",
  "stage-start",
  "stage",
  "ipc",
  "db-command",
  "sync-io",
  "event-loop",
  "longtask",
  "interaction",
  "frame",
  "heap",
  "resource",
  "query",
  "exception",
  "unresponsive",
  "collector",
]);
const metricKeys = new Set([
  "meanMs",
  "p99Ms",
  "maxMs",
  "delayMs",
  "usedMB",
  "totalMB",
  "rssMB",
  "heapUsedMB",
  "externalMB",
  "arrayBuffersMB",
  "cpuCorePercent",
  "cpuMachinePercent",
  "count",
  "bytes",
  "pendingNodes",
  "selectedBlocks",
  "writtenBlocks",
  "scriptMs",
  "renderMs",
  "styleLayoutMs",
  "paintMs",
  "dropped",
  "collectionMs",
  "queueSize",
  "inputCount",
  "outputCount",
]);
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e15;

/** 诊断标签只接收代码身份；正文、文件路径和任意参数不得作为标签。 */
export const perfToken = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9_.:@/-]{1,120}$/.test(value) ? value : undefined;

export function parsePerfContext(value: unknown): PerfContext {
  if (!object(value)) return {};
  const result: PerfContext = {};
  for (const key of ["role", "pageKey", "pageId", "editorId", "connectionId"] as const) {
    const token = perfToken(value[key]);
    if (token) result[key] = token;
  }
  for (const key of ["contentId", "editorCount", "livePageCount"] as const)
    if (finite(value[key]) && value[key] >= 0) result[key] = value[key];
  for (const key of ["visible", "focused"] as const)
    if (typeof value[key] === "boolean") result[key] = value[key];
  return result;
}

export function parsePerfInput(value: unknown): PerfInput | undefined {
  if (!object(value) || !kinds.has(value.kind as PerfKind) || !finite(value.t)) return;
  const values: Record<string, number> = {};
  if (object(value.values))
    for (const key of metricKeys) if (finite(value.values[key])) values[key] = value.values[key];
  return {
    t: value.t,
    kind: value.kind as PerfKind,
    label: perfToken(value.label),
    ms: finite(value.ms) && value.ms >= 0 ? value.ms : undefined,
    operationId: perfToken(value.operationId),
    parentId: perfToken(value.parentId),
    status: ["ok", "error", "cancelled"].includes(String(value.status))
      ? (value.status as PerfInput["status"])
      : undefined,
    context: parsePerfContext(value.context),
    values,
  };
}

export function parsePerfTrace(value: unknown): PerfTrace | undefined {
  if (!object(value)) return;
  const operationId = perfToken(value.operationId);
  return operationId ? { operationId, context: parsePerfContext(value.context) } : undefined;
}

/** 仅数据库包装层会剥离诊断元数据；其他 IPC 的业务参数保持原协议。 */
const tracedDatabaseCommands = new Set([
  "content:get-by-id",
  "content:update",
  "content:edit-snapshot",
  "content:apply-scoped-edit",
  "content:suggestions-create",
  "content:suggestions-accept",
  "content:suggestions-undo",
  "project:mutate-document",
  "update-project-item",
]);
export const isTracedDatabaseCommand = (channel: string) => tracedDatabaseCommands.has(channel);
