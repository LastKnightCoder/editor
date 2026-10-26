import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import EntitySearchTable from "../tables/entity-search";
import PluginRefsTable from "../tables/plugin-refs";
import EntityLineageTable from "../tables/entity-lineage";
import { notebookSourceOf } from "../entity-context/context-lineage";

const scope = { databaseName: ":memory:" };

describe("插件关联：待办与日程候选、引用存在性", () => {
  let db: Database.Database;
  const insert = (sql: string, ...params: unknown[]) =>
    Number(db.prepare(sql).run(...params).lastInsertRowid);

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("检索独立待办与用户日历的日程，系统分组不出现", () => {
    const group = insert(
      "INSERT INTO todo_group (title, create_time, update_time) VALUES ('工作', 1, 1)"
    );
    const system = insert(
      "INSERT INTO todo_group (title, create_time, update_time, is_system) VALUES ('系统', 1, 1, 1)"
    );
    const todo = insert(
      "INSERT INTO todo_item (group_id, title, create_time, update_time, due_at) VALUES (?, '交周报', 100, 100, ?)",
      group,
      new Date(2026, 9, 23).getTime()
    );
    insert(
      "INSERT INTO todo_item (group_id, title, create_time, update_time) VALUES (?, '交周报（系统）', 1, 1)",
      system
    );
    const userGroup = insert(
      "INSERT INTO calendar_group (name, create_time, update_time) VALUES ('我的', 1, 1)"
    );
    const systemGroup = insert(
      "INSERT INTO calendar_group (name, is_system, create_time, update_time) VALUES ('系统', 1, 1, 1)"
    );
    const calendar = insert(
      "INSERT INTO calendar (title, color, create_time, update_time, group_id) VALUES ('日常', 'blue', 1, 1, ?)",
      userGroup
    );
    const marker = insert(
      "INSERT INTO calendar (title, color, create_time, update_time, group_id) VALUES ('截止', 'red', 1, 1, ?)",
      systemGroup
    );
    const event = insert(
      "INSERT INTO calendar_event (calendar_id, title, create_time, update_time, start_date) VALUES (?, '周会', 200, 200, ?)",
      calendar,
      new Date(2026, 9, 21).getTime()
    );
    insert(
      "INSERT INTO calendar_event (calendar_id, title, create_time, update_time, start_date) VALUES (?, '周会截止', 1, 1, 1)",
      marker
    );

    const todos = EntitySearchTable.search(db, { kind: "todo", keyword: "周报" });
    expect(todos).toEqual([
      expect.objectContaining({
        id: todo,
        createdAt: 100,
        title: "交周报",
        meta: "工作 · 截止 10月23日",
      }),
    ]);
    const events = EntitySearchTable.search(db, { kind: "calendar-event", keyword: "周会" });
    expect(events).toEqual([
      expect.objectContaining({ id: event, createdAt: 200, meta: "日常 · 10月21日" }),
    ]);

    expect(PluginRefsTable.exists(db, { ...scope, kind: "todo", id: `todo:${todo}:100` })).toBe(
      true
    );
    expect(PluginRefsTable.exists(db, { ...scope, kind: "todo", id: `todo:${todo}:99` })).toBe(
      false
    );
    expect(
      PluginRefsTable.exists(db, { ...scope, kind: "event", id: `${event}:200@2026-10-21` })
    ).toBe(true);
  });

  it("文章在回收站、ID 非法或类型未知时视为不存在", () => {
    const article = insert(
      "INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete) VALUES (1, 1, '文', '', '[]', '[]', 0, 1)"
    );
    expect(PluginRefsTable.exists(db, { ...scope, kind: "article", id: String(article) })).toBe(
      false
    );
    expect(PluginRefsTable.exists(db, { ...scope, kind: "card", id: "1 OR 1=1" })).toBe(false);
    expect(PluginRefsTable.exists(db, { ...scope, kind: "unknown", id: "1" })).toBe(false);
  });

  it("新类型的存在判断：项目、Notebook、材料、对话与插件内容", () => {
    const project = insert(
      "INSERT INTO project (title, \"desc\", children, create_time, update_time) VALUES ('课题', '[]', '[]', 1, 1)"
    );
    const notebook = insert(
      "INSERT INTO vibe_learning_project (title, create_time, update_time) VALUES ('本子', 1, 1)"
    );
    db.prepare(
      "INSERT INTO chat_session (id, scope, session_file, cwd, title, create_time, update_time) VALUES ('s1', 'main-chat', 'f', '', '聊聊', 1, 1)"
    ).run();
    const exists = (kind: string, id: string) => PluginRefsTable.exists(db, { ...scope, kind, id });
    expect(exists("project", String(project))).toBe(true);
    expect(exists("notebook", String(notebook))).toBe(true);
    expect(exists("chat-session", "s1")).toBe(true);
    expect(exists("chat-session", "s2")).toBe(false);
    expect(exists("material", "excerpt:1")).toBe(false);
    const excerpt = (deleted: number) =>
      insert(
        `INSERT INTO excerpt (source_type, source_key, external_id, quote, create_time, update_time, is_deleted)
         VALUES ('web', 'k', ?, '句子', 1, 1, ?)`,
        `e${deleted}`,
        deleted
      );
    expect(exists("material", `excerpt:${excerpt(0)}`)).toBe(true);
    // 软删除的划线视为不存在
    expect(exists("material", `excerpt:${excerpt(1)}`)).toBe(false);
    expect(exists("material", "cards:1")).toBe(false);
    expect(exists("plugin-entity", "1")).toBe(false);
    // 选择窗口可检索 Notebook
    expect(EntitySearchTable.search(db, { kind: "notebook", keyword: "本" })).toEqual([
      expect.objectContaining({ kind: "notebook", id: notebook, title: "本子" }),
    ]);
  });

  it("describe：已获准的类型与选择过的引用给出标题，其余不透露是否存在", () => {
    const pluginId = "tau.questions";
    const project = insert(
      "INSERT INTO project (title, \"desc\", children, create_time, update_time) VALUES ('课题', '[]', '[]', 10, 10)"
    );
    const other = insert(
      "INSERT INTO project (title, \"desc\", children, create_time, update_time) VALUES ('别的', '[]', '[]', 11, 11)"
    );
    db.prepare(
      "INSERT INTO chat_session (id, scope, session_file, cwd, title, create_time, update_time) VALUES ('s1', 'pdf-chat', 'f', '', '读论文', 5, 5)"
    ).run();
    const describe = (refs: { kind: string; id: string }[], readable: string[] = []) =>
      PluginRefsTable.describe(db, { ...scope, pluginId, refs, readable });

    expect(describe([{ kind: "project", id: String(project) }])).toEqual([{ status: "denied" }]);
    // 不存在的引用在未获准时同样是 denied
    expect(describe([{ kind: "project", id: "999" }])).toEqual([{ status: "denied" }]);
    expect(describe([{ kind: "project", id: "999" }], ["project"])).toEqual([
      { status: "missing" },
    ]);
    expect(
      PluginRefsTable.grant(db, {
        ...scope,
        pluginId,
        refs: [
          { kind: "project", id: String(project) },
          { kind: "chat-session", id: "s1" },
          { kind: "project", id: "999" },
        ],
      })
    ).toBe(2);
    expect(
      describe([
        { kind: "project", id: String(project) },
        { kind: "chat-session", id: "s1" },
        { kind: "project", id: String(other) },
      ])
    ).toEqual([
      { status: "ok", title: "课题" },
      { status: "ok", title: "读论文" },
      { status: "denied" },
    ]);
    // 授权只属于选择它的插件
    expect(
      PluginRefsTable.describe(db, {
        ...scope,
        pluginId: "other",
        refs: [{ kind: "project", id: String(project) }],
        readable: [],
      })
    ).toEqual([{ status: "denied" }]);

    // 删除后编号被新内容复用：授权不落到新内容上
    db.prepare("DELETE FROM project WHERE id = ?").run(project);
    expect(describe([{ kind: "project", id: String(project) }])).toEqual([{ status: "missing" }]);
    db.prepare(
      "INSERT INTO project (id, title, \"desc\", children, create_time, update_time) VALUES (?, '新课题', '[]', '[]', 20, 20)"
    ).run(project);
    expect(describe([{ kind: "project", id: String(project) }])).toEqual([{ status: "missing" }]);
    expect(describe([{ kind: "project", id: String(project) }], ["project"])).toEqual([
      { status: "ok", title: "新课题" },
    ]);

    expect(PluginRefsTable.clear(db, { ...scope, pluginId })).toBe(2);
    expect(describe([{ kind: "chat-session", id: "s1" }])).toEqual([{ status: "denied" }]);
    expect(() => describe(Array.from({ length: 201 }, () => ({ kind: "card", id: "1" })))).toThrow(
      "引用列表无效"
    );
  });

  it("describe：本插件自己的内容不需要授权，其他插件的内容需要经选择", () => {
    const content = insert(
      "INSERT INTO contents (id, create_time, update_time, content, count, ref_count) VALUES (1, 1, 1, '[]', 0, 1)"
    );
    const mine = insert(
      "INSERT INTO plugin_entities (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time) VALUES (1, 'mine', 'note', 'a', '我的周记', ?, '{}', 1, 1)",
      content
    );
    const theirs = insert(
      "INSERT INTO plugin_entities (id, plugin_id, kind, key, title, content_id, meta, create_time, update_time) VALUES (2, 'theirs', 'note', 'a', '别人的', ?, '{}', 1, 1)",
      content
    );
    expect(
      PluginRefsTable.describe(db, {
        ...scope,
        pluginId: "mine",
        refs: [
          { kind: "plugin-entity", id: String(mine) },
          { kind: "plugin-entity", id: String(theirs) },
        ],
        readable: [],
      })
    ).toEqual([{ status: "ok", title: "我的周记" }, { status: "denied" }]);
  });

  it("Notebook 资料计划：有正文的内容成为笔记，划线合并、剪藏各一份，其余与已删除的跳过", () => {
    const contentId = insert(
      "INSERT INTO contents (create_time, update_time, content, count) VALUES (1, 1, '[]', 0)"
    );
    const card = insert(
      "INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (1, 1, '[]', ?)",
      contentId
    );
    const entity = insert(
      `INSERT INTO plugin_entities (plugin_id, kind, key, title, content_id, meta, create_time, update_time)
       VALUES ('qa', 'question', 'q1', '为什么', ?, '{}', 1, 1)`,
      contentId
    );
    const excerpt = insert(
      `INSERT INTO excerpt (source_type, source_key, external_id, quote, create_time, update_time)
       VALUES ('web', 'k', 'e1', '句子', 1, 1)`
    );
    const clip = insert(
      "INSERT INTO web_clip (create_time, update_time, content_id, url, title) VALUES (1, 1, ?, 'https://a.example', '网页')",
      contentId
    );
    const project = insert(
      "INSERT INTO project (title, \"desc\", children, create_time, update_time) VALUES ('课题', '[]', '[]', 1, 1)"
    );
    const plan = PluginRefsTable.notebookPlan(db, {
      ...scope,
      refs: [
        { kind: "card", id: String(card) },
        { kind: "card", id: String(card) },
        { kind: "plugin-entity", id: String(entity) },
        { kind: "material", id: `excerpt:${excerpt}` },
        { kind: "material", id: `web-clip:${clip}` },
        { kind: "project", id: String(project) },
        { kind: "card", id: "999" },
        { kind: "material", id: "excerpt:999" },
      ],
    });
    expect(plan).toEqual({
      notes: [
        { contentId, title: expect.any(String), noteType: "card", originalId: card },
        { contentId, title: "为什么", noteType: "plugin-entity", originalId: entity },
      ],
      excerpts: [{ kind: "excerpt", id: excerpt }],
      clips: [{ ref: { kind: "web-clip", id: clip }, title: "网页" }],
      skipped: 3,
    });
  });

  it("Notebook 来源行：任意谱系来源按通用解析显示，来源删除后不再显示", () => {
    const entity = insert(
      `INSERT INTO plugin_entities (plugin_id, kind, key, title, content_id, meta, create_time, update_time)
       VALUES ('qa', 'question', 'q1', '为什么', 0, '{}', 1, 1)`
    );
    const notebook = insert(
      "INSERT INTO vibe_learning_project (title, create_time, update_time) VALUES ('本子', 1, 1)"
    );
    expect(notebookSourceOf(db, notebook)).toBeNull();
    EntityLineageTable.record(db, {
      src: { kind: "plugin-entity", id: entity },
      dst: { kind: "vl-project", id: notebook },
      relation: "upgraded_to",
    });
    expect(notebookSourceOf(db, notebook)).toMatchObject({
      node: { kind: "plugin-entity", id: entity },
      title: "为什么",
      missing: false,
      open: { page: "entity", ref: { kind: "plugin-entity", id: entity } },
    });
    db.prepare("DELETE FROM plugin_entities WHERE id = ?").run(entity);
    expect(notebookSourceOf(db, notebook)).toBeNull();
  });
});
