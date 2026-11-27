// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PerfDiagnostics } from "../perf-diagnostics";
import { parsePerfInput, type PerfIncident } from "../../../../shared/perf-diagnostics";

const source = { pid: 10, type: "renderer", webContentsId: 1 };

describe("异常片段状态机", () => {
  it("触发时先保留前文，后续信号合并，到期后完成并进入冷却", () => {
    let now = 1000;
    const saved: PerfIncident[] = [];
    const recorder = new PerfDiagnostics("test", {
      now: () => now,
      beforeMs: 100,
      afterMs: 100,
      cooldownMs: 300,
      onIncident: incident => saved.push(incident),
    });
    recorder.record({ t: now, kind: "context", context: { pageKey: "projects" } }, source);
    now += 50;
    recorder.record({ t: now - 20, kind: "longtask", ms: 800 }, source);
    expect(saved[0]).toMatchObject({ status: "recording", summary: { events: 2 } });
    now += 50;
    recorder.record({ t: now, kind: "interaction", ms: 900 }, source);
    expect(saved[0].events).toHaveLength(2);
    now += 50;
    recorder.tick();
    expect(saved[1]).toMatchObject({
      status: "complete",
      summary: { events: 3 },
      reasons: [{ reason: "ui-blocked", count: 2 }],
    });
    recorder.record({ t: now, kind: "longtask", ms: 900 }, source);
    expect(recorder.suppressed).toBe(1);
    now += 301;
    recorder.record({ t: now, kind: "longtask", ms: 900 }, source);
    expect(saved.at(-1)?.status).toBe("recording");
  });

  it("时间与字节预算同时生效，截断有计数，异常前文不随普通时间线淘汰", () => {
    let now = 1000;
    const recorder = new PerfDiagnostics("test", {
      now: () => now,
      maxBytes: 1200,
      timelineMs: 100,
      afterMs: 1000,
    });
    recorder.record({ t: now, kind: "longtask", ms: 600 }, source);
    for (let i = 0; i < 20; i++)
      recorder.record({ t: now, kind: "stage", label: `work:${i}`, ms: 1 }, source);
    const before = recorder.snapshot();
    expect(before.collector.bytes).toBeLessThanOrEqual(1200);
    expect(before.collector.dropped).toBeGreaterThan(0);
    expect(before.incidents[0].dropped).toBeGreaterThan(0);
    now += 101;
    const after = recorder.snapshot();
    expect(after.events).toEqual([]);
    expect(after.incidents[0].events[0].kind).toBe("longtask");
  });

  it("采样缺口不被当成持续高 CPU，异常期间的新进程独立判定", () => {
    let now = 1000;
    const recorder = new PerfDiagnostics("test", { now: () => now });
    const sample = () =>
      recorder.record({ t: now, kind: "resource", values: { cpuCorePercent: 100 } }, source);
    sample();
    now += 60_000;
    sample();
    expect(recorder.snapshot().incidents).toEqual([]);
    for (let i = 0; i < 3; i++) {
      now += 5000;
      sample();
    }
    expect(recorder.snapshot().incidents[0].reasons[0].reason).toBe("sustained-cpu");
  });

  it("摘要区分同 ID 的不同进程，保留未完成操作及可观察的慢阶段", () => {
    const recorder = new PerfDiagnostics("test");
    const t = Date.now();
    recorder.record({ t, kind: "operation-start", operationId: "same", label: "open" }, source);
    recorder.record(
      { t, kind: "operation-start", operationId: "same", label: "save" },
      { pid: 20, type: "main" }
    );
    recorder.record({ t, kind: "operation-end", operationId: "same", ms: 50 }, source);
    recorder.record({ t, kind: "stage", label: "projection", ms: 250 }, { pid: 20, type: "main" });
    expect(recorder.snapshot().summary).toMatchObject({
      unfinished: [{ operationId: "same", label: "save", pid: 20 }],
      slowStages: expect.arrayContaining([
        expect.objectContaining({ label: "stage:projection", maxMs: 250 }),
      ]),
    });
  });

  it("只有开始而没有完成的操作也能自动保留现场，关闭时注明中断", () => {
    let now = 1000;
    const recorder = new PerfDiagnostics("test", { now: () => now });
    recorder.record(
      { t: now, kind: "operation-start", operationId: "stuck", label: "open" },
      source
    );
    now += 8000;
    recorder.tick();
    expect(recorder.snapshot().incidents[0]).toMatchObject({
      status: "recording",
      reasons: [{ reason: "unfinished-operation" }],
    });
    recorder.finish();
    expect(recorder.snapshot().incidents[0].status).toBe("interrupted");
  });

  it("传输只保留运行元信息，任意正文、查询值和不合法指标不能进入诊断", () => {
    const event = parsePerfInput({
      t: 1000,
      kind: "stage",
      label: "content.prepare",
      content: "private-body",
      context: { contentId: 42, title: "private-title", pageKey: "projects" },
      values: { count: 2, query: "private-query", usedMB: Number.NaN },
    });
    expect(event).toMatchObject({
      context: { contentId: 42, pageKey: "projects" },
      values: { count: 2 },
    });
    expect(JSON.stringify(event)).not.toContain("private-");
    expect(event?.values).not.toHaveProperty("usedMB");
  });

  it("留档回调失败不会阻断后续事件，过期操作不会耗尽追踪名额", () => {
    let now = 1000;
    const recorder = new PerfDiagnostics("test", {
      now: () => now,
      onIncident: () => {
        throw new Error("disk unavailable");
      },
    });
    recorder.record({ t: now, kind: "operation-start", operationId: "old", label: "open" }, source);
    now += 121_000;
    expect(() => recorder.tick()).not.toThrow();
    recorder.record(
      { t: now, kind: "operation-start", operationId: "next", label: "save" },
      source
    );
    const snapshot = recorder.snapshot();
    expect(snapshot.collector.callbackFailures).toBe(1);
    expect(snapshot.collector.expiredOperations).toBe(1);
    expect(snapshot.summary.unfinished).toEqual([{ operationId: "next", label: "save", pid: 10 }]);
  });
});
