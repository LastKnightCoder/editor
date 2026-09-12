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
