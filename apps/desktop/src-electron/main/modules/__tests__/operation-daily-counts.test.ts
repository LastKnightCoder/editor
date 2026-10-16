// @vitest-environment node
import Database from "better-sqlite3";
import dayjs from "dayjs";
import { afterEach, describe, expect, it } from "vitest";
import OperationTable from "../tables/operation";

const connections: Database.Database[] = [];
function database() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE operation (id INTEGER PRIMARY KEY, operation_time INTEGER, operation_id INTEGER);
    CREATE TABLE operation_daily_counts (date TEXT PRIMARY KEY, count INTEGER NOT NULL);
  `);
  connections.push(db);
  return db;
}
afterEach(() => connections.splice(0).forEach(db => db.open && db.close()));

function materialized(db: Database.Database) {
  return (
    db.prepare("SELECT date, count FROM operation_daily_counts ORDER BY date").all() as Array<{
      date: string;
      count: number;
    }>
  ).map(row => `${row.date}:${row.count}`);
}

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

  it("过去天查询后回写物化，今天与未来天只走实时路径", () => {
    const db = database();
    const insert = db.prepare("INSERT INTO operation (operation_time, operation_id) VALUES (?, ?)");
    insert.run(new Date(2026, 4, 1).getTime(), 1);
    insert.run(Date.now(), 2);
    insert.run(new Date(2026, 11, 31, 23, 59, 59, 999).getTime(), 3);
    expect(OperationTable.getOperationDailyCounts(db, 2026)).toEqual([
      { time: "2026-12-31", count: 1 },
      { time: dayjs().format("YYYY-MM-DD"), count: 1 },
      { time: "2026-05-01", count: 1 },
    ]);
    // 2026-05-01 已成历史被物化；今天动态、年末未来，均不落库
    expect(materialized(db)).toEqual(["2026-05-01:1"]);
  });

  it("物化后当天新增实时并入，且不污染物化表", () => {
    const db = database();
    const insert = db.prepare("INSERT INTO operation (operation_time, operation_id) VALUES (?, ?)");
    const today = dayjs().format("YYYY-MM-DD");
    db.transaction(() => {
      insert.run(new Date(2026, 4, 1).getTime(), 1);
      insert.run(Date.now(), 10);
    })();
    expect(OperationTable.getOperationDailyCounts(db, 2026)).toContainEqual({
      time: today,
      count: 1,
    });
    insert.run(Date.now(), 11);
    expect(OperationTable.getOperationDailyCounts(db, 2026)).toContainEqual({
      time: today,
      count: 2,
    });
    expect(materialized(db)).toEqual(["2026-05-01:1"]);
  });

  it("当年已物化后查更早年份，仍按该年全年实时聚合", () => {
    const db = database();
    const insert = db.prepare("INSERT INTO operation (operation_time, operation_id) VALUES (?, ?)");
    db.transaction(() => {
      insert.run(new Date(2026, 4, 1).getTime(), 1);
      insert.run(new Date(2025, 2, 1).getTime(), 5);
      insert.run(new Date(2025, 2, 1).getTime(), 5);
    })();
    OperationTable.getOperationDailyCounts(db, 2026);
    expect(OperationTable.getOperationDailyCounts(db, 2025)).toEqual([
      { time: "2025-03-01", count: 1 },
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
