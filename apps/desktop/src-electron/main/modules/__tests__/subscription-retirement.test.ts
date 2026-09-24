import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import fixture from "@tau/db-schema/fixtures/subscription-retirement.sql?raw";
import { retireSubscriptions } from "@tau/db-schema/src/subscription-retirement";

const directories: string[] = [];
const databases: Database.Database[] = [];
function open(path = ":memory:") {
  const db = new Database(path);
  databases.push(db);
  return db;
}
function directory() {
  const path = mkdtempSync(join(tmpdir(), "tau-retire-"));
  directories.push(path);
  return path;
}
function retiredCount(db: Database.Database) {
  return db
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE name IN ('rss_feed','rss_subscription','rss_entry','read_later','idx_rss_entry_read')"
    )
    .get();
}
afterEach(() => {
  databases.splice(0).forEach(db => {
    if (db.open) db.close();
  });
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

describe("订阅域退役", () => {
  it("备份包含 WAL 中的正文，清理后保留独立内容，重复升级不重复备份", () => {
    const dir = directory();
    const path = join(dir, "data.db");
    const db = open(path);
    db.pragma("journal_mode=WAL");
    db.pragma("wal_autocheckpoint=0");
    db.exec(schema);
    db.exec(fixture);
    const kept = ["contents", "articles", "project", "project_item", "video_notes"];
    const before = kept.map(table => db.prepare(`SELECT * FROM ${table}`).all());
    retireSubscriptions(db, path);
    retireSubscriptions(db, path);
    expect(retiredCount(db)).toEqual({ n: 0 });
    expect(kept.map(table => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    const backups = readdirSync(dir).filter(name =>
      name.includes(".pre-subscription-retirement-v1-")
    );
    expect(backups).toHaveLength(1);
    const snapshot = open(join(dir, backups[0]));
    expect(snapshot.prepare("SELECT content, is_starred FROM rss_entry").get()).toEqual({
      content: "抓取正文",
      is_starred: 1,
    });
    expect(snapshot.prepare("SELECT content FROM read_later").get()).toEqual({
      content: "稍后读正文",
    });
    snapshot.close();
    db.close();
    copyFileSync(join(dir, backups[0]), path);
    const restored = open(path);
    retireSubscriptions(restored, path);
    expect(retiredCount(restored)).toEqual({ n: 0 });
    expect(
      readdirSync(dir).filter(name => name.includes(".pre-subscription-retirement-v1-"))
    ).toHaveLength(2);
  });

  it("备份失败时原表和数据保持不变", () => {
    const db = open();
    db.exec("CREATE TABLE read_later(id INTEGER); INSERT INTO read_later VALUES(42)");
    expect(() => retireSubscriptions(db, join(directory(), "missing", "data.db"))).toThrow(
      "SUBSCRIPTION_RETIREMENT_FAILED"
    );
    expect(db.prepare("SELECT id FROM read_later").get()).toEqual({ id: 42 });
  });

  it("删除中途失败回滚已删除的表", () => {
    const db = open();
    db.exec(
      "CREATE TABLE read_later(id INTEGER); INSERT INTO read_later VALUES(42); CREATE VIEW rss_entry AS SELECT 1"
    );
    expect(() => retireSubscriptions(db, ":memory:")).toThrow("SUBSCRIPTION_RETIREMENT_FAILED");
    expect(db.prepare("SELECT id FROM read_later").get()).toEqual({ id: 42 });
    expect(db.inTransaction).toBe(false);
  });

  it.each(["read_later", "rss_entry", "rss_subscription", "rss_feed"])(
    "兼容仅剩 %s 的旧库",
    name => {
      const db = open();
      db.exec(`CREATE TABLE ${name}(id INTEGER)`);
      retireSubscriptions(db, ":memory:");
      retireSubscriptions(db, ":memory:");
      expect(retiredCount(db)).toEqual({ n: 0 });
    }
  );

  it("新库没有退役表且无需创建备份", () => {
    const db = open();
    db.exec(schema);
    retireSubscriptions(db, join(directory(), "missing", "data.db"));
    expect(retiredCount(db)).toEqual({ n: 0 });
  });
});
