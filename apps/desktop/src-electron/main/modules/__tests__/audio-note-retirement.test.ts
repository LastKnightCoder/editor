import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import fixture from "@tau/db-schema/fixtures/audio-note-retirement.sql?raw";
import { retireFeatureTables } from "@tau/db-schema/src/feature-table-retirement";
import { migrateKnowledgeIndex } from "@tau/db-schema/src/knowledge-index-migration";

function assertRetired(db: Database.Database) {
  expect(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE name IN ('audio_notes','audio_note_item','idx_audio_note_item_audio')"
      )
      .all()
  ).toEqual([]);
  expect(db.prepare("SELECT id FROM project_item ORDER BY id").all()).toEqual(
    [10, 12, 21, 23, 25, 26].map(id => ({ id }))
  );
  expect(db.prepare("SELECT children FROM project ORDER BY id").all()).toEqual([
    { children: "[10,26,12]" },
    { children: "[21,23]" },
  ]);
  expect(db.prepare("SELECT children FROM project_item WHERE id=10").get()).toEqual({
    children: "[21,23,25]",
  });
  expect(db.prepare("SELECT parents,projects FROM project_item WHERE id=21").get()).toEqual({
    parents: "[10]",
    projects: "[1,2]",
  });
  expect(db.prepare("SELECT parents,projects FROM project_item WHERE id=26").get()).toEqual({
    parents: "[]",
    projects: "[1]",
  });
  expect(db.prepare("SELECT id,ref_count FROM contents ORDER BY id").all()).toEqual([
    { id: 101, ref_count: 1 },
    { id: 102, ref_count: 2 },
    { id: 104, ref_count: 1 },
    { id: 105, ref_count: 1 },
  ]);
  expect(db.prepare("SELECT content FROM contents WHERE id=105").get()).toEqual({
    content: '[{"type":"audio","url":"saved.mp3"}]',
  });
  expect(db.prepare("SELECT messages FROM audio_note_chats").get()).toEqual({ messages: "[]" });
  expect(db.prepare("SELECT name FROM white_board_contents WHERE id=100").get()).toEqual({
    name: "保留白板",
  });
  for (const table of ["podcasts", "video_notes", "video_note_item", "transcriptions"]) {
    expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table)).toBeTruthy();
  }
}

describe("音频笔记旧库退役", () => {
  it("提升普通后代、释放专属正文，保留共享正文和通用音频；备份且幂等", () => {
    const dir = mkdtempSync(join(tmpdir(), "tau-audio-retire-"));
    const path = join(dir, "data.db");
    const db = new Database(path);
    try {
      db.exec(schema);
      db.exec(fixture);
      expect(retireFeatureTables(db, path)).toEqual([
        "audio_note_item",
        "audio_notes",
        "project_item.audio-note",
      ]);
      assertRetired(db);
      const backups = readdirSync(dir).filter(name =>
        name.includes(".pre-feature-table-retirement-v1-")
      );
      expect(backups).toHaveLength(1);
      const snapshot = new Database(join(dir, backups[0]), { readonly: true });
      try {
        expect(snapshot.prepare("SELECT id FROM audio_notes").get()).toEqual({ id: 1 });
        expect(snapshot.prepare("SELECT children FROM project WHERE id=1").get()).toEqual({
          children: "[10,11,12]",
        });
      } finally {
        snapshot.close();
      }
      expect(retireFeatureTables(db, path)).toEqual([]);
      assertRetired(db);
      expect(
        readdirSync(dir).filter(name => name.includes(".pre-feature-table-retirement-v1-"))
      ).toHaveLength(1);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("音频表已缺失时仍清理节点；音频环不吞掉普通后代", () => {
    const db = new Database(":memory:");
    try {
      db.exec(schema);
      db.exec(fixture);
      db.exec(
        "DROP TABLE audio_notes; DROP TABLE audio_note_item; UPDATE project_item SET children='[20,21]' WHERE id=22;"
      );
      expect(retireFeatureTables(db, ":memory:")).toEqual(["project_item.audio-note"]);
      expect(db.prepare("SELECT children FROM project_item WHERE id=10").get()).toEqual({
        children: "[21,23,25]",
      });
      expect(retireFeatureTables(db, ":memory:")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("正文清理失败时回滚删表与树改写，解除错误后可重试", () => {
    const db = new Database(":memory:");
    try {
      db.exec(schema);
      db.exec(fixture);
      db.exec(
        "CREATE TRIGGER fail_retirement BEFORE DELETE ON contents BEGIN SELECT RAISE(ABORT,'模拟清理失败'); END;"
      );
      expect(() => retireFeatureTables(db, ":memory:")).toThrow("模拟清理失败");
      expect(db.prepare("SELECT children FROM project WHERE id=1").get()).toEqual({
        children: "[10,11,12]",
      });
      expect(db.prepare("SELECT COUNT(*) AS n FROM audio_note_item").get()).toEqual({ n: 3 });
      expect(db.prepare("SELECT ref_count FROM contents WHERE id=100").get()).toEqual({
        ref_count: 1,
      });
      db.exec("DROP TRIGGER fail_retirement;");
      retireFeatureTables(db, ":memory:");
      assertRetired(db);
    } finally {
      db.close();
    }
  });

  it("独立索引清理可重试且不删除复用 ID 的新文档", () => {
    const db = new Database(":memory:");
    const index = new Database(":memory:");
    try {
      db.exec(schema);
      db.exec(fixture);
      retireFeatureTables(db, ":memory:");
      db.exec(
        "INSERT INTO project_item(id,create_time,update_time,title,children,parents,projects) VALUES(11,1,1,'新文档','[]','[]','[]');"
      );
      index.exec(
        "CREATE TABLE index_meta(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER); CREATE VIRTUAL TABLE content_fts USING fts5(prefixed_id,type,content); CREATE TABLE vec_documents(prefixed_id TEXT);"
      );
      for (const id of [10, 11, 20, 22, 24]) {
        index
          .prepare("INSERT INTO content_fts VALUES(?,'project-item','正文')")
          .run(`project-item:${id}`);
        index.prepare("INSERT INTO vec_documents VALUES(?)").run(`project-item:${id}`);
      }
      index.exec(
        "CREATE TRIGGER fail_index BEFORE DELETE ON vec_documents BEGIN SELECT RAISE(ABORT,'模拟索引失败'); END;"
      );
      expect(() => migrateKnowledgeIndex(db, index)).toThrow("模拟索引失败");
      expect(index.prepare("SELECT COUNT(*) AS n FROM content_fts").get()).toEqual({ n: 5 });
      index.exec("DROP TRIGGER fail_index;");
      migrateKnowledgeIndex(db, index);
      migrateKnowledgeIndex(db, index);
      for (const table of ["content_fts", "vec_documents"]) {
        expect(
          index.prepare(`SELECT prefixed_id FROM ${table} ORDER BY prefixed_id`).all()
        ).toEqual([{ prefixed_id: "project-item:10" }, { prefixed_id: "project-item:11" }]);
      }
    } finally {
      db.close();
      index.close();
    }
  });
});
