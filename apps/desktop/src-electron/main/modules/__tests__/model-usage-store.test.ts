import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-log", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { ModelUsageStore } from "../model-usage/store";
import { UsageRecorder, type UsageRecordInput } from "../model-usage/recorder";
import { ulid } from "../model-usage/ulid";

const input = (overrides: Partial<UsageRecordInput> = {}): UsageRecordInput => ({
  ts: 1_700_000_000_000,
  kind: "llm",
  providerId: "p1",
  model: "m1",
  feature: "chat",
  scope: null,
  sessionId: null,
  entityId: null,
  status: "ok",
  errorMessage: null,
  latencyMs: 100,
  ttftMs: 20,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 15,
  units: null,
  cost: 0.01,
  costSource: "catalog",
  ...overrides,
});

describe("ulid", () => {
  it("同一毫秒内严格递增、长度 26", () => {
    const ids = Array.from({ length: 200 }, () => ulid(1_700_000_000_000));
    expect(ids.every(id => id.length === 26)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("时间前缀随时间增大；时钟回拨时仍保持递增", () => {
    const a = ulid(2_000_000_000_000);
    const b = ulid(2_000_000_000_001);
    const c = ulid(1_900_000_000_000);
    expect(b.slice(0, 10) > a.slice(0, 10)).toBe(true);
    expect(c > b).toBe(true);
  });
});

describe("UsageRecorder + ModelUsageStore", () => {
  let db: Database.Database;
  let store: ModelUsageStore;
  let storeAvailable: boolean;
  let recorder: UsageRecorder;

  beforeEach(() => {
    vi.useFakeTimers();
    db = new Database(":memory:");
    store = new ModelUsageStore(db);
    storeAvailable = true;
    recorder = new UsageRecorder({
      getStore: () => (storeAvailable ? store : null),
      getDeviceId: () => "device-a",
      getDefaultLibrary: () => "data.db",
      getProviderName: id => (id === "p1" ? "Provider One" : null),
      flushIntervalMs: 1000,
      batchSize: 3,
    });
  });

  afterEach(() => {
    recorder.dispose();
    db.close();
    vi.useRealTimers();
  });

  it("按间隔批量落库，并补齐设备、库名与服务商名", () => {
    recorder.record(input());
    expect(store.list().total).toBe(0);
    vi.advanceTimersByTime(1000);
    const { items } = store.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      deviceId: "device-a",
      library: "data",
      providerName: "Provider One",
      feature: "chat",
      totalTokens: 15,
    });
    expect(items[0].eventId).toHaveLength(26);
  });

  it("攒满批量立即写入", () => {
    recorder.record(input());
    recorder.record(input());
    recorder.record(input());
    expect(store.list().total).toBe(3);
    expect(recorder.pendingCount).toBe(0);
  });

  it("显式 library 优先于当前库", () => {
    recorder.record(input({ library: "work.db" }));
    recorder.flush();
    expect(store.list().items[0].library).toBe("work");
  });

  it("库不可用时保留缓冲，恢复后写入", () => {
    storeAvailable = false;
    recorder.record(input());
    recorder.flush();
    expect(recorder.pendingCount).toBe(1);
    storeAvailable = true;
    vi.advanceTimersByTime(1000);
    expect(store.list().total).toBe(1);
  });

  it("写库失败不抛出", () => {
    recorder.record(input());
    db.close();
    expect(() => recorder.flush()).not.toThrow();
    db = new Database(":memory:");
  });

  it("重复事件按主键去重", () => {
    recorder.record(input());
    recorder.flush();
    const [event] = store.list().items;
    store.insertMany([event, event]);
    expect(store.list().total).toBe(1);
  });

  it("summary 聚合与筛选", () => {
    recorder.record(input({ ts: 1000, cost: 0.5 }));
    recorder.record(input({ ts: 2000, status: "error", feature: "webClip", cost: 0 }));
    recorder.record(input({ ts: 3000, status: "aborted", model: "m2", cost: 0.25 }));
    recorder.flush();

    expect(store.summary()).toMatchObject({
      calls: 3,
      errors: 1,
      aborted: 1,
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
      cost: 0.75,
    });
    expect(store.summary({ from: 2000 }).calls).toBe(2);
    expect(store.summary({ to: 2000 }).calls).toBe(1);
    expect(store.summary({ feature: "webClip" }).calls).toBe(1);
    expect(store.summary({ model: "m2" }).cost).toBe(0.25);
    expect(store.summary({ library: "other" }).calls).toBe(0);
  });

  it("timeseries 按本地时区零点分天、按维度分组", () => {
    // 东八区：UTC 16:00 = 本地次日 00:00
    const localMidnight = Date.UTC(2026, 8, 1, 16); // 本地 9/2 00:00
    recorder.record(input({ ts: localMidnight - 60_000, model: "a", cost: 1 })); // 本地 9/1 23:59
    recorder.record(input({ ts: localMidnight + 60_000, model: "a", cost: 2 }));
    recorder.record(input({ ts: localMidnight + 120_000, model: "b", cost: 4 }));
    recorder.flush();
    const points = store.timeseries({
      bucket: "day",
      groupBy: "model",
      tzOffsetMinutes: 480,
    });
    expect(points).toEqual([
      { bucketStart: localMidnight - 86_400_000, key: "a", calls: 1, totalTokens: 15, cost: 1 },
      { bucketStart: localMidnight, key: "a", calls: 1, totalTokens: 15, cost: 2 },
      { bucketStart: localMidnight, key: "b", calls: 1, totalTokens: 15, cost: 4 },
    ]);
  });

  it("timeseries 按小时分桶", () => {
    const hour = Date.UTC(2026, 8, 1, 3);
    recorder.record(input({ ts: hour + 10 }));
    recorder.record(input({ ts: hour + 3_599_999 }));
    recorder.record(input({ ts: hour + 3_600_000 }));
    recorder.flush();
    const points = store.timeseries({ bucket: "hour", groupBy: "feature", tzOffsetMinutes: 480 });
    expect(points.map(p => [p.bucketStart - hour, p.calls])).toEqual([
      [0, 2],
      [3_600_000, 1],
    ]);
  });

  it("breakdown 按费用倒序，服务商取最近的名字，统计失败与平均耗时", () => {
    recorder.record(input({ ts: 1000, providerId: "p1", cost: 0.1, latencyMs: 100 }));
    recorder.record(
      input({ ts: 2000, providerId: "p1", cost: 0.1, latencyMs: 300, status: "error" })
    );
    recorder.record(input({ ts: 3000, providerId: "p2", cost: 1 }));
    recorder.flush();
    const rows = store.breakdown({ groupBy: "provider" });
    expect(rows.map(r => r.key)).toEqual(["p2", "p1"]);
    expect(rows[1]).toMatchObject({
      label: "Provider One",
      calls: 2,
      errors: 1,
      avgLatencyMs: 200,
    });
    expect(rows[0].label).toBe("p2");
  });

  it("breakdown 按库分组时未归属的库为空串", () => {
    recorder.record(input({ library: "work" }));
    recorder.flush();
    db.prepare("UPDATE model_usage_event SET library = NULL").run();
    expect(store.breakdown({ groupBy: "library" })[0].key).toBe("");
  });

  it("list 按时间倒序分页", () => {
    for (let i = 1; i <= 5; i++) recorder.record(input({ ts: i * 1000 }));
    recorder.flush();
    const page = store.list({ limit: 2, offset: 1 });
    expect(page.total).toBe(5);
    expect(page.items.map(item => item.ts)).toEqual([4000, 3000]);
  });
});
