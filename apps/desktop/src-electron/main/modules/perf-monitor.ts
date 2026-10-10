import { ipcMain, app, BrowserWindow, Notification, shell } from "electron";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";

/**
 * 卡顿诊断采集器：主进程事件循环/内存采样 + IPC/SQL 慢调用记录 + 渲染端性能事件汇聚。
 * 数据只存内存 ring buffer（约最近 1 小时），用户「导出性能快照」时才落盘一个 JSON，
 * 由人把快照文件交给分析方按主/渲染两侧指标对照定位卡顿层。
 *
 * recordIpcCall / recordSqlCall 在 command-bridge-install（主入口首个 import）与
 * database 模块注册期即被调用，早于本模块 init()，因此记录数据必须挂在模块级、
 * import 期即可用；init() 只负责周期采样器与 handler 注册。
 */

const RENDERER_EVENT_CHANNEL = "perf-monitor:renderer-event";
const EXPORT_CHANNEL = "perf-monitor:export-snapshot";

// 阈值与容量按「导出时刻回看最近一小时」取舍：明细只记异常，趋势类低频全记
const SLOW_IPC_MS = 100;
const SLOW_SQL_MS = 50;
const RING_CAP = 600;

interface Timestamped {
  t: number;
}

interface IpcCallSample extends Timestamped {
  channel: string;
  ms: number;
  ok: boolean;
}

interface SqlCallSample extends Timestamped {
  db: string;
  event: string;
  ms: number;
  ok: boolean;
}

interface IpcRateSample extends Timestamped {
  callsPerMin: number;
  topChannels: Array<{ channel: string; count: number }>;
}

interface EventLoopSample extends Timestamped {
  meanMs: number;
  p99Ms: number;
  maxMs: number;
}

interface MemorySample extends Timestamped {
  rssMB: number;
  heapUsedMB: number;
  cpuPercent: number;
}

interface RendererWindowData {
  title: string;
  eventLoop: Array<Timestamped & { delayMs: number; hidden: boolean }>;
  longTasks: Array<Timestamped & { durationMs: number; source: string }>;
  jankSpans: Array<Timestamped & { durationMs: number; worstFrameMs: number; avgFps: number }>;
  heap: Array<Timestamped & { usedMB: number; totalMB: number }>;
  queryRate: Array<Timestamped & { eventsPerMin: number; topQueryKeys: string[] }>;
}

function pushCapped<T>(buffer: T[], item: T): void {
  buffer.push(item);
  if (buffer.length > RING_CAP) {
    buffer.splice(0, buffer.length - RING_CAP);
  }
}

// --- 模块级记录状态（import 期可用，供 command-bridge / database 计时接入） ---

const slowIpc: IpcCallSample[] = [];
const ipcRateByMinute = new Map<number, Map<string, number>>();
const ipcRateSamples: IpcRateSample[] = [];
const slowSql: SqlCallSample[] = [];

function bucketOf(timeMs: number): number {
  return Math.floor(timeMs / 60_000);
}

/** 每分钟聚合一次 IPC 调用速率（洪水检测：比单次慢调用更常见的卡因） */
function flushIpcRate(): void {
  const currentBucket = bucketOf(Date.now());
  for (const [bucket, byChannel] of ipcRateByMinute) {
    if (bucket >= currentBucket) continue;
    let total = 0;
    for (const count of byChannel.values()) total += count;
    const topChannels = [...byChannel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count }));
    pushCapped(ipcRateSamples, { t: bucket * 60_000, callsPerMin: total, topChannels });
    ipcRateByMinute.delete(bucket);
  }
}

export function recordIpcCall(channel: string, ms: number, ok: boolean): void {
  const now = Date.now();
  if (ms >= SLOW_IPC_MS) {
    pushCapped(slowIpc, { t: now, channel, ms, ok });
  }
  const bucket = bucketOf(now);
  let byChannel = ipcRateByMinute.get(bucket);
  if (!byChannel) {
    byChannel = new Map();
    ipcRateByMinute.set(bucket, byChannel);
  }
  byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1);
}

export function recordSqlCall(db: string, event: string, ms: number, ok: boolean): void {
  if (ms >= SLOW_SQL_MS) {
    pushCapped(slowSql, { t: Date.now(), db, event, ms, ok });
  }
}

// --- 渲染端事件汇聚（按窗口分组，sender webContents id 为键） ---

const rendererWindows = new Map<number, RendererWindowData>();

function rendererDataOf(senderId: number, title: string): RendererWindowData {
  let data = rendererWindows.get(senderId);
  if (!data) {
    data = {
      title,
      eventLoop: [],
      longTasks: [],
      jankSpans: [],
      heap: [],
      queryRate: [],
    };
    rendererWindows.set(senderId, data);
  }
  data.title = title;
  return data;
}

function recordRendererEvent(
  senderId: number,
  title: string,
  payload: { kind: string; [key: string]: unknown }
): void {
  const data = rendererDataOf(senderId, title);
  const t = Date.now();
  switch (payload.kind) {
    case "event-loop":
      pushCapped(data.eventLoop, {
        t,
        delayMs: payload.delayMs as number,
        hidden: !!payload.hidden,
      });
      break;
    case "longtask":
      pushCapped(data.longTasks, {
        t,
        durationMs: payload.durationMs as number,
        source: String(payload.source ?? "").slice(0, 200),
      });
      break;
    case "jank":
      pushCapped(data.jankSpans, {
        t,
        durationMs: payload.durationMs as number,
        worstFrameMs: payload.worstFrameMs as number,
        avgFps: payload.avgFps as number,
      });
      break;
    case "heap":
      pushCapped(data.heap, {
        t,
        usedMB: payload.usedMB as number,
        totalMB: payload.totalMB as number,
      });
      break;
    case "query-rate":
      pushCapped(data.queryRate, {
        t,
        eventsPerMin: payload.eventsPerMin as number,
        topQueryKeys: (payload.topQueryKeys as string[]) ?? [],
      });
      break;
    default:
      break;
  }
  // 渲染端窗口可能已销毁，总量兜底防止 Map 无限增长
  if (rendererWindows.size > 16) {
    const oldest = rendererWindows.keys().next().value;
    if (oldest !== undefined) rendererWindows.delete(oldest);
  }
}

// --- 周期采样（init 后启动） ---

const eventLoopSamples: EventLoopSample[] = [];
const memorySamples: MemorySample[] = [];

let histogram: IntervalHistogram | null = null;
let lastCpu = process.cpuUsage();
let lastWallMs = 0;

function sampleEventLoop(): void {
  if (!histogram) return;
  const meanMs = histogram.mean / 1e6;
  const p99Ms = histogram.percentile(99) / 1e6;
  const maxMs = histogram.max / 1e6;
  histogram.reset();
  pushCapped(eventLoopSamples, { t: Date.now(), meanMs, p99Ms, maxMs });
}

function sampleMemory(): void {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const nowMs = performance.now();
  const elapsedCpuUs = cpu.user + cpu.system - (lastCpu.user + lastCpu.system);
  const elapsedWallUs = (nowMs - lastWallMs) * 1000;
  pushCapped(memorySamples, {
    t: Date.now(),
    rssMB: memory.rss / 1024 / 1024,
    heapUsedMB: memory.heapUsed / 1024 / 1024,
    // 区间平均 CPU 占比：进程 CPU 时间 / 墙钟时间（单核口径，可 >100%）
    cpuPercent: Math.min(1000, (elapsedCpuUs / Math.max(elapsedWallUs, 1)) * 100),
  });
  lastCpu = cpu;
  lastWallMs = nowMs;
}

// --- 快照导出 ---

export interface PerfSnapshotResult {
  path: string;
}

export async function exportSnapshot(): Promise<PerfSnapshotResult> {
  flushIpcRate();
  const logDir = path.join(PathUtil.getAppDir(), "logs");
  await fs.promises.mkdir(logDir, { recursive: true });

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const target = path.join(logDir, `perf-snapshot-${stamp}.json`);

  const snapshot = {
    meta: {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      exportedAt: new Date().toISOString(),
      windowCount: BrowserWindow.getAllWindows().length,
    },
    main: {
      eventLoop: eventLoopSamples,
      memory: memorySamples,
      slowIpc,
      ipcRate: ipcRateSamples,
      slowSql,
    },
    renderer: Object.fromEntries([...rendererWindows.entries()].map(([id, data]) => [id, data])),
  };

  await fs.promises.writeFile(target, JSON.stringify(snapshot, null, 2), "utf-8");
  shell.showItemInFolder(target);
  log.info(`[perf-monitor] 性能快照已导出: ${target}`);
  return { path: target };
}

export function notifySnapshotExported(result: PerfSnapshotResult): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: "性能快照已导出",
      body: result.path,
    });
    notification.show();
  } else {
    log.info(`[perf-monitor] 快照路径: ${result.path}`);
  }
}

// --- 模块生命周期 ---

const init = async (): Promise<void> => {
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  lastCpu = process.cpuUsage();
  lastWallMs = performance.now();

  // 事件循环与内存分开看：前者是阻塞毛刺、后者是资源趋势，采样节奏不同但共用一个定时器足够
  setInterval(() => {
    sampleEventLoop();
    sampleMemory();
  }, 15_000);
  setInterval(flushIpcRate, 60_000);

  ipcMain.on(RENDERER_EVENT_CHANNEL, (event, payload: { kind: string }) => {
    if (!payload || typeof payload.kind !== "string") return;
    recordRendererEvent(event.sender.id, event.sender.getTitle(), payload);
  });

  ipcMain.handle(EXPORT_CHANNEL, async () => {
    const result = await exportSnapshot();
    notifySnapshotExported(result);
    return result;
  });

  log.info("[perf-monitor] 卡顿诊断采集已启动");
};

export default { init };
