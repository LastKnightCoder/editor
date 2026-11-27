// @vitest-environment node
import { expect, it, vi } from "vitest";
import { PerfDiagnostics } from "../perf-diagnostics";
import { PerfCpuScheduler } from "../perf-cpu-scheduler";

it("CPU 更新不重复启动采样，进程间共享冷却且故障不阻塞异常留档", async () => {
  let now = 1000;
  let release: (() => void) | undefined;
  const capture = vi.fn(
    () =>
      new Promise<{ actualDurationMs: number }>(resolve => {
        release = () => resolve({ actualDurationMs: 1 });
      })
  );
  const recorder = new PerfDiagnostics("test", {
    now: () => now,
    afterMs: 100,
    cooldownMs: 0,
    onIncident: incident => scheduler.consider(incident),
  });
  const scheduler = new PerfCpuScheduler({
    buildId: "test-build",
    now: () => now,
    capture,
    update: (id, value) => recorder.updateCpu(id, value),
  });
  recorder.record(
    { t: now, kind: "longtask", ms: 600 },
    { pid: 1, type: "renderer", webContentsId: 1 }
  );
  await Promise.resolve();
  expect(capture).toHaveBeenCalledTimes(1);
  expect(recorder.snapshot().incidents[0].cpu?.status).toBe("recording");
  release?.();
  await vi.waitFor(() => expect(recorder.snapshot().incidents[0].cpu?.status).toBe("complete"));
  now += 101;
  recorder.record({ t: now, kind: "longtask", ms: 600 }, { pid: 2, type: "main" });
  expect(recorder.snapshot().incidents.at(-1)?.cpu).toMatchObject({
    status: "skipped",
    reason: "cooldown",
  });
  now += 300_001;
  capture.mockImplementationOnce(() =>
    Promise.reject(new Error("native adapter failure with private path"))
  );
  recorder.record({ t: now, kind: "longtask", ms: 600 }, { pid: 3, type: "main" });
  await vi.waitFor(() =>
    expect(recorder.snapshot().incidents.at(-1)?.cpu).toMatchObject({
      status: "failed",
      reason: "capture-failed",
    })
  );
  expect(recorder.snapshot().incidents.at(-1)?.status).toBe("recording");
});

it("关闭时取消当前采样，不再为新片段创建任务", async () => {
  let signal: AbortSignal | undefined;
  const recorder = new PerfDiagnostics("test", {
    onIncident: incident => scheduler.consider(incident),
  });
  const scheduler = new PerfCpuScheduler({
    buildId: "test",
    update: (id, value) => recorder.updateCpu(id, value),
    capture: (_source, current) => {
      signal = current;
      return new Promise((_, reject) =>
        current.addEventListener("abort", () => reject(new Error("cancelled")))
      );
    },
  });
  recorder.record({ t: Date.now(), kind: "exception" }, { pid: 1, type: "main" });
  await Promise.resolve();
  scheduler.close();
  expect(signal?.aborted).toBe(true);
  await vi.waitFor(() => expect(recorder.snapshot().incidents[0].cpu?.status).toBe("interrupted"));
});
