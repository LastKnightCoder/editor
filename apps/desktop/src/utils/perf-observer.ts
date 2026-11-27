import { flushPerfEvents, reportPerfEvent } from "./perf-trace";
import { perfToken, type PerfKind } from "../../shared/perf-diagnostics";
import { queryClient } from "@/queryClient";

/**
 * 渲染端性能采集：事件循环延迟、长任务、长帧、JS 堆与查询频率。
 * 事件批量送往主进程的有界时间线，异常自动留档；启动阶段额外镜像到 session 日志。
 * 在 init.ts 最早安装；非 Electron 环境（测试 / 浏览器预览）不启动。
 */

// 事件循环心跳：250ms 预期间隔，实测偏差超 120ms 视为一次阻塞
const HEARTBEAT_MS = 250;
const EVENT_LOOP_THRESHOLD_MS = 120;
const HEAP_SAMPLE_MS = 5000;
const QUERY_RATE_MS = 60_000;
const SLOW_INTERACTION_MS = 200;

interface PerformanceMemoryLike {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

interface EventTimingEntry extends PerformanceEntry {
  interactionId: number;
}

function report(payload: Record<string, unknown>): void {
  const kinds: Record<string, PerfKind> = {
    stage: "stage",
    "event-loop": "event-loop",
    longtask: "longtask",
    "event-timing": "interaction",
    loaf: "frame",
    heap: "heap",
    "query-rate": "query",
  };
  const kind = kinds[String(payload.kind)];
  if (!kind) return;
  const values: Record<string, number> = {};
  for (const key of [
    "usedMB",
    "totalMB",
    "count",
    "scriptMs",
    "renderMs",
    "styleLayoutMs",
    "paintMs",
  ])
    if (typeof payload[key] === "number") values[key] = payload[key];
  reportPerfEvent({
    kind,
    t: typeof payload.t === "number" ? payload.t : Date.now(),
    label: perfToken(payload.label) ?? perfToken(payload.name),
    ms:
      typeof payload.ms === "number"
        ? payload.ms
        : typeof payload.durationMs === "number"
          ? payload.durationMs
          : typeof payload.delayMs === "number"
            ? payload.delayMs
            : undefined,
    values,
  });
}

/** 只上报阶段名、耗时和规模，不包含正文或节点标题。 */
export function recordPerfStage(label: string, startedAt: number, count?: number, thresholdMs = 0) {
  if (!window.electron) return;
  const ms = performance.now() - startedAt;
  if (ms >= thresholdMs) report({ kind: "stage", label, ms, count });
  // 启动阶段同时进 session 日志：用户反馈启动慢或卡住时不必另导性能快照
  if (label.startsWith("startup:"))
    console.info("[startup] 阶段完成", { label, ms: Math.round(ms), count });
}

// --- 事件循环延迟（心跳法） ---
// 后台/失焦窗口的 timer 会被 Chromium 节流（1Hz 乃至每分钟一次），期间的心跳偏差是
// 节流假象而非真实阻塞，直接丢弃——否则深度节流的几十秒假延迟会占满主进程 ring buffer
function watchEventLoopDelay(): void {
  let last = performance.now();
  let throttled = false;
  window.setInterval(() => {
    const now = performance.now();
    const delayMs = now - last - HEARTBEAT_MS;
    last = now;
    if (document.hidden || !document.hasFocus()) {
      throttled = true;
      return;
    }
    if (throttled) {
      // 焦点/可见性恢复后的首个 tick 仍携带节流期积压的定时器偏差（可达数十秒），
      // 属节流假象：上一个 tick 距今跨过了整段节流窗口
      throttled = false;
      return;
    }
    if (delayMs >= EVENT_LOOP_THRESHOLD_MS) {
      report({ kind: "event-loop", delayMs: Math.round(delayMs) });
    }
  }, HEARTBEAT_MS);
}

// --- 长任务 ---
function watchLongTasks(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw;
        report({
          kind: "longtask",
          t: performance.timeOrigin + entry.startTime,
          durationMs: Math.round(entry.duration),
        });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask 不受支持时保留心跳与长帧诊断。
  }
}

// --- 长动画帧（Long Animation Frame API：每帧 script / style+layout / paint 分解） ---
// longtask 只说"JS 跑了多久"，回答不了"卡是 JS 还是渲染管线"；LoAF 把一帧拆成
// scriptDuration 与 renderingDuration（含 style/layout/paint），直接定位瓶颈侧
interface LoafEntry extends PerformanceEntry {
  renderStart?: number;
  styleAndLayoutStart?: number;
  styleAndLayoutDuration?: number;
  paintDuration?: number;
  renderingDuration?: number;
  scripts?: Array<{
    duration?: number;
    invoker?: string;
    invokerType?: string;
    sourceURL?: string;
    functionName?: string;
    sourceFunctionName?: string;
  }>;
}

const loafScriptLabel = (script: {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  functionName?: string;
  sourceFunctionName?: string;
}): string => {
  const file = script.sourceURL?.split("/").pop()?.split("?")[0] ?? "";
  const who =
    script.sourceFunctionName || script.functionName || script.invoker || script.invokerType || "";
  return `${who}@${file}`.slice(0, 80);
};

function watchLongAnimationFrames(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw as LoafEntry;
        let scriptMs: number | undefined;
        let longest: NonNullable<LoafEntry["scripts"]>[number] | undefined;
        for (const script of entry.scripts ?? []) {
          if (script.duration !== undefined) {
            scriptMs = (scriptMs ?? 0) + script.duration;
            if (!longest || script.duration > (longest.duration ?? 0)) longest = script;
          }
        }
        report({
          kind: "loaf",
          t: performance.timeOrigin + entry.startTime,
          durationMs: Math.round(entry.duration),
          scriptMs: scriptMs === undefined ? undefined : Math.round(scriptMs),
          label: longest ? loafScriptLabel(longest) : undefined,
          renderMs: entry.renderStart
            ? Math.round(entry.startTime + entry.duration - entry.renderStart)
            : null,
          styleLayoutMs: entry.styleAndLayoutStart
            ? Math.round(entry.startTime + entry.duration - entry.styleAndLayoutStart)
            : null,
          paintMs: entry.paintDuration === undefined ? null : Math.round(entry.paintDuration),
        });
      }
    });
    observer.observe({ entryTypes: ["long-animation-frame"] });
  } catch {
    // LoAF 不受支持时静默降级
  }
}

// --- 慢交互：只记录事件类型与耗时，不读取 DOM 文本和属性。 ---
function watchSlowInteractions(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw as EventTimingEntry;
        if (!entry.interactionId) continue;
        report({
          kind: "event-timing",
          t: performance.timeOrigin + entry.startTime,
          durationMs: Math.round(entry.duration),
          name: entry.name,
        });
      }
    });
    // durationThreshold 尚未进入 lib.dom 的 PerformanceObserverInit，显式扩展而非 as any
    const init: PerformanceObserverInit & { durationThreshold?: number } = {
      type: "event",
      durationThreshold: SLOW_INTERACTION_MS,
    };
    observer.observe(init);
  } catch {
    // Event Timing 不受支持时静默降级（longtask 与事件循环心跳仍可诊断渲染端阻塞）
  }
}

// --- JS 堆内存趋势（泄漏检测） ---
function watchHeap(): void {
  window.setInterval(() => {
    reportPerfEvent({ kind: "context" });
    const memory = (performance as unknown as { memory?: PerformanceMemoryLike }).memory;
    if (!memory) return;
    report({
      kind: "heap",
      usedMB: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(memory.totalJSHeapSize / 1024 / 1024),
    });
  }, HEAP_SAMPLE_MS);
}

// --- react-query 刷新频率（刷新风暴检测） ---
function watchQueryRate(): void {
  const fetchesByKey = new Map<string, number>();
  queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "fetch") return;
    let key = perfToken(event.query.queryKey[0]) ?? "other";
    if (fetchesByKey.size >= 256 && !fetchesByKey.has(key)) key = "other";
    fetchesByKey.set(key, (fetchesByKey.get(key) ?? 0) + 1);
  });
  window.setInterval(() => {
    let total = 0;
    for (const count of fetchesByKey.values()) total += count;
    if (total > 0) {
      for (const [label, count] of [...fetchesByKey.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5))
        reportPerfEvent({ kind: "query", label, values: { count } });
    }
    fetchesByKey.clear();
  }, QUERY_RATE_MS);
}

export function startPerfObserver(): void {
  if (!window.electron) return;
  watchEventLoopDelay();
  watchLongTasks();
  watchLongAnimationFrames();
  watchSlowInteractions();
  watchHeap();
  watchQueryRate();
  window.addEventListener("pagehide", flushPerfEvents);
}
