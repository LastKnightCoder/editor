/**
 * 下线功能的残留表与列退役：老库里 history / prompt / skill / notion_sync 与
 * vibe_learning_resources 的两列被删掉，删前整库备份（prompt / notion_sync 可能有数据），重复执行无副作用。
 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { retireFeatureTables } from "@tau/db-schema/src/feature-table-retirement";

const LEGACY = `
  CREATE TABLE history (id INTEGER PRIMARY KEY, url TEXT);
  CREATE TABLE prompt (id INTEGER PRIMARY KEY, title TEXT, update_time INTEGER);
  CREATE INDEX idx_prompt_update_time ON prompt(update_time);
  INSERT INTO prompt VALUES (1, '写周报', 1);
  CREATE TABLE skill (id TEXT PRIMARY KEY, enabled INTEGER);
  CREATE TABLE notion_sync (id INTEGER PRIMARY KEY, page_id TEXT UNIQUE);
  INSERT INTO notion_sync VALUES (1, 'page');
  ALTER TABLE vibe_learning_resources ADD COLUMN is_chunked INTEGER DEFAULT 0;
  ALTER TABLE vibe_learning_resources ADD COLUMN chapter_count INTEGER DEFAULT 0;
`;

const objects = (db: Database.Database) =>
  (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('history','prompt','skill','notion_sync','idx_prompt_update_time','idx_notion_sync_page_id')"
      )
      .all() as Array<{ name: string }>
  ).map(row => row.name);
const columns = (db: Database.Database) =>
  (db.prepare("PRAGMA table_info(vibe_learning_resources)").all() as Array<{ name: string }>).map(
    row => row.name
  );

describe("下线功能残留表退役", () => {
  it("删表删列、保留其余数据，删前备份一次；再跑不动库、不再备份", () => {
    const dir = mkdtempSync(join(tmpdir(), "tau-feature-retire-"));
    const path = join(dir, "data.db");
    const db = new Database(path);
    try {
      db.exec(schema);
      db.exec(LEGACY);
      db.exec(
        "INSERT INTO project (id, title, create_time, update_time) VALUES (7, '学习', 1, 1);"
      );
      db.exec(
        "INSERT INTO vibe_learning_resources (id, project_id, create_time, update_time, name, original_path, resource_type, is_chunked) VALUES (1, 7, 1, 1, '资料', '/a.pdf', 'pdf', 1)"
      );

      expect(retireFeatureTables(db, path)).toEqual([
        "history",
        "prompt",
        "skill",
        "notion_sync",
        "vibe_learning_resources.is_chunked",
        "vibe_learning_resources.chapter_count",
      ]);
      expect(objects(db)).toEqual([]);
      expect(columns(db)).not.toContain("is_chunked");
      expect(columns(db)).not.toContain("chapter_count");
      expect(db.prepare("SELECT name FROM vibe_learning_resources WHERE id = 1").get()).toEqual({
        name: "资料",
      });

      const backups = readdirSync(dir).filter(name =>
        name.includes(".pre-feature-table-retirement-v1-")
      );
      expect(backups).toHaveLength(1);
      const snapshot = new Database(join(dir, backups[0]), { readonly: true });
      expect(snapshot.prepare("SELECT title FROM prompt").get()).toEqual({ title: "写周报" });
      snapshot.close();

      expect(retireFeatureTables(db, path)).toEqual([]);
      expect(
        readdirSync(dir).filter(name => name.includes(".pre-feature-table-retirement-v1-"))
      ).toHaveLength(1);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("新装机没有残留：什么都不做", () => {
    const db = new Database(":memory:");
    db.exec(schema);
    expect(retireFeatureTables(db, ":memory:")).toEqual([]);
    db.close();
  });
});
