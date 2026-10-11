import { send } from "@/electron";
import { queryClient } from "@/queryClient";

/**
 * 渲染端性能采集：事件循环延迟 / 长任务 / 掉帧片段 / JS 堆内存 / react-query 刷新频率。
 * 全部为被动低频采样，事件经独立 IPC 通道（不走 logger 的 sendLog，避免限流与日志污染）
 * 汇聚到主进程 perf-monitor 的 ring buffer，由「导出性能快照」落盘。
 * 在 init.ts 最早安装；非 Electron 环境（测试 / 浏览器预览）不启动。
 */

const RENDERER_EVENT_CHANNEL = "perf-monitor:renderer-event";

// 事件循环心跳：250ms 预期间隔，实测偏差超 120ms 视为一次阻塞
const HEARTBEAT_MS = 250;
const EVENT_LOOP_THRESHOLD_MS = 120;
// 掉帧聚合：单帧 >50ms（<20fps）记坏帧，连续 ≥5 帧坏帧聚成一个 jank 片段；
// 片段超 2s 先行上报并重新累计——持续冻结时不能等到恢复才留下记录
const BAD_FRAME_MS = 50;
const JANK_MIN_FRAMES = 5;
const JANK_FLUSH_MS = 2_000;
const HEAP_SAMPLE_MS = 30_000;
const QUERY_RATE_MS = 60_000;
const SLOW_INTERACTION_MS = 200;

interface PerformanceMemoryLike {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
}

interface LongTaskEntry extends PerformanceEntry {
  attribution?: Array<{ sourceURL?: string }>;
}

interface EventTimingEntry extends PerformanceEntry {
  interactionId: number;
  target: Node | null;
}

function report(payload: Record<string, unknown>): void {
  send(RENDERER_EVENT_CHANNEL, payload);
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

// --- 长任务（PerformanceObserver longtask，带脚本归因） ---
function watchLongTasks(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw as LongTaskEntry;
        const source = entry.attribution?.[0]?.sourceURL ?? "";
        report({ kind: "longtask", durationMs: Math.round(entry.duration), source });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask 不受支持时静默降级（事件循环心跳与掉帧片段仍可诊断渲染端阻塞）
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
  }>;
}

const loafScriptLabel = (script: {
  invoker?: string;
  invokerType?: string;
  sourceURL?: string;
  functionName?: string;
}): string => {
  const file = script.sourceURL?.split("/").pop()?.split("?")[0] ?? "";
  const who = script.functionName || script.invoker || script.invokerType || "";
  return `${who}@${file}`.slice(0, 80);
};

function watchLongAnimationFrames(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw as LoafEntry;
        const script = entry.scripts?.reduce((sum, s) => sum + (s.duration ?? 0), 0) ?? 0;
        // top3 脚本归因（时长 + 函数名/调用方@文件），定位周期性任务的具体来源
        const topScripts =
          entry.scripts
            ?.slice()
            .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
            .slice(0, 3)
            .map(s => `${loafScriptLabel(s)}:${Math.round(s.duration ?? 0)}ms`)
            .join("; ")
            .slice(0, 240) ?? "";
        report({
          kind: "loaf",
          durationMs: Math.round(entry.duration),
          scriptMs: Math.round(script),
          renderMs: Math.round(entry.renderingDuration ?? entry.styleAndLayoutDuration ?? 0),
          styleLayoutMs: Math.round(entry.styleAndLayoutDuration ?? 0),
          paintMs: Math.round(entry.paintDuration ?? 0),
          source: topScripts,
        });
      }
    });
    observer.observe({ entryTypes: ["long-animation-frame"] });
  } catch {
    // LoAF 不受支持时静默降级
  }
}

// --- 慢交互（Event Timing API，带事件目标归因） ---
// longtask 在 Chromium 拿不到脚本归因（attribution 恒空），交互时长条目自带目标元素，
// 能回答「哪次操作卡了多久」；interactionId 为 0 的是非交互事件（程序触发），跳过
function describeTarget(node: Node | null): string {
  if (!(node instanceof Element)) return "";
  const id = node.id ? `#${node.id}` : "";
  const classes =
    typeof node.className === "string" && node.className
      ? `.${node.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  return `${node.tagName.toLowerCase()}${id}${classes}`.slice(0, 120);
}

function watchSlowInteractions(): void {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const raw of list.getEntries()) {
        const entry = raw as EventTimingEntry;
        if (!entry.interactionId) continue;
        report({
          kind: "event-timing",
          durationMs: Math.round(entry.duration),
          name: entry.name,
          target: describeTarget(entry.target),
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

// --- 掉帧片段（rAF 帧间隔聚合） ---
function watchJank(): void {
  let last = performance.now();
  let badFrames = 0;
  let spanStart = 0;
  let worstFrameMs = 0;
  let frameSum = 0;

  const reset = () => {
    badFrames = 0;
    worstFrameMs = 0;
    frameSum = 0;
  };

  const flushSpan = (end: number) => {
    const durationMs = end - spanStart;
    report({
      kind: "jank",
      durationMs: Math.round(durationMs),
      worstFrameMs: Math.round(worstFrameMs),
      avgFps: Math.round((badFrames / Math.max(frameSum, 1)) * 1000),
    });
    reset();
  };

  const frame = (now: number) => {
    const delta = now - last;
    last = now;
    if (document.hidden || !document.hasFocus()) {
      // rAF 在隐藏/遮挡/失焦窗口被节流到 ~1Hz，帧间隔是节流档位不是掉帧，恢复后首帧同样无意义
      reset();
      requestAnimationFrame(frame);
      return;
    }
    if (delta >= BAD_FRAME_MS) {
      if (badFrames === 0) {
        spanStart = now - delta;
        worstFrameMs = delta;
        frameSum = delta;
      } else {
        worstFrameMs = Math.max(worstFrameMs, delta);
        frameSum += delta;
      }
      badFrames += 1;
      if (badFrames >= JANK_MIN_FRAMES && now - spanStart >= JANK_FLUSH_MS) {
        flushSpan(now);
      }
    } else if (badFrames >= JANK_MIN_FRAMES) {
      flushSpan(now);
    } else if (badFrames > 0) {
      reset();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// --- JS 堆内存趋势（泄漏检测） ---
function watchHeap(): void {
  const memory = (performance as unknown as { memory?: PerformanceMemoryLike }).memory;
  if (!memory) return;
  window.setInterval(() => {
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
    const key = JSON.stringify(event.query.queryKey).slice(0, 120);
    fetchesByKey.set(key, (fetchesByKey.get(key) ?? 0) + 1);
  });
  window.setInterval(() => {
    let total = 0;
    for (const count of fetchesByKey.values()) total += count;
    if (total > 0) {
      const topQueryKeys = [...fetchesByKey.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => `${key}×${count}`);
      report({ kind: "query-rate", eventsPerMin: total, topQueryKeys });
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
  watchJank();
  watchHeap();
  watchQueryRate();
}
