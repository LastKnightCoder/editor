import { afterEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("@/electron", () => ({ send: sent }));
vi.mock("@/queryClient", () => ({
  queryClient: { getQueryCache: () => ({ subscribe: vi.fn() }) },
}));
import { startPerfObserver } from "../perf-observer";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("性能采集", () => {
  it("堆采样每次读取最新 memory，并保留长帧真实起点及未知渲染指标", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "electron", { configurable: true, value: {} });
    let heap = 1024 * 1024;
    Object.defineProperty(performance, "memory", {
      configurable: true,
      get: () => ({ usedJSHeapSize: heap, totalJSHeapSize: heap * 2 }),
    });
    const observers = new Map<string, PerformanceObserverCallback>();
    vi.stubGlobal(
      "PerformanceObserver",
      class {
        constructor(private callback: PerformanceObserverCallback) {}
        observe(options: PerformanceObserverInit) {
          observers.set(options.type ?? options.entryTypes![0], this.callback);
        }
      }
    );
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
    sent.mockClear();
    startPerfObserver();
    vi.advanceTimersByTime(30000);
    heap *= 3;
    vi.advanceTimersByTime(30000);
    expect(
      sent.mock.calls.filter(([, event]) => event.kind === "heap").map(([, event]) => event.usedMB)
    ).toEqual([1, 3]);
    observers.get("long-animation-frame")!(
      {
        getEntries: () => [
          {
            startTime: 123,
            duration: 200,
            renderStart: 200,
            styleAndLayoutStart: 220,
            scripts: [{ duration: 50, sourceFunctionName: "draw", sourceURL: "map.js" }],
          },
        ],
      } as unknown as PerformanceObserverEntryList,
      {} as PerformanceObserver
    );
    expect(sent.mock.calls.at(-1)![1]).toMatchObject({
      t: performance.timeOrigin + 123,
      renderMs: 123,
      styleLayoutMs: 103,
      paintMs: null,
      source: "draw@map.js:50ms",
    });
    delete (performance as unknown as { memory?: unknown }).memory;
  });
});
