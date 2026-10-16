import { ipcMain, app, BrowserWindow, shell } from "electron";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { startupCpuProfile } from "../startup-cpu-profile";
import {
  flushIpcRate,
  ipcRateSamples,
  pushCapped,
  slowIpc,
  slowSql,
  slowSyncIo,
  stages,
  type Timestamped,
} from "./perf-record";

// 计时记录侧（electron-free）在 perf-record.ts，这里 re-export 保持既有接入方 import 路径不变
export { recordIpcCall, recordSqlCall, recordSyncIo } from "./perf-record";

/**
 * 卡顿诊断采集器：主进程事件循环/内存采样 + 渲染端性能事件汇聚 + 快照导出。
 * 数据只存内存 ring buffer（约最近 1 小时），用户「导出性能快照」时才落盘一个 JSON，
 * 由人把快照文件交给分析方按主/渲染两侧指标对照定位卡顿层。
 *
 * recordIpcCall / recordSqlCall 在 command-bridge-install（主入口首个 import）与
 * database 模块注册期即被调用，早于本模块 init()，因此记录数据必须挂在模块级、
 * import 期即可用；init() 只负责周期采样器与 handler 注册。
 */

const RENDERER_EVENT_CHANNEL = "perf-monitor:renderer-event";
const EXPORT_CHANNEL = "perf-monitor:export-snapshot";

// 事件循环直方图分辨率：同时是测量噪声下限（Windows 时钟量化会把它抬到该值附近），
// 导出到 meta 供分析侧把低于它的均值当噪声剔除；调小可降噪声但增采样开销
const EVENT_LOOP_RESOLUTION_MS = 10;

interface EventLoopSample extends Timestamped {
  meanMs: number;
  p99Ms: number;
  maxMs: number;
}

interface MemorySample extends Timestamped {
  rssMB: number;
  heapUsedMB: number;
  // 堆外分配口径：RSS 跳涨而 heapUsed 平稳时，用来确认 Buffer / 原生内存来源
  externalMB: number;
  arrayBuffersMB: number;
  cpuPercent: number;
}

// 主进程之外的 Electron 进程（renderer / GPU / utility）资源占用，
// 用于把整机内存增长归属到具体进程，而非只看主进程自身 RSS
interface ProcessMetricsSample extends Timestamped {
  processes: Array<{ type: string; pid: number; memoryMB: number; cpuPercent: number }>;
}

interface RendererWindowData {
  title: string;
  stages: Array<Timestamped & { label: string; ms: number; count?: number }>;
  eventLoop: Array<Timestamped & { delayMs: number }>;
  longTasks: Array<Timestamped & { durationMs: number; source: string }>;
  // Event Timing 慢交互：longtask 在 Chromium 拿不到脚本归因（source 恒空），
  // 交互事件自带目标元素，能回答「哪次操作卡了多久」
  slowInteractions: Array<Timestamped & { durationMs: number; name: string; target: string }>;
  // 长动画帧分解：scriptMs 是 JS，renderMs/styleLayoutMs/paintMs 是渲染管线
  longAnimFrames: Array<
    Timestamped & {
      durationMs: number;
      scriptMs: number;
      renderMs: number | null;
      styleLayoutMs: number | null;
      paintMs: number | null;
      source: string;
    }
  >;
  jankSpans: Array<Timestamped & { durationMs: number; worstFrameMs: number; avgFps: number }>;
  heap: Array<Timestamped & { usedMB: number; totalMB: number }>;
  queryRate: Array<Timestamped & { eventsPerMin: number; topQueryKeys: string[] }>;
}

// --- 渲染端事件汇聚（按窗口分组，sender webContents id 为键） ---

const rendererWindows = new Map<number, RendererWindowData>();

function rendererDataOf(senderId: number, title: string): RendererWindowData {
  let data = rendererWindows.get(senderId);
  if (!data) {
    data = {
      title,
      stages: [],
      eventLoop: [],
      longTasks: [],
      slowInteractions: [],
      longAnimFrames: [],
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
  const t = typeof payload.t === "number" && Number.isFinite(payload.t) ? payload.t : Date.now();
  switch (payload.kind) {
    case "stage":
      pushCapped(data.stages, {
        t,
        label: String(payload.label).slice(0, 100),
        ms: Number(payload.ms),
        count: payload.count as number | undefined,
      });
      break;
    case "event-loop":
      pushCapped(data.eventLoop, {
        t,
        delayMs: payload.delayMs as number,
      });
      break;
    case "longtask":
      pushCapped(data.longTasks, {
        t,
        durationMs: payload.durationMs as number,
        source: String(payload.source ?? "").slice(0, 400),
      });
      break;
    case "event-timing":
      pushCapped(data.slowInteractions, {
        t,
        durationMs: payload.durationMs as number,
        name: String(payload.name ?? "").slice(0, 60),
        target: String(payload.target ?? "").slice(0, 120),
      });
      break;
    case "loaf":
      pushCapped(data.longAnimFrames, {
        t,
        durationMs: payload.durationMs as number,
        scriptMs: payload.scriptMs as number,
        renderMs: payload.renderMs as number,
        styleLayoutMs: payload.styleLayoutMs as number,
        paintMs: payload.paintMs as number,
        source: String(payload.source ?? "").slice(0, 400),
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
const processMetricsSamples: ProcessMetricsSample[] = [];

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
    externalMB: memory.external / 1024 / 1024,
    arrayBuffersMB: memory.arrayBuffers / 1024 / 1024,
    // 区间平均 CPU 占比：进程 CPU 时间 / 墙钟时间（单核口径，可 >100%）
    cpuPercent: Math.min(1000, (elapsedCpuUs / Math.max(elapsedWallUs, 1)) * 100),
  });
  lastCpu = cpu;
  lastWallMs = nowMs;
}

function sampleProcessMetrics(): void {
  // 主进程自身已有 memory 采样，这里只记其余进程；渲染端自报 heap 之外的口径
  const processes = app
    .getAppMetrics()
    .filter(metric => metric.type !== "Browser")
    .map(metric => ({
      type: metric.type,
      pid: metric.pid,
      memoryMB: metric.memory.workingSetSize / 1024,
      cpuPercent: metric.cpu.percentCPUUsage,
    }));
  pushCapped(processMetricsSamples, { t: Date.now(), processes });
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
      eventLoopResolutionMs: EVENT_LOOP_RESOLUTION_MS,
    },
    main: {
      startupCpuProfile,
      eventLoop: eventLoopSamples,
      memory: memorySamples,
      processMetrics: processMetricsSamples,
      slowIpc,
      ipcRate: ipcRateSamples,
      slowSql,
      slowSyncIo,
      stages,
    },
    renderer: Object.fromEntries([...rendererWindows.entries()].map(([id, data]) => [id, data])),
  };

  await fs.promises.writeFile(target, JSON.stringify(snapshot, null, 2), "utf-8");
  shell.showItemInFolder(target);
  log.info(`[perf-monitor] 性能快照已导出: ${target}`);
  return { path: target };
}

// --- 模块生命周期 ---

const init = async (): Promise<void> => {
  histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  histogram.enable();
  lastCpu = process.cpuUsage();
  lastWallMs = performance.now();

  // 前 15 秒逐秒采样，避免启动毛刺被整个区间平均掩盖。
  const sample = () => {
    sampleEventLoop();
    sampleMemory();
  };
  const startupInterval = setInterval(sample, 1000);
  setTimeout(() => {
    clearInterval(startupInterval);
    sample();
    setInterval(sample, 15_000);
  }, 15_000);
  setInterval(sampleProcessMetrics, 30_000);
  setInterval(flushIpcRate, 60_000);

  ipcMain.on(RENDERER_EVENT_CHANNEL, (event, payload: { kind: string }) => {
    if (!payload || typeof payload.kind !== "string") return;
    recordRendererEvent(event.sender.id, event.sender.getTitle(), payload);
  });

  ipcMain.handle(EXPORT_CHANNEL, exportSnapshot);

  log.info("[perf-monitor] 卡顿诊断采集已启动");
};

export default { init };
