// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
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

describe("每日操作统计", () => {
  it("保留本地日期、按日去重、NULL 口径，并包含年末最后一毫秒", () => {
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
    expect(OperationTable.getOperationDailyCounts(db, 2026)).toEqual([
      { time: "2026-12-31", count: 1 },
      { time: "2026-06-01", count: 8 },
    ]);
  });

  it("空库与另一连接互不串结果", () => {
    const empty = database();
    const full = database();
    full.prepare("INSERT INTO operation VALUES (1, ?, 1)").run(new Date(2026, 0, 1).getTime());
    expect(OperationTable.getOperationDailyCounts(empty, 2026)).toEqual([]);
    expect(OperationTable.getOperationDailyCounts(full, 2026)).toHaveLength(1);
    expect(() => OperationTable.getOperationDailyCounts(full, NaN)).toThrow("无效");
  });
});
