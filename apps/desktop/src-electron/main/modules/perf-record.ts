import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { PerfDiagnostics } from "../services/perf-diagnostics";
import type {
  PerfContext,
  PerfInput,
  PerfIncident,
  PerfSource,
  PerfTrace,
} from "../../../shared/perf-diagnostics";

const listeners = new Set<(incident: PerfIncident) => void>();
export const perfDiagnostics = new PerfDiagnostics(randomUUID(), {
  onIncident: incident => {
    for (const listener of listeners) listener(incident);
  },
});
const scope = new AsyncLocalStorage<{ trace?: PerfTrace; source: PerfSource }>();
const mainSource: PerfSource = { pid: process.pid, type: "main" };
const rates = new Map<string, number>();
const windowRoles = new Map<number, string>();
const windowContexts = new Map<number, PerfContext>();
export function registerPerfWindow(contentsId: number, role: string) {
  windowRoles.set(contentsId, role);
  return () => {
    windowRoles.delete(contentsId);
    windowContexts.delete(contentsId);
  };
}
export const perfWindowRole = (contentsId: number) => windowRoles.get(contentsId) ?? "window";
export const perfWindowContext = (contentsId: number) => windowContexts.get(contentsId);
export function setPerfWindowContext(contentsId: number, context: PerfContext) {
  windowContexts.set(contentsId, context);
  if (windowContexts.size > 32) windowContexts.delete(windowContexts.keys().next().value as number);
}

export function subscribePerfIncidents(listener: (incident: PerfIncident) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordPerf(input: PerfInput, source = scope.getStore()?.source ?? mainSource) {
  const trace = scope.getStore()?.trace;
  const baseContext =
    trace?.context ??
    (!input.operationId && source.webContentsId
      ? windowContexts.get(source.webContentsId)
      : undefined);
  perfDiagnostics.record(
    {
      ...input,
      operationId: input.operationId ?? trace?.operationId,
      context: { ...baseContext, ...input.context },
    },
    source
  );
}

export function withPerfTrace<T>(
  trace: PerfTrace | undefined,
  source: PerfSource,
  run: () => T
): T {
  return scope.run({ trace, source }, run);
}

export function recordIpcCall(channel: string, ms: number, ok: boolean, result?: unknown): void {
  if (rates.size < 256 || rates.has(channel)) rates.set(channel, (rates.get(channel) ?? 0) + 1);
  if (ms >= 100 || !ok)
    recordPerf({
      t: Date.now(),
      kind: "ipc",
      label: channel,
      ms,
      status: ok ? "ok" : "error",
      // 只使用已知尺寸；不为诊断再次遍历或序列化完整返回值。
      values:
        result instanceof Uint8Array
          ? { bytes: result.byteLength }
          : typeof result === "string"
            ? { bytes: result.length * 2 }
            : undefined,
    });
}

export function flushIpcRate(): void {
  for (const [label, count] of [...rates].sort((a, b) => b[1] - a[1]).slice(0, 8))
    recordPerf({ t: Date.now(), kind: "ipc", label, values: { count } });
  rates.clear();
}

export function recordDatabaseCommand(_db: string, event: string, ms: number, ok: boolean): void {
  if (ms >= 50 || !ok || scope.getStore()?.trace)
    recordPerf({
      t: Date.now(),
      kind: "db-command",
      label: event,
      ms,
      status: ok ? "ok" : "error",
    });
}

export function recordStage(label: string, ms: number, count?: number) {
  recordPerf({
    t: Date.now(),
    kind: "stage",
    label,
    ms,
    values: count === undefined ? {} : { count },
  });
}

export function recordSyncIo(label: string, bytes: number, ms: number): void {
  if (ms >= 50) recordPerf({ t: Date.now(), kind: "sync-io", label, ms, values: { bytes } });
}
