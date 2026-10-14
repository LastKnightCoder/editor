// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { setImmediate } from "node:timers/promises";
import OperationTable from "../tables/operation";

const connections: Database.Database[] = [];
function database() {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE operation (id INTEGER PRIMARY KEY, operation_time INTEGER, operation_id INTEGER)"
  );
  connections.push(db);
  return db;
}
afterEach(() => connections.splice(0).forEach(db => db.open && db.close()));

describe("分批每日操作统计", () => {
  it("保留本地日期、跨批去重、NULL 口径，并包含年末最后一毫秒", async () => {
    const db = database();
    const insert = db.prepare("INSERT INTO operation (operation_time, operation_id) VALUES (?, ?)");
    const day = new Date(2026, 5, 1).getTime();
    db.transaction(() => {
      for (let i = 0; i < 2100; i++) insert.run(day, i % 7);
      insert.run(day, null);
      insert.run(day, null);
      insert.run(new Date(2027, 0, 1).getTime() - 1, 1);
      insert.run(new Date(2027, 0, 1).getTime(), 2);
      insert.run(new Date(2026, 0, 1).getTime() - 1, 3);
    })();
    expect(await OperationTable.getOperationDailyCounts(db, 2026)).toEqual([
      { time: "2026-12-31", count: 1 },
      { time: "2026-06-01", count: 8 },
    ]);
  });

  it("扫描期间允许其他事务运行，同库同年在途请求合并", async () => {
    const db = database();
    const insert = db.prepare("INSERT INTO operation (operation_time, operation_id) VALUES (?, ?)");
    const day = new Date(2026, 0, 1).getTime();
    db.transaction(() => {
      for (let i = 0; i < 5000; i++) insert.run(day, i);
    })();
    let finished = false;
    const task = OperationTable.getOperationDailyCounts(db, 2026);
    expect(OperationTable.getOperationDailyCounts(db, 2026)).toBe(task);
    void task.then(() => (finished = true));
    await setImmediate();
    expect(finished).toBe(false);
    db.transaction(() => insert.run(day, 5001))();
    expect(await task).toEqual([{ time: "2026-01-01", count: 5000 }]);
    expect(await OperationTable.getOperationDailyCounts(db, 2026)).toEqual([
      { time: "2026-01-01", count: 5001 },
    ]);
  });

  it("空库与另一连接互不串结果", async () => {
    const empty = database();
    const full = database();
    full.prepare("INSERT INTO operation VALUES (1, ?, 1)").run(new Date(2026, 0, 1).getTime());
    expect(await OperationTable.getOperationDailyCounts(empty, 2026)).toEqual([]);
    expect(await OperationTable.getOperationDailyCounts(full, 2026)).toHaveLength(1);
    await expect(OperationTable.getOperationDailyCounts(full, NaN)).rejects.toThrow("无效");
  });
});
