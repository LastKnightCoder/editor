import { ipcMain, app, BrowserWindow, shell, type WebContents } from "electron";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { cpus } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { startupCpuProfile } from "../startup-cpu-profile";
import {
  flushIpcRate,
  perfDiagnostics,
  perfWindowRole,
  perfWindowContext,
  setPerfWindowContext,
  recordPerf,
  subscribePerfIncidents,
} from "./perf-record";
import { PerfIncidentStore } from "../services/perf-incident-store";
import { PerfCpuScheduler } from "../services/perf-cpu-scheduler";
import { captureCpu } from "../services/perf-cpu-capture";
import { perfBuildId } from "../../../shared/perf-build";
import {
  PERF_BATCH_SIZE,
  PERF_EVENT_CHANNEL,
  parsePerfContext,
  parsePerfInput,
  type PerfSource,
} from "../../../shared/perf-diagnostics";

export { recordIpcCall, recordDatabaseCommand, recordSyncIo } from "./perf-record";

const EVENT_LOOP_RESOLUTION_MS = 10;
const cores = cpus().length;
const store = new PerfIncidentStore(path.join(PathUtil.getAppDir(), "logs", "performance"));
const rates = new Map<number, { second: number; count: number }>();
let histogram: IntervalHistogram | undefined;

function sourceFor(contents: WebContents): PerfSource {
  return {
    pid: contents.getOSProcessId(),
    type: "renderer",
    webContentsId: contents.id,
    windowId: BrowserWindow.fromWebContents(contents)?.id,
    role: perfWindowRole(contents.id),
  };
}

function receive(contents: WebContents, payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("events" in payload) ||
    !Array.isArray(payload.events)
  )
    return;
  const second = Math.floor(Date.now() / 1000);
  const rate = rates.get(contents.id);
  const bucket = rate?.second === second ? rate : { second, count: 0 };
  rates.set(contents.id, bucket);
  const source = sourceFor(contents);
  const events = payload.events.slice(0, PERF_BATCH_SIZE);
  const accepted = events.slice(0, Math.max(0, 128 - bucket.count));
  bucket.count += accepted.length;
  let dropped = payload.events.length - accepted.length;
  if (
    "dropped" in payload &&
    typeof payload.dropped === "number" &&
    Number.isFinite(payload.dropped)
  )
    dropped += Math.max(0, payload.dropped);
  for (const raw of accepted) {
    const event = parsePerfInput(raw);
    if (!event) {
      dropped++;
      continue;
    }
    if (event.kind === "context")
      setPerfWindowContext(contents.id, parsePerfContext(event.context));
    recordPerf({ ...event, context: { ...event.context, role: source.role } }, source);
  }
  if (dropped) recordPerf({ t: Date.now(), kind: "collector", values: { dropped } }, source);
  if (rates.size > 32) rates.delete(rates.keys().next().value as number);
}

function windows() {
  return BrowserWindow.getAllWindows()
    .filter(win => !win.isDestroyed())
    .map(win => ({
      ...sourceFor(win.webContents),
      context: {
        ...perfWindowContext(win.webContents.id),
        visible: win.isVisible() && !win.isMinimized(),
        focused: win.isFocused(),
      },
    }));
}

function sample() {
  const started = performance.now(),
    t = Date.now();
  if (histogram) {
    recordPerf({
      t,
      kind: "event-loop",
      ms: histogram.max / 1e6,
      values: {
        meanMs: histogram.mean / 1e6,
        p99Ms: histogram.percentile(99) / 1e6,
      },
    });
    histogram.reset();
  }
  const memory = process.memoryUsage();
  recordPerf({
    t,
    kind: "heap",
    values: {
      usedMB: memory.heapUsed / 1024 / 1024,
      totalMB: memory.heapTotal / 1024 / 1024,
      rssMB: memory.rss / 1024 / 1024,
      externalMB: memory.external / 1024 / 1024,
    },
  });
  const identities = windows();
  for (const metric of app.getAppMetrics()) {
    const window = identities.find(row => row.pid === metric.pid);
    const source: PerfSource =
      metric.type === "Browser"
        ? { pid: metric.pid, type: "main" }
        : window
          ? {
              pid: window.pid,
              type: window.type,
              windowId: window.windowId,
              webContentsId: window.webContentsId,
              role: window.role,
            }
          : { pid: metric.pid, type: metric.type.toLowerCase() };
    recordPerf(
      {
        t,
        kind: "resource",
        context: window?.context,
        values: {
          cpuMachinePercent: metric.cpu.percentCPUUsage,
          cpuCorePercent: metric.cpu.percentCPUUsage * cores,
          rssMB: metric.memory.workingSetSize / 1024,
        },
      },
      source
    );
  }
  recordPerf({ t, kind: "collector", values: { collectionMs: performance.now() - started } });
  perfDiagnostics.tick();
}

export interface PerfSnapshotResult {
  path: string;
}

export async function buildSnapshot() {
  flushIpcRate();
  const current = perfDiagnostics.snapshot();
  const saved = await store.readRecent(perfDiagnostics.sessionId).catch(error => {
    store.failures++;
    log.warn("[perf-monitor] 诊断片段读取失败", error);
    return { incidents: [], omitted: 1 };
  });
  const incidentKey = (incident: { sessionId: string; id: string }) =>
    `${incident.sessionId}:${incident.id}`;
  const incidents = new Map(saved.incidents.map(incident => [incidentKey(incident), incident]));
  for (const incident of current.incidents) incidents.set(incidentKey(incident), incident);
  return {
    schemaVersion: 2,
    meta: {
      sessionId: perfDiagnostics.sessionId,
      buildId: perfBuildId,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      exportedAt: new Date().toISOString(),
      logicalCpuCount: cores,
      cpuBasis: "machine-and-single-core",
      eventLoopResolutionMs: EVENT_LOOP_RESOLUTION_MS,
    },
    main: { startupCpuProfile },
    windows: windows(),
    summary: current.summary,
    timeline: current.events,
    incidents: [...incidents.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 3),
    collector: {
      ...current.collector,
      storageFailures: store.failures,
      omittedIncidents: saved.omitted,
    },
  };
}

export async function exportSnapshot(): Promise<PerfSnapshotResult> {
  const directory = path.join(PathUtil.getAppDir(), "logs");
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, `perf-snapshot-${Date.now()}.json`);
  await fs.writeFile(target, JSON.stringify(await buildSnapshot(), null, 2), "utf8");
  shell.showItemInFolder(target);
  return { path: target };
}

const init = async (): Promise<void> => {
  const cpu = new PerfCpuScheduler({
    buildId: perfBuildId,
    capture: captureCpu,
    update: (id, value) => perfDiagnostics.updateCpu(id, value),
  });
  const save = (incident: Parameters<typeof store.save>[0]) => {
    void store
      .save({
        ...incident,
        environment: {
          buildId: perfBuildId,
          appVersion: app.getVersion(),
          electronVersion: process.versions.electron,
          platform: process.platform,
          logicalCpuCount: cores,
        },
      })
      .catch(error => log.warn("[perf-monitor] 诊断片段保存失败", error));
    cpu.consider(incident);
  };
  subscribePerfIncidents(save);
  for (const incident of perfDiagnostics.snapshot().incidents) save(incident);
  await store.prune().catch(error => log.warn("[perf-monitor] 诊断片段清理失败", error));
  histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  histogram.enable();
  const interval = setInterval(sample, 5000);
  const rateInterval = setInterval(flushIpcRate, 60_000);
  ipcMain.on(PERF_EVENT_CHANNEL, (event, payload: unknown) => receive(event.sender, payload));
  ipcMain.handle("perf-monitor:export-snapshot", exportSnapshot);
  app.once("will-quit", () => {
    clearInterval(interval);
    clearInterval(rateInterval);
    histogram?.disable();
    cpu.close();
    perfDiagnostics.finish();
  });
  log.info("[perf-monitor] 性能诊断已启动，异常片段自动保存在本机");
};

export default { init };
