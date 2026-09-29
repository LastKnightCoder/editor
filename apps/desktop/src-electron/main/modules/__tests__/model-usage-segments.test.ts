import Database from "better-sqlite3";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelUsageStore } from "../model-usage/store";
import {
  exportSegment,
  importSegment,
  localSegments,
  monthOf,
  monthRange,
} from "../model-usage/segments";
import { ulid } from "../model-usage/ulid";
import type { ModelUsageEvent } from "@/types/model-usage";

const A = ulid(Date.UTC(2026, 0, 1));
const B = ulid(Date.UTC(2026, 0, 2));

const event = (deviceId: string, ts: number, overrides: Partial<ModelUsageEvent> = {}) =>
  ({
    eventId: ulid(ts),
    ts,
    deviceId,
    library: "data",
    kind: "llm",
    providerId: "p",
    providerName: "P",
    model: "m",
    feature: "chat",
    scope: null,
    sessionId: null,
    entityId: null,
    status: "ok",
    errorMessage: null,
    latencyMs: 10,
    ttftMs: 5,
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 120,
    units: null,
    cost: 0.01,
    costSource: "catalog",
    ...overrides,
  }) as ModelUsageEvent;

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("用量分段", () => {
  let dbA: Database.Database;
  let dbB: Database.Database;
  let storeA: ModelUsageStore;
  let storeB: ModelUsageStore;

  beforeEach(() => {
    dbA = new Database(":memory:");
    dbB = new Database(":memory:");
    storeA = new ModelUsageStore(dbA);
    storeB = new ModelUsageStore(dbB);
  });
  afterEach(() => {
    dbA.close();
    dbB.close();
  });

  it("按 UTC 月切分，月份边界落在正确的分段", () => {
    expect(monthOf(Date.UTC(2026, 0, 31, 23, 59))).toBe("2026-01");
    expect(monthOf(Date.UTC(2026, 1, 1))).toBe("2026-02");
    expect(monthRange("2026-12")).toEqual({
      from: Date.UTC(2026, 11, 1),
      to: Date.UTC(2027, 0, 1),
    });
    expect(() => monthRange("2026-13")).toThrow();
  });

  it("导出 → 另一台设备导入，内容与哈希一致；只统计本机事件", () => {
    storeA.insertMany([
      event(A, Date.UTC(2026, 0, 5)),
      event(A, Date.UTC(2026, 1, 5)),
      event(B, Date.UTC(2026, 0, 6)),
    ]);
    const segments = localSegments(storeA, A);
    expect(segments.map(s => [s.month, s.count])).toEqual([
      ["2026-01", 1],
      ["2026-02", 1],
    ]);
    const { data, info } = exportSegment(storeA, A, "2026-01");
    expect(info.hash).toBe(segments[0].hash);

    const result = importSegment(
      storeB,
      { deviceId: A, month: "2026-01", hash: info.hash, data },
      B
    );
    expect(result).toEqual({ imported: 1, skipped: 0 });
    // 导入方重新算出的哈希必须与来源一致，否则下一轮会反复拉取
    expect(localSegments(storeB, A)[0].hash).toBe(info.hash);
  });

  it("同一分段重复导入是整体替换，不会翻倍；远端删掉的行本地也消失", () => {
    const first = [event(A, Date.UTC(2026, 0, 5)), event(A, Date.UTC(2026, 0, 6))];
    storeA.insertMany(first);
    const v1 = exportSegment(storeA, A, "2026-01");
    importSegment(storeB, { deviceId: A, month: "2026-01", hash: v1.info.hash, data: v1.data }, B);
    importSegment(storeB, { deviceId: A, month: "2026-01", hash: v1.info.hash, data: v1.data }, B);
    expect(storeB.summary().calls).toBe(2);

    storeA.deleteDevice(A);
    storeA.insertMany([first[0]]);
    const v2 = exportSegment(storeA, A, "2026-01");
    importSegment(storeB, { deviceId: A, month: "2026-01", hash: v2.info.hash, data: v2.data }, B);
    expect(storeB.summary().calls).toBe(1);
  });

  it("哈希不一致拒绝导入，本地数据不动", () => {
    storeA.insertMany([event(A, Date.UTC(2026, 0, 5))]);
    const { data } = exportSegment(storeA, A, "2026-01");
    expect(() =>
      importSegment(storeB, { deviceId: A, month: "2026-01", hash: "0".repeat(64), data }, B)
    ).toThrow("哈希不一致");
    expect(storeB.summary().calls).toBe(0);
  });

  it("不合格的行整行丢弃：设备不符、越出月份、字段类型错、坏 JSON", () => {
    const good = event(A, Date.UTC(2026, 0, 5));
    const lines = [
      JSON.stringify(good),
      JSON.stringify(event(B, Date.UTC(2026, 0, 5))),
      JSON.stringify(event(A, Date.UTC(2026, 1, 5))),
      JSON.stringify({ ...event(A, Date.UTC(2026, 0, 7)), cost: "free" }),
      JSON.stringify({ ...event(A, Date.UTC(2026, 0, 8)), status: "hacked" }),
      "{not json",
    ];
    const text = `${lines.join("\n")}\n`;
    const result = importSegment(
      storeB,
      { deviceId: A, month: "2026-01", hash: sha(text), data: new Uint8Array(gzipSync(text)) },
      B
    );
    expect(result).toEqual({ imported: 1, skipped: 5 });
    expect(storeB.list().items[0].eventId).toBe(good.eventId);
  });

  it("拒绝导入本机自己的分段与非法设备 id", () => {
    const empty = new Uint8Array(gzipSync(""));
    expect(() =>
      importSegment(storeA, { deviceId: A, month: "2026-01", hash: sha(""), data: empty }, A)
    ).toThrow();
    expect(() =>
      importSegment(storeA, { deviceId: "../x", month: "2026-01", hash: sha(""), data: empty }, A)
    ).toThrow("无效的设备 id");
  });
});
