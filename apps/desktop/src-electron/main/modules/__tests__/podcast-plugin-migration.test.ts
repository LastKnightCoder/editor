import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import {
  hasLegacyPodcasts,
  migratePodcastsToPlugin,
  PodcastMigrationTable,
  PODCAST_PLUGIN_ID,
} from "../podcast-plugin-migration";

/** 已从主库 schema 删除的播客表与列（迁移的输入；已有资料库里仍有） */
const LEGACY_PODCASTS = `
CREATE TABLE IF NOT EXISTS podcasts (
  id INTEGER PRIMARY KEY, create_time INTEGER NOT NULL, update_time INTEGER NOT NULL,
  audio_url TEXT NOT NULL, script TEXT, duration INTEGER, speakers TEXT NOT NULL,
  ref_count INTEGER DEFAULT 0, name TEXT, script_lines TEXT);
`;
const LEGACY_COLUMNS = `${LEGACY_PODCASTS}
ALTER TABLE vl_note ADD COLUMN podcast_id INTEGER DEFAULT NULL;
ALTER TABLE cards ADD COLUMN podcast_id INTEGER DEFAULT NULL;
ALTER TABLE articles ADD COLUMN podcast_id INTEGER DEFAULT NULL;
ALTER TABLE project_item ADD COLUMN podcast_id INTEGER DEFAULT NULL;
`;

const SPEAKERS = JSON.stringify([
  { name: "林舟", voiceId: "male", voiceName: "温润男声", role: "主持人" },
  { name: "夏禾", voiceId: "female", voiceName: "明亮女声", role: "嘉宾" },
]);
const LINES = JSON.stringify([
  { speaker: "林舟", text: "今天聊 KV Cache。", voiceId: "male", startTime: 0, duration: 3 },
  { speaker: "夏禾", text: "我以为它就是普通缓存。", voiceId: "female", startTime: 3, duration: 4 },
]);

let db: Database.Database;

function addPodcast(id: number, name: string | null) {
  db.prepare(
    `INSERT INTO podcasts (id, create_time, update_time, audio_url, script, duration, speakers, ref_count, name, script_lines)
     VALUES (?, 100, 200, ?, '', 7, ?, 1, ?, ?)`
  ).run(id, `~/.editor/resources/p${id}.mp3`, SPEAKERS, name, LINES);
}

const tableExists = (name: string) =>
  Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

const entities = () =>
  db
    .prepare(
      `SELECT id, kind, key, title, content_id, meta FROM plugin_entities WHERE plugin_id = ? ORDER BY key`
    )
    .all(PODCAST_PLUGIN_ID) as {
    id: number;
    key: string;
    title: string;
    content_id: number;
    meta: string;
  }[];

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  db.exec(LEGACY_COLUMNS);
  db.exec(`
    INSERT INTO contents (id, create_time, update_time, content) VALUES (1, 1, 1, '[]'), (2, 1, 1, '[]'), (3, 1, 1, '[]');
    INSERT INTO cards (id, create_time, update_time, tags, content_id) VALUES (10, 50, 50, '[]', 1);
    INSERT INTO articles (id, title, create_time, update_time, tags, content_id) VALUES (20, '大模型推理优化笔记', 60, 60, '[]', 2);
    INSERT INTO project_item (id, create_time, update_time, title, content_id) VALUES (30, 70, 70, '第 3 章', 3);
  `);
});
afterEach(() => db.close());

describe("原文播客迁入插件", () => {
  it("没有播客数据时不迁；只剩残留的 podcasts 表时把它删掉", () => {
    expect(PodcastMigrationTable.pending(db, { databaseName: ":memory:" })).toEqual({
      pending: true,
      requiresPlugin: false,
    });
    db.exec("DROP TABLE podcasts");
    expect(PodcastMigrationTable.pending(db, { databaseName: ":memory:" })).toEqual({
      pending: false,
      requiresPlugin: false,
    });
    expect(hasLegacyPodcasts(db)).toBe(false);
    expect(migratePodcastsToPlugin(db)).toBeNull();
    db.exec(LEGACY_PODCASTS);
    addPodcast(1, "无主播客");
    expect(migratePodcastsToPlugin(db)).toEqual({ episodes: 0, skipped: 0, notebook: 0 });
    expect(tableExists("podcasts")).toBe(false);
  });

  it("每个原文写成一期：meta 与插件一致，建关联与引用登记，清空旧指针，删掉没人用的旧播客", () => {
    addPodcast(1, "KV Cache 为什么快");
    addPodcast(2, null);
    addPodcast(3, "Raft");
    db.exec(`UPDATE cards SET podcast_id = 1 WHERE id = 10;
             UPDATE articles SET podcast_id = 2 WHERE id = 20;
             UPDATE project_item SET podcast_id = 3 WHERE id = 30;`);
    expect(hasLegacyPodcasts(db)).toBe(true);
    expect(PodcastMigrationTable.pending(db, { databaseName: ":memory:" })).toEqual({
      pending: true,
      requiresPlugin: true,
    });

    expect(migratePodcastsToPlugin(db, 999)).toEqual({ episodes: 3, skipped: 0, notebook: 0 });

    const rows = entities();
    expect(rows.map(r => [r.key, r.title])).toEqual([
      ["article:20", "大模型推理优化笔记"],
      ["card:10", "KV Cache 为什么快"],
      ["document:30", "Raft"],
    ]);
    const meta = JSON.parse(rows[1].meta);
    expect(meta).toMatchObject({
      source: { kind: "card", id: "10" },
      sourceKind: "card",
      status: "ready",
      options: { format: "duo", minutes: 3 },
      audio: {
        url: "~/.editor/resources/p1.mp3",
        duration: 7,
        speakers: [
          { name: "林舟", voiceId: "male", tone: 2 },
          { name: "夏禾", voiceId: "female", tone: 5 },
        ],
        lines: [
          { speaker: 0, text: "今天聊 KV Cache。", start: 0, duration: 3 },
          { speaker: 1, text: "我以为它就是普通缓存。", start: 3, duration: 4 },
        ],
      },
      draft: null,
    });
    const body = JSON.parse(
      (
        db.prepare(`SELECT content FROM contents WHERE id = ?`).get(rows[1].content_id) as {
          content: string;
        }
      ).content
    );
    expect(body[0].children).toEqual([
      { text: "林舟", bold: true },
      { text: "：今天聊 KV Cache。" },
    ]);

    const links = db
      .prepare(
        `SELECT from_id, to_kind, to_id, to_created_at, role FROM plugin_links WHERE plugin_id = ? ORDER BY to_kind`
      )
      .all(PODCAST_PLUGIN_ID);
    expect(links).toEqual([
      { from_id: rows[0].id, to_kind: "article", to_id: "20", to_created_at: 60, role: "source" },
      { from_id: rows[1].id, to_kind: "card", to_id: "10", to_created_at: 50, role: "source" },
      { from_id: rows[2].id, to_kind: "document", to_id: "30", to_created_at: 70, role: "source" },
    ]);
    expect(
      db
        .prepare(`SELECT kind, ref_id FROM plugin_ref_grants WHERE plugin_id = ? ORDER BY kind`)
        .all(PODCAST_PLUGIN_ID)
    ).toEqual([
      { kind: "article", ref_id: "20" },
      { kind: "card", ref_id: "10" },
      { kind: "document", ref_id: "30" },
    ]);
    expect(db.prepare(`SELECT podcast_id FROM cards WHERE id = 10`).get()).toEqual({
      podcast_id: null,
    });
    expect(tableExists("podcasts")).toBe(false);
    expect(hasLegacyPodcasts(db)).toBe(false);
  });

  it("Notebook 的播客笔记写成一期并挂到 Notebook，笔记与正文删除；没生成完的笔记直接删", () => {
    addPodcast(5, "Raft 选主");
    db.exec(`
      INSERT INTO vibe_learning_project (id, create_time, update_time, title) VALUES (9, 90, 90, '分布式');
      INSERT INTO contents (id, create_time, update_time, content, ref_count) VALUES (40, 1, 1, '[]', 1), (41, 1, 1, '[]', 1);
      INSERT INTO vl_note (id, create_time, update_time, project_id, content_id, title, type, podcast_id)
        VALUES (70, 1, 1, 9, 40, '旧标题', 'podcast', 5), (71, 1, 1, 9, 41, '没生成完', 'podcast', NULL);`);
    expect(hasLegacyPodcasts(db)).toBe(true);

    expect(migratePodcastsToPlugin(db, 999)).toEqual({ episodes: 0, skipped: 0, notebook: 1 });

    const [row] = entities();
    expect(row).toMatchObject({ key: "notebook:9:legacy-70", title: "Raft 选主" });
    expect(JSON.parse(row.meta)).toMatchObject({
      source: { kind: "notebook", id: "9" },
      sourceKind: "notebook",
      sourceTitle: "分布式",
      status: "ready",
    });
    expect(
      db
        .prepare(`SELECT to_kind, to_id, to_created_at, role FROM plugin_links WHERE from_id = ?`)
        .get(row.id)
    ).toEqual({ to_kind: "notebook", to_id: "9", to_created_at: 90, role: "output" });
    expect(db.prepare(`SELECT kind, ref_id FROM plugin_ref_grants`).all()).toEqual([
      { kind: "notebook", ref_id: "9" },
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM vl_note`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM contents WHERE id IN (40, 41)`).get()).toEqual({
      n: 0,
    });
    expect(hasLegacyPodcasts(db)).toBe(false);
  });

  it("旧端同步回来再挂上时只清旧指针，不重复写入", () => {
    addPodcast(1, "KV Cache");
    db.exec(`UPDATE cards SET podcast_id = 1 WHERE id = 10;`);
    migratePodcastsToPlugin(db);
    db.exec(LEGACY_PODCASTS);
    addPodcast(2, "又生成了一期");
    db.exec(`UPDATE cards SET podcast_id = 2 WHERE id = 10;`);

    expect(migratePodcastsToPlugin(db)).toEqual({ episodes: 0, skipped: 1, notebook: 0 });
    expect(entities()).toHaveLength(1);
    expect(db.prepare(`SELECT podcast_id FROM cards WHERE id = 10`).get()).toEqual({
      podcast_id: null,
    });
  });

  it("中途失败整体回滚，旧指针原样保留", () => {
    addPodcast(1, "KV Cache");
    addPodcast(2, "第二期");
    db.exec(`UPDATE cards SET podcast_id = 1 WHERE id = 10;
             UPDATE articles SET podcast_id = 2 WHERE id = 20;`);
    db.exec(`CREATE TRIGGER fail_second AFTER INSERT ON plugin_entities
             WHEN (SELECT COUNT(*) FROM plugin_entities) > 1 BEGIN SELECT RAISE(ABORT, 'boom'); END;`);

    expect(() => migratePodcastsToPlugin(db)).toThrow(/boom/);
    expect(entities()).toHaveLength(0);
    expect(db.prepare(`SELECT podcast_id FROM cards WHERE id = 10`).get()).toEqual({
      podcast_id: 1,
    });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM podcasts`).get()).toEqual({ n: 2 });
  });
});
