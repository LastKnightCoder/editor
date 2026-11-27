import { describe, expect, it, vi } from "vitest";
import {
  perfDiagnostics,
  recordIpcCall,
  recordDatabaseCommand,
  withPerfTrace,
} from "../perf-record";

describe("性能记录边界", () => {
  it("慢调用诊断不再次序列化业务返回对象", () => {
    const toJSON = vi.fn(() => {
      throw new Error("不允许再次遍历");
    });
    recordIpcCall("test:large-result", 120, true, { toJSON });
    expect(toJSON).not.toHaveBeenCalled();
    expect(
      perfDiagnostics.snapshot().events.find(event => event.label === "test:large-result")
    ).toMatchObject({ kind: "ipc", ms: 120 });
  });

  it("并发异步命令各自保留发起窗口和操作，不随完成顺序串线", async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => {
      release = resolve;
    });
    const first = withPerfTrace(
      { operationId: "op-first", context: { contentId: 1 } },
      { pid: 100, type: "main", webContentsId: 11 },
      async () => {
        await waiting;
        recordDatabaseCommand("data.db", "test:first", 1, true);
      }
    );
    await withPerfTrace(
      { operationId: "op-second", context: { contentId: 2 } },
      { pid: 100, type: "main", webContentsId: 22 },
      async () => {
        await Promise.resolve();
        recordDatabaseCommand("data.db", "test:second", 1, true);
      }
    );
    release();
    await first;
    const events = perfDiagnostics.snapshot().events;
    expect(events.find(event => event.label === "test:first")).toMatchObject({
      operationId: "op-first",
      context: { contentId: 1 },
      source: { webContentsId: 11 },
    });
    expect(events.find(event => event.label === "test:second")).toMatchObject({
      operationId: "op-second",
      context: { contentId: 2 },
      source: { webContentsId: 22 },
    });
  });
});
