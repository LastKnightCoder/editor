import { afterEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn<(channel: string, batch: PerfBatch) => void>());
vi.mock("@/queryClient", () => ({
  queryClient: { getQueryCache: () => ({ subscribe: vi.fn() }) },
}));
import { startPerfObserver } from "../perf-observer";
import { flushPerfEvents } from "../perf-trace";
import type { PerfBatch } from "../../../shared/perf-diagnostics";

const events = () => sent.mock.calls.flatMap(([, batch]) => batch.events);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("性能采集", () => {
  it("堆采样每次读取最新 memory，并保留长帧真实起点及未知渲染指标", () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "electron", { configurable: true, value: { send: sent } });
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
          const type = options.type ?? options.entryTypes?.[0];
          if (type) observers.set(type, this.callback);
        }
      }
    );
    sent.mockClear();
    startPerfObserver();
    vi.advanceTimersByTime(5000);
    flushPerfEvents();
    heap *= 3;
    vi.advanceTimersByTime(5000);
    flushPerfEvents();
    expect(
      events()
        .filter(event => event.kind === "heap")
        .map(event => event.values?.usedMB)
    ).toEqual([1, 3]);
    const onFrame = observers.get("long-animation-frame");
    if (!onFrame) throw new Error("未安装长帧观察器");
    onFrame(
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
    flushPerfEvents();
    expect(events().at(-1)).toMatchObject({
      t: performance.timeOrigin + 123,
      kind: "frame",
      values: { renderMs: 123, styleLayoutMs: 103 },
    });
    delete (performance as unknown as { memory?: unknown }).memory;
  });
});
