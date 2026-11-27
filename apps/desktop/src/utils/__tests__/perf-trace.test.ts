import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PerfBatch } from "../../../shared/perf-diagnostics";

const send = vi.fn<(channel: string, batch: PerfBatch) => void>();
const bridge = Object.getOwnPropertyDescriptor(window, "electron");
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  send.mockClear();
  Object.defineProperty(window, "electron", {
    configurable: true,
    value: { send, windowRole: "main" },
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  if (bridge) Object.defineProperty(window, "electron", bridge);
  else Reflect.deleteProperty(window, "electron");
});
const events = () => send.mock.calls.flatMap(([, batch]) => batch.events);

it("操作跨 await 和切页时保留发起正文，编辑器注销后不留下活动身份", async () => {
  const perf = await import("../perf-trace");
  perf.setPerfPageContext({ pageKey: "projects", pageId: "first" });
  const editor = perf.registerPerfEditor(42);
  editor.focus(true);
  const operation = perf.beginPerfOperation("content.save");
  const work = operation.stage("save.write", async () => {
    await Promise.resolve();
  });
  editor.dispose();
  editor.dispose();
  perf.setPerfPageContext({ pageKey: "home", pageId: "second" });
  await work;
  operation.end();
  perf.flushPerfEvents();
  const end = events().find(event => event.kind === "operation-end");
  expect(end).toMatchObject({ context: { pageKey: "projects", contentId: 42 }, status: "ok" });
  const stage = events().find(event => event.kind === "stage");
  expect(stage?.operationId).toBe(end?.operationId);
  expect(
    events()
      .filter(event => event.kind === "context")
      .at(-1)?.context
  ).toMatchObject({
    pageKey: "home",
    editorCount: 0,
  });
});

it("事件风暴合入有限批次并报告丢弃，采集发送失败不改变业务返回或异常", async () => {
  const perf = await import("../perf-trace");
  for (let i = 0; i < 1000; i++) perf.reportPerfEvent({ kind: "frame", ms: 60 });
  perf.flushPerfEvents();
  const batch = send.mock.calls.at(-1)?.[1] as PerfBatch;
  expect(batch.events.length).toBeLessThan(1000);
  expect(batch.dropped + batch.events.length).toBe(1000);
  send.mockImplementationOnce(() => {
    throw new Error("transport gone");
  });
  expect(perf.measurePerf("calculate", () => 42)).toBe(42);
  const error = new Error("business failed");
  expect(() =>
    perf.measurePerf("calculate", () => {
      throw error;
    })
  ).toThrow(error);
});
