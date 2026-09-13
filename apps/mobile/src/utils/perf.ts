// 轻量性能日志：诊断导航/加载卡顿用。DEV 默认开启；
// release 包里 localStorage.setItem("tau-perf", "1") 后刷新亦可启用。
const PERF_SWITCH_KEY = "tau-perf";

let enabled: boolean | null = null;

export function isPerfEnabled(): boolean {
  if (enabled === null) {
    enabled = import.meta.env.DEV || globalThis.localStorage?.getItem(PERF_SWITCH_KEY) === "1";
  }
  return enabled;
}

export function logPerf(scope: string, label: string, ms: number): void {
  if (!isPerfEnabled()) return;
  console.debug(`[perf] ${scope} ${label} ${ms.toFixed(1)}ms`);
}

export function logPerfSize(scope: string, label: string, bytes: number): void {
  if (!isPerfEnabled()) return;
  console.debug(`[perf] ${scope} ${label} ${(bytes / 1024).toFixed(1)}KB`);
}

/** 帧采样：durationMs 内统计 rAF 帧间隔，>32ms 视为掉帧；用于量化转场/入场动画期间的卡顿 */
export function sampleFrames(scope: string, label: string, durationMs = 1500): void {
  if (!isPerfEnabled()) return;
  if (typeof requestAnimationFrame !== "function") return;
  const start = performance.now();
  let frames = 0;
  let dropped = 0;
  let worst = 0;
  let last = start;
  const tick = (now: number) => {
    const delta = now - last;
    last = now;
    frames += 1;
    if (delta > 32) dropped += 1;
    if (delta > worst) worst = delta;
    if (now - start < durationMs) {
      requestAnimationFrame(tick);
      return;
    }
    const avg = (now - start) / Math.max(frames, 1);
    console.debug(
      `[perf] ${scope} ${label} frames=${frames} dropped=${dropped} worst=${worst.toFixed(1)}ms avg=${avg.toFixed(1)}ms`
    );
  };
  requestAnimationFrame(tick);
}

// 主线程长任务监听：转场动画期间的掉帧会以 >50ms 的 longtask 形式暴露
export function initPerfObservers(): void {
  if (!isPerfEnabled()) return;
  if (typeof PerformanceObserver !== "function") return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        logPerf("longtask", `@${Math.round(entry.startTime)}`, entry.duration);
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // WebView 不支持 longtask entry 时静默跳过
  }
}
