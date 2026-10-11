/**
 * 性能记录侧的最小行为验证：阈值过滤、慢 IPC 结果大小估算与 ring buffer 封顶。
 */
import { describe, expect, it } from "vitest";
import {
  pushCapped,
  recordIpcCall,
  recordSqlCall,
  recordSyncIo,
  slowIpc,
  slowSql,
  slowSyncIo,
} from "../perf-record";

describe("perf-record", () => {
  it("同步 IO 低于阈值不记录，达到阈值记录并截断超长 label", () => {
    const before = slowSyncIo.length;
    recordSyncIo("read:small.json", 1024, 10);
    expect(slowSyncIo.length).toBe(before);

    recordSyncIo("x".repeat(300), 1024, 60);
    expect(slowSyncIo.length).toBe(before + 1);
    expect(slowSyncIo[slowSyncIo.length - 1].label.length).toBeLessThanOrEqual(200);
  });

  it("慢 IPC 附带结果大小：字符串按长度、对象按序列化长度、未传 result 不带字段", () => {
    recordIpcCall("perf:test:string", 120, true, "x".repeat(500));
    recordIpcCall("perf:test:object", 120, true, { items: ["a", "b"] });
    recordIpcCall("perf:test:no-result", 120, true);

    const rows = slowIpc.slice(-3);
    expect(rows[0].resultBytes).toBe(500);
    expect(rows[1].resultBytes).toBe(JSON.stringify({ items: ["a", "b"] }).length);
    expect(rows[2].resultBytes).toBeUndefined();
  });

  it("SQL 低于阈值不记录", () => {
    const before = slowSql.length;
    recordSqlCall("data.db", "fast-query", 40, true);
    expect(slowSql.length).toBe(before);
  });

  it("ring buffer 封顶时丢弃最旧样本", () => {
    const buffer: number[] = [];
    for (let i = 0; i < 700; i += 1) pushCapped(buffer, i);
    expect(buffer.length).toBe(600);
    expect(buffer[0]).toBe(100);
  });
});
