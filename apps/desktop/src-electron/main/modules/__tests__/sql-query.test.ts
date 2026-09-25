import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { executeReadOnlySql, SqlQueryError } from "../sql-query";

describe("executeReadOnlySql", () => {
  const createDatabase = () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE cards (id INTEGER PRIMARY KEY, title TEXT, score INTEGER);");
    database.prepare("INSERT INTO cards (title, score) VALUES (?, ?)").run("第一条", 3);
    database.prepare("INSERT INTO cards (title, score) VALUES (?, ?)").run("第二条", 5);
    return database;
  };

  it("执行参数化查询并返回列、行和截断信息", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, {
      sql: "SELECT id, title, score FROM cards WHERE score >= @score ORDER BY id",
      params: { score: 3 },
    });
    expect(result.columns.map(column => column.name)).toEqual(["id", "title", "score"]);
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(false);
    database.close();
  });

  it("拒绝写入、多语句和危险 PRAGMA", () => {
    const database = createDatabase();
    for (const sql of [
      "UPDATE cards SET title='x'",
      "SELECT * FROM cards; DELETE FROM cards",
      "PRAGMA journal_mode = WAL",
      "EXPLAIN DELETE FROM cards",
    ]) {
      expect(() => executeReadOnlySql(database, { sql })).toThrow(SqlQueryError);
    }
    expect(database.prepare("SELECT COUNT(*) AS count FROM cards").get()).toEqual({ count: 2 });
    database.close();
  });

  it("允许 WITH 和结构探查 PRAGMA", () => {
    const database = createDatabase();
    expect(
      executeReadOnlySql(database, {
        sql: "WITH recent AS (SELECT * FROM cards) SELECT id FROM recent",
      }).rows
    ).toHaveLength(2);
    expect(
      executeReadOnlySql(database, { sql: "PRAGMA table_info(cards)" }).rows.length
    ).toBeGreaterThan(0);
    database.close();
  });

  it("限制返回行数", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, { sql: "SELECT * FROM cards", maxRows: 1 });
    expect(result.returnedRowCount).toBe(1);
    expect(result.truncated).toBe(true);
    database.close();
  });

  it("字符串字面量按原文执行，不被剥离", () => {
    const database = createDatabase();
    const exact = executeReadOnlySql(database, {
      sql: "SELECT id, title FROM cards WHERE title = '第一条'",
    });
    expect(exact.rows).toHaveLength(1);
    expect(exact.rows[0]).toEqual({ id: 1, title: "第一条" });

    const fuzzy = executeReadOnlySql(database, {
      sql: "SELECT COUNT(*) AS count FROM cards WHERE title LIKE '%条%'",
    });
    expect(fuzzy.rows[0]).toEqual({ count: 2 });

    const literalSemicolon = executeReadOnlySql(database, {
      sql: "SELECT COUNT(*) AS count FROM cards WHERE title = 'a;b'",
    });
    expect(literalSemicolon.rows[0]).toEqual({ count: 0 });
    database.close();
  });

  it("字面量中的语句关键字与注释标记不触发拦截", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, {
      sql: "SELECT COUNT(*) AS count FROM cards WHERE title = 'x; DELETE FROM cards; --'",
    });
    expect(result.rows[0]).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM cards").get()).toEqual({ count: 2 });
    database.close();
  });

  it("允许 replace 等只读字符串函数", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, {
      sql: "SELECT replace(title, '条', 'row') AS replaced FROM cards ORDER BY id LIMIT 1",
    });
    expect(result.rows[0]).toEqual({ replaced: "第一row" });
    database.close();
  });

  it("NaN 的行数与超时参数回退默认值", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, {
      sql: "SELECT * FROM cards",
      maxRows: Number.NaN,
      timeoutMs: Number.NaN,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(false);
    database.close();
  });

  it("结果体积超过上限时丢弃最后一行并标记截断", () => {
    const database = createDatabase();
    database.exec("CREATE TABLE big_rows (id INTEGER PRIMARY KEY, payload TEXT);");
    const insert = database.prepare("INSERT INTO big_rows (payload) VALUES (?)");
    for (let index = 0; index < 100; index += 1) {
      insert.run("x".repeat(30_000));
    }
    // 单元格先截断到 20k，多行累计触发 1MB 结果上限
    const result = executeReadOnlySql(database, {
      sql: "SELECT payload FROM big_rows",
      maxRows: 200,
    });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeLessThan(100);
    expect(result.truncated).toBe(true);
    database.close();
  });

  it("BLOB 值以 base64 返回", () => {
    const database = createDatabase();
    const result = executeReadOnlySql(database, { sql: "SELECT x'00ff10' AS blob" });
    expect(result.rows[0]).toEqual({
      blob: Buffer.from([0x00, 0xff, 0x10]).toString("base64"),
    });
    database.close();
  });
});
