import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import { executeDatabaseCommand } from "../database-command";
import {
  hasLegacyQuestions,
  migrateQuestionsToPlugin,
  QUESTIONS_HOME_PANEL,
  QUESTIONS_PLUGIN_ID,
  QuestionMigrationTable,
} from "../question-plugin-migration";

/** 已从主库 schema 删除的旧问题表（迁移的输入；同步回来的旧库里仍有） */
const LEGACY_QUESTION_SQL = `
CREATE TABLE IF NOT EXISTS question_group (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        color TEXT,
        sort_index INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      );
CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL,
        question_content TEXT,
        answers TEXT DEFAULT '[]'
      , group_id INTEGER, sort_index INTEGER NOT NULL DEFAULT 0, resolved_time INTEGER, status TEXT NOT NULL DEFAULT 'not_started', description TEXT);
-- 问题的探究材料：多态关联（target_type = card | article | project_item | project | white_board | answer
-- | excerpt | pdf-annotation | web-clip；answer 的 target_id 为 contents.id，其余为各实体表主键，均为整数）。
-- content_id = 本关联持有引用计数的 contents.id（卡片 / 文章 / 项目文档 / 独立答案有值，项目、白板与外部材料为 NULL），
-- 目标实体被删后仍可据此释放引用。对话不在此表，见 question_chat。
CREATE TABLE IF NOT EXISTS question_link (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        content_id INTEGER,
        sort_index INTEGER NOT NULL DEFAULT 0,
        create_time INTEGER NOT NULL
      );
-- 问题的探究对话：session_id = chat_session.id（pi 会话 UUID）；message_ids 为 JSON 数组，记录问题从哪几条消息转来（可空）。
-- 弱引用：对话被删不级联，解析时降级；删除问题时一并删除。
CREATE TABLE IF NOT EXISTS question_chat (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        message_ids TEXT,
        create_time INTEGER NOT NULL
      );
-- 问题的探究轨迹：type = create | status | link | unlink | note，payload 为 JSON
CREATE TABLE IF NOT EXISTS question_event (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        create_time INTEGER NOT NULL
      );
CREATE INDEX IF NOT EXISTS idx_question_group_sort ON question_group(sort_index);
CREATE INDEX IF NOT EXISTS idx_question_group_default ON question_group(is_default);
CREATE INDEX IF NOT EXISTS idx_questions_group_id ON questions(group_id);
CREATE INDEX IF NOT EXISTS idx_questions_sort_index ON questions(sort_index);
CREATE INDEX IF NOT EXISTS idx_questions_create_time ON questions(create_time);
CREATE INDEX IF NOT EXISTS idx_questions_resolved_time ON questions(resolved_time);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_link_unique ON question_link(question_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_question_link_target ON question_link(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_chat_unique ON question_chat(question_id, session_id);
CREATE INDEX IF NOT EXISTS idx_question_chat_session ON question_chat(session_id);
CREATE INDEX IF NOT EXISTS idx_question_event_question ON question_event(question_id, create_time);
`;

const PARAGRAPH = (...texts: string[]) =>
  texts.map(text => ({ type: "paragraph", children: [{ text }] }));

let db: Database.Database;
const run = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);
const all = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as T[];
const get = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;

const content = (texts: string[], refCount = 1) =>
  Number(
    run(
      `INSERT INTO contents (content, count, ref_count, create_time, update_time) VALUES (?, 0, ?, 11, 12)`,
      JSON.stringify(PARAGRAPH(...texts)),
      refCount
    ).lastInsertRowid
  );
const refCount = (id: number) =>
  get<{ ref_count: number } | undefined>(`SELECT ref_count FROM contents WHERE id = ?`, id)
    ?.ref_count;

function seed() {
  // 卡片：问题关联额外持有一份引用
  const cardContent = content(["卡片"], 2);
  run(
    `INSERT INTO cards (id, create_time, update_time, content_id, tags) VALUES (7, 3, 3, ?, '[]')`,
    cardContent
  );
  // 独立答案：只靠问题关联撑着；另有一张卡片共用这份正文
  const answerContent = content(["", "B+ 树：因为扇出大", "第二段"], 2);
  run(
    `INSERT INTO cards (id, create_time, update_time, content_id, tags) VALUES (8, 4, 4, ?, '[]')`,
    answerContent
  );
  run(
    `INSERT INTO chat_session (id, scope, session_file, create_time, update_time) VALUES ('s1', 'main', 'f', 5, 5)`
  );
  run(
    `INSERT INTO home_panel_layout (panel_id, sort, hidden, update_time) VALUES ('questions', 3, 0, 1)`
  );
  run(
    `INSERT INTO publish_selections (content_type, content_id, update_time) VALUES ('quest', 10, 1), ('card', 7, 1)`
  );
  seedQuestions(cardContent, answerContent);
  return { cardContent, answerContent };
}

/** 旧问题表与谱系（同步回来的旧表只带这些） */
function seedQuestions(cardContent: number, answerContent: number) {
  run(
    `INSERT INTO question_group (id, title, color, sort_index, is_default, create_time, update_time)
     VALUES (1, '未分类', NULL, 0, 1, 1, 1), (2, '数据库', 'blue', 1, 0, 2, 2)`
  );
  run(
    `INSERT INTO questions (id, create_time, update_time, question_content, group_id, sort_index, resolved_time, status, description)
     VALUES (10, 100, 200, 'B+ 树为什么矮？', 2, 1024, NULL, 'in_progress', ?),
            (11, 110, 110, '没写背景', 1, 2048, 300, 'resolved', NULL)`,
    JSON.stringify(PARAGRAPH("在读索引那章"))
  );
  run(
    `INSERT INTO question_link (id, question_id, target_type, target_id, content_id, sort_index, create_time)
     VALUES (1, 10, 'card', 7, ?, 0, 150), (2, 10, 'answer', ?, ?, 0, 160), (3, 10, 'excerpt', 99, NULL, 1, 170)`,
    cardContent,
    answerContent,
    answerContent
  );
  run(
    `INSERT INTO question_chat (id, question_id, session_id, message_ids, create_time) VALUES (1, 10, 's1', '["m1"]', 180)`
  );
  run(
    `INSERT INTO question_event (id, question_id, type, payload, create_time) VALUES
       (1, 10, 'create', '{}', 100),
       (2, 10, 'link', '{"targetType":"card","targetId":7,"created":true,"title":"卡片"}', 150),
       (3, 10, 'status', '{"to":"in_progress","auto":true}', 150),
       (4, 10, 'link', ?, 160),
       (5, 10, 'link', '{"targetType":"chat-session","sessionId":"s1"}', 180),
       (6, 10, 'note', '{"text":"还没想通"}', 250)`,
    JSON.stringify({ targetType: "answer", targetId: answerContent })
  );
  run(
    `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time) VALUES
       ('question', '10', 'chat-session', 's1', 'discussed_in', 1),
       ('question', '10', 'vl-project', '4', 'upgraded_to', 1)`
  );
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SCHEMA_SQL);
  db.exec(LEGACY_QUESTION_SQL);
});
afterEach(() => db.close());

describe("migrateQuestionsToPlugin", () => {
  it("只有默认分组时不需要迁", () => {
    run(
      `INSERT INTO question_group (id, title, sort_index, is_default, create_time, update_time) VALUES (1, '未分类', 0, 1, 1, 1)`
    );
    expect(hasLegacyQuestions(db)).toBe(false);
    expect(migrateQuestionsToPlugin(db)).toBeNull();
  });

  it("问题、答案、分组、关联与轨迹写成插件数据，宿主引用改指插件，旧表删除", () => {
    const { cardContent, answerContent } = seed();
    const result = migrateQuestionsToPlugin(db, 999)!;
    expect(result).toEqual({ questions: 2, answers: 1, groups: 2, links: 5, events: 6 });

    const entities = all<{
      id: number;
      kind: string;
      key: string;
      title: string;
      content_id: number;
      meta: string;
    }>(
      `SELECT id, kind, key, title, content_id, meta FROM plugin_entities WHERE plugin_id = ? ORDER BY id`,
      QUESTIONS_PLUGIN_ID
    );
    const question = entities.find(e => e.key === "legacy-10")!;
    const answer = entities.find(e => e.kind === "answer")!;
    expect(JSON.parse(question.meta)).toEqual({
      status: "in_progress",
      groupId: "legacy-group-2",
      sortIndex: 1024,
      resolvedTime: null,
      activityAt: 250,
      composition: { card: 1, answer: 1, excerpt: 1, "chat-session": 1 },
    });
    expect(
      JSON.parse(
        get<{ content: string }>(`SELECT content FROM contents WHERE id = ?`, question.content_id)
          .content
      )
    ).toEqual(PARAGRAPH("在读索引那章"));
    expect(JSON.parse(entities.find(e => e.key === "legacy-11")!.meta)).toMatchObject({
      status: "resolved",
      resolvedTime: 300,
      groupId: "legacy-group-1",
    });
    expect(answer).toMatchObject({
      key: `legacy-${answerContent}`,
      title: "B+ 树：因为扇出大",
      content_id: answerContent,
    });
    expect(JSON.parse(answer.meta)).toEqual({
      questionId: String(question.id),
      projections: [{ kind: "card", id: "8" }],
    });

    const groups = all<{ id: string; data: string }>(
      `SELECT id, data FROM plugin_records WHERE collection = 'groups' ORDER BY id`
    );
    expect(groups.map(g => [g.id, JSON.parse(g.data)])).toEqual([
      ["legacy-group-1", { title: "未分类", tone: "gray", sortIndex: 0, isDefault: true }],
      ["legacy-group-2", { title: "数据库", tone: "blue", sortIndex: 1, isDefault: false }],
    ]);

    const links = all<{
      id: string;
      to_kind: string;
      to_id: string;
      role: string;
      data: string;
      to_created_at: number;
    }>(`SELECT id, to_kind, to_id, role, data, to_created_at FROM plugin_links ORDER BY id`);
    expect(links.map(l => [l.id, l.role, l.to_kind, l.to_id, JSON.parse(l.data)])).toEqual([
      ["legacy-chat-1", "chat", "chat-session", "s1", { messageIds: ["m1"], initiated: true }],
      ["legacy-link-1", "material", "card", "7", {}],
      ["legacy-link-2", "answer", "plugin-entity", String(answer.id), {}],
      ["legacy-link-3", "material", "material", "excerpt:99", {}],
      ["legacy-notebook-10", "notebook", "notebook", "4", {}],
    ]);
    // 已删除的材料照样迁入，按已删除显示；存在的目标登记为可见引用
    expect(links.find(l => l.id === "legacy-link-3")!.to_created_at).toBe(0);
    expect(
      all(
        `SELECT kind, ref_id FROM plugin_ref_grants WHERE plugin_id = ? ORDER BY kind`,
        QUESTIONS_PLUGIN_ID
      )
    ).toEqual([
      { kind: "card", ref_id: "7" },
      { kind: "chat-session", ref_id: "s1" },
      { kind: "plugin-entity", ref_id: String(answer.id) },
    ]);

    const events = all<{ data: string; create_time: number }>(
      `SELECT data, create_time FROM plugin_records WHERE collection = 'events' ORDER BY create_time, id`
    ).map(e => JSON.parse(e.data));
    expect(events.map(e => e.type)).toEqual(["create", "link", "status", "link", "link", "note"]);
    expect(events[1]).toEqual({
      questionId: String(question.id),
      type: "link",
      target: "card",
      ref: { kind: "card", id: "7" },
      created: true,
      title: "卡片",
    });
    expect(events[3].ref).toEqual({ kind: "plugin-entity", id: String(answer.id) });
    expect(events[4]).toMatchObject({
      target: "chat-session",
      ref: { kind: "chat-session", id: "s1" },
    });

    expect(all(`SELECT src_kind, src_id, relation FROM entity_lineage ORDER BY relation`)).toEqual([
      { src_kind: "plugin-entity", src_id: String(question.id), relation: "discussed_in" },
      { src_kind: "plugin-entity", src_id: String(question.id), relation: "upgraded_to" },
    ]);
    expect(all(`SELECT panel_id, sort FROM home_panel_layout`)).toEqual([
      { panel_id: QUESTIONS_HOME_PANEL, sort: 3 },
    ]);
    expect(all(`SELECT content_type FROM publish_selections`)).toEqual([{ content_type: "card" }]);

    // 材料的引用计数不动；答案的引用转给实体
    expect(refCount(cardContent)).toBe(2);
    expect(refCount(answerContent)).toBe(2);
    expect(
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'questions'`).n
    ).toBe(0);
  });

  it("插件启用时已建的默认分组沿用；旧表随同步回来时再迁不会重复", () => {
    run(
      `INSERT INTO plugin_records (id, plugin_id, collection, data, create_time, update_time)
       VALUES ('r-default', ?, 'groups', '{"title":"未分类","tone":"gray","sortIndex":1024,"isDefault":true}', 1, 1)`,
      QUESTIONS_PLUGIN_ID
    );
    const ids = seed();
    migrateQuestionsToPlugin(db);
    const second = all<{ meta: string }>(
      `SELECT meta FROM plugin_entities WHERE key = 'legacy-11'`
    );
    expect(JSON.parse(second[0].meta).groupId).toBe("r-default");
    expect(
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM plugin_records WHERE id = 'legacy-group-1'`).n
    ).toBe(0);

    db.exec(LEGACY_QUESTION_SQL);
    seedQuestions(ids.cardContent, ids.answerContent);
    const again = migrateQuestionsToPlugin(db)!;
    expect(again).toMatchObject({ questions: 0, answers: 0, groups: 0, events: 0 });
    expect(get<{ n: number }>(`SELECT COUNT(*) AS n FROM plugin_entities`).n).toBe(3);
  });

  it("没调整过首页时按原默认顺序写下布局，插件面板留在原位置", () => {
    seed();
    run(`DELETE FROM home_panel_layout`);
    migrateQuestionsToPlugin(db);
    expect(
      all<{ panel_id: string }>(`SELECT panel_id FROM home_panel_layout ORDER BY sort`).map(
        row => row.panel_id
      )
    ).toEqual([
      "review",
      "todos",
      "schedule",
      "insights",
      "recent-edits",
      QUESTIONS_HOME_PANEL,
      "walk",
      "retro",
    ]);
  });

  it("关联没加过保活引用的材料不被删除，协作中的正文也能迁", () => {
    seed();
    // 旧关联只在部分路径上加引用：这篇文章只有自己那一份，且正在协作
    const shared = content(["正在协作的文章"], 1);
    run(
      `INSERT INTO articles (id, create_time, update_time, title, author, tags, links, content_id) VALUES (81, 6, 6, '协作', '', '[]', '[]', ?)`,
      shared
    );
    run(
      `INSERT INTO collaboration_bindings (content_id, content_created_at, server_url, document_id) VALUES (?, 11, 'wss://x', 'd')`,
      shared
    );
    run(
      `INSERT INTO question_link (question_id, target_type, target_id, content_id, sort_index, create_time) VALUES (10, 'article', 81, ?, 4096, 9)`,
      shared
    );
    expect(migrateQuestionsToPlugin(db)).toMatchObject({ questions: 2 });
    expect(refCount(shared)).toBe(1);
  });

  it("中途失败整体回滚，旧表原样保留", () => {
    seed();
    run(`DROP TABLE plugin_links`);
    expect(() => migrateQuestionsToPlugin(db)).toThrow();
    expect(get<{ n: number }>(`SELECT COUNT(*) AS n FROM questions`).n).toBe(2);
    expect(get<{ n: number }>(`SELECT COUNT(*) AS n FROM plugin_entities`).n).toBe(0);
  });

  it("经数据库命令执行（与 IPC 同一路径）时，动手前在库旁留一份含旧表的快照", async () => {
    const dir = mkdtempSync(join(tmpdir(), "question-migration-"));
    try {
      db.close();
      db = new Database(join(dir, "data.db"));
      db.exec(MAIN_SCHEMA_SQL);
      db.exec(LEGACY_QUESTION_SQL);
      seed();
      const handler = QuestionMigrationTable.getListenEvents()["question-migration:run"];
      const result = await executeDatabaseCommand(db, handler, db, { databaseName: "data.db" });
      expect(result).toMatchObject({ questions: 2 });
      const backups = readdirSync(dir).filter(name =>
        /^data\.db\.pre-question-plugin-migration-v1-[\w-]+\.bak$/.test(name)
      );
      expect(backups).toHaveLength(1);
      const snapshot = new Database(join(dir, backups[0]), { readonly: true });
      expect(snapshot.prepare(`SELECT COUNT(*) AS n FROM questions`).get()).toEqual({ n: 2 });
      snapshot.close();
      expect(
        get<{ n: number }>(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'questions'`).n
      ).toBe(0);
    } finally {
      db.close();
      db = new Database(":memory:");
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
