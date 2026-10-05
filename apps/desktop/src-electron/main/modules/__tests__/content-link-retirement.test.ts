/**
 * content_link 退役：网页条目 → 剪藏解析文档的记录迁入 entity_lineage（clipped_from）后删表；
 * 有无法迁移的记录时失败且不动库；重复执行无副作用；迁移 SQL 里的建表与主库 schema 一致。
 */
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import { retireContentLink } from "@tau/db-schema/src/content-link-retirement";
import LEGACY from "@tau/db-schema/fixtures/content-link-retirement.sql?raw";

const lineage = (db: Database.Database) =>
  db
    .prepare(
      "SELECT src_kind, src_id, src_anchor, dst_kind, dst_id, relation, create_time FROM entity_lineage ORDER BY id"
    )
    .all();

const hasTable = (db: Database.Database, name: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

const tableInfo = (db: Database.Database) => db.prepare("PRAGMA table_info(entity_lineage)").all();

const withDatabase = (run: (db: Database.Database, path: string, dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "tau-content-link-retire-"));
  const path = join(dir, "data.db");
  const db = new Database(path);
  try {
    run(db, path, dir);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("content_link 退役", () => {
  it("迁入谱系、删表、备份一次；再跑不动库、不再备份", () => {
    withDatabase((db, path, dir) => {
      db.exec(schema);
      db.exec(LEGACY);

      expect(retireContentLink(db, path)).toBe(2);
      expect(hasTable(db, "content_link")).toBe(false);
      expect(lineage(db)).toEqual([
        {
          src_kind: "project-item",
          src_id: "5",
          src_anchor: null,
          dst_kind: "web-clip",
          dst_id: "9",
          relation: "clipped_from",
          create_time: 100,
        },
        {
          src_kind: "project-item",
          src_id: "6",
          src_anchor: null,
          dst_kind: "web-clip",
          dst_id: "10",
          relation: "clipped_from",
          create_time: 200,
        },
      ]);
      const backups = () => readdirSync(dir).filter(name => name.endsWith(".bak"));
      expect(backups()).toHaveLength(1);

      expect(retireContentLink(db, path)).toBe(0);
      expect(lineage(db)).toHaveLength(2);
      expect(backups()).toHaveLength(1);
    });
  });

  it("有无法迁移的记录时失败，表与数据原样保留", () => {
    withDatabase((db, path) => {
      db.exec(schema);
      db.exec(LEGACY);
      db.exec("INSERT INTO content_link VALUES (3, 300, 7, 'card', 11, 'web_clip')");

      expect(() => retireContentLink(db, path)).toThrow(/^CONTENT_LINK_RETIREMENT_FAILED/);
      expect(hasTable(db, "content_link")).toBe(true);
      expect(lineage(db)).toEqual([]);
    });
  });

  it("没有主库 schema 时自建谱系表，结构与主库 schema 一致", () => {
    const expected = new Database(":memory:");
    expected.exec(schema);
    withDatabase((db, path) => {
      db.exec(LEGACY);
      retireContentLink(db, path);
      expect(tableInfo(db)).toEqual(tableInfo(expected));
    });
    expected.close();
  });
});
