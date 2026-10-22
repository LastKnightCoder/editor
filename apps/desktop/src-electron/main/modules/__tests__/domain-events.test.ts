import Database from "better-sqlite3";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  connected: [] as Array<(dbName: string, reason: string) => void>,
  db: undefined as unknown,
  send: vi.fn(),
}));
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: hoisted.send } }],
  },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("electron-log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../database", () => ({
  default: {
    onDatabaseConnected: (callback: (dbName: string, reason: string) => void) =>
      hoisted.connected.push(callback),
    getDatabase: () => hoisted.db,
  },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import { broadcastDatabaseChange } from "../database-notifications";
import domainEvents from "../domain-events";
import { markContentOrigin, writeAsPlugin } from "../domain-event-origin";
import PluginEntityTable from "../tables/plugin-entity";
import PluginRecordTable from "../tables/plugin-records";

const doc = (text: string) =>
  [{ type: "paragraph", children: [{ type: "formatted", text }] }] as never;

describe("业务数据变更事件", () => {
  let db: Database.Database;
  const events = () =>
    hoisted.send.mock.calls
      .filter(([channel]) => channel === "domain-events")
      .flatMap(([, message]) =>
        message.events.map(({ type, id }: { type: string; id?: number }) => ({ type, id }))
      );
  const origins = () =>
    hoisted.send.mock.calls
      .filter(([channel]) => channel === "domain-events")
      .flatMap(([, message]) =>
        message.events.map((event: { pluginId?: string }) => event.pluginId ?? "app")
      );
  const card = (contentId: number) =>
    Number(
      db
        .prepare(
          "INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)"
        )
        .run(contentId).lastInsertRowid
    );

  beforeAll(() => domainEvents.init());
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.send.mockClear();
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    hoisted.db = db;
    for (const callback of hoisted.connected) callback("alpha.db", "connect");
  });
  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it("合并窗口内的增改为一次新建；正文修改计入所属卡片", async () => {
    const contentId = ContentTable.createContent(db, { content: doc("甲") });
    const id = card(contentId);
    db.prepare("UPDATE cards SET is_top = 1 WHERE id = ?").run(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "card.created", id }]);

    hoisted.send.mockClear();
    db.prepare("UPDATE contents SET content = '[]' WHERE id = ?").run(contentId);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "card.updated", id }]);
    expect(hoisted.send.mock.calls[0][1].databaseName).toBe("alpha.db");
  });

  it("先建后删不产生事件；文章软删按删除处理", async () => {
    const id = card(0);
    db.prepare("DELETE FROM cards WHERE id = ?").run(id);
    const article = Number(
      db
        .prepare(
          "INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id) VALUES (1, 1, '文', '', '[]', '[]', 0)"
        )
        .run().lastInsertRowid
    );
    await vi.advanceTimersByTimeAsync(600);
    hoisted.send.mockClear();
    db.prepare("UPDATE articles SET is_delete = 1 WHERE id = ?").run(article);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "article.deleted", id: article }]);
  });

  it("引用型项目条目不作为项目文档；待办与日程给出集合级变化", async () => {
    db.prepare(
      `INSERT INTO project_item (create_time, update_time, title, children, parents, projects, ref_type, ref_id)
       VALUES (1, 1, '引用', '[]', '[]', '[]', 'card', 1)`
    ).run();
    broadcastDatabaseChange("schedule:changed", "alpha.db");
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "todos.changed" }, { type: "calendar.changed" }]);
  });

  it("白板、项目、Notebook、材料、对话逐条给出变化；资料增删计入 Notebook", async () => {
    const run = (sql: string, ...params: unknown[]) =>
      Number(db.prepare(sql).run(...params).lastInsertRowid);
    const board = run(
      "INSERT INTO white_boards (create_time, update_time, tags, title, description, snapshot) VALUES (1, 1, '[]', '板', '', '')"
    );
    const project = run(
      "INSERT INTO project (create_time, update_time, title, desc, children) VALUES (1, 1, '项', '', '[]')"
    );
    const notebook = run(
      "INSERT INTO vibe_learning_project (create_time, update_time, title) VALUES (1, 1, '本')"
    );
    const excerpt = run(
      "INSERT INTO excerpt (source_type, source_key, external_id, quote, create_time, update_time) VALUES ('web', 'k', 'e', '原文', 1, 1)"
    );
    run(
      "INSERT INTO chat_session (id, scope, session_file, create_time, update_time) VALUES ('c1', 'main-chat', 'f', 1, 1), ('c2', 'internal', 'f', 1, 1)"
    );
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([
      { type: "whiteboard.created", id: board },
      { type: "project.created", id: project },
      { type: "notebook.created", id: notebook },
      { type: "material.created", id: `excerpt:${excerpt}` },
      { type: "chat.created", id: "c1" },
    ]);

    hoisted.send.mockClear();
    run(
      "INSERT INTO vibe_learning_resources (project_id, create_time, update_time, name, original_path, resource_type) VALUES (?, 1, 1, '资料', '/a', 'pdf')",
      notebook
    );
    db.prepare("UPDATE excerpt SET is_deleted = 1 WHERE id = ?").run(excerpt);
    db.prepare("UPDATE chat_session SET message_count = 2 WHERE id = 'c1'").run();
    // 打开项目、切换白板当前页只是查看状态
    db.prepare("UPDATE project SET last_open_time = 9 WHERE id = ?").run(project);
    db.prepare("UPDATE white_boards SET active_white_board_content_id = 3 WHERE id = ?").run(board);
    db.prepare("DELETE FROM white_boards WHERE id = ?").run(board);
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([
      { type: "notebook.updated", id: notebook },
      { type: "material.deleted", id: `excerpt:${excerpt}` },
      { type: "chat.updated", id: "c1" },
      { type: "whiteboard.deleted", id: board },
    ]);
  });

  it("插件实体的事件带所属插件与类型；正文修改计入实体，孤儿按删除处理", async () => {
    const contentId = ContentTable.createContent(db, { content: doc("甲") });
    const id = Number(
      db
        .prepare(
          "INSERT INTO plugin_entities (plugin_id, kind, key, content_id, create_time, update_time) VALUES ('weekly', 'week', 'w1', ?, 1, 1)"
        )
        .run(contentId).lastInsertRowid
    );
    const entityEvents = () =>
      hoisted.send.mock.calls.flatMap(([, message]) =>
        message.events.map(({ type, id, owner, kind }: Record<string, unknown>) => ({
          type,
          id,
          owner,
          kind,
        }))
      );
    await vi.advanceTimersByTimeAsync(600);
    expect(entityEvents()).toEqual([{ type: "entity.created", id, owner: "weekly", kind: "week" }]);

    hoisted.send.mockClear();
    db.prepare("UPDATE contents SET content = '[]' WHERE id = ?").run(contentId);
    await vi.advanceTimersByTimeAsync(600);
    expect(entityEvents()).toEqual([{ type: "entity.updated", id, owner: "weekly", kind: "week" }]);

    hoisted.send.mockClear();
    db.prepare("UPDATE plugin_entities SET orphaned_time = 5 WHERE id = ?").run(id);
    await vi.advanceTimersByTimeAsync(600);
    db.prepare("UPDATE contents SET content = '[]' WHERE id = ?").run(contentId);
    await vi.advanceTimersByTimeAsync(600);
    expect(entityEvents()).toEqual([{ type: "entity.deleted", id, owner: "weekly", kind: "week" }]);
  });

  it("插件记录的事件带所属插件与集合，孤儿按删除处理", async () => {
    db.prepare(
      "INSERT INTO plugin_records (id, plugin_id, collection, data, create_time, update_time) VALUES ('r1', 'weekly', 'groups', '{}', 1, 1)"
    ).run();
    const recordEvents = () =>
      hoisted.send.mock.calls.flatMap(([, message]) =>
        message.events.map(({ type, id, owner, collection }: Record<string, unknown>) => ({
          type,
          id,
          owner,
          collection,
        }))
      );
    await vi.advanceTimersByTimeAsync(600);
    expect(recordEvents()).toEqual([
      { type: "record.created", id: "r1", owner: "weekly", collection: "groups" },
    ]);
    hoisted.send.mockClear();
    db.prepare("UPDATE plugin_records SET orphaned_time = 5 WHERE id = 'r1'").run();
    await vi.advanceTimersByTimeAsync(600);
    expect(recordEvents()).toEqual([
      { type: "record.deleted", id: "r1", owner: "weekly", collection: "groups" },
    ]);
  });

  it("插件经 entities / records 写入的事件带插件来源", async () => {
    const scope = { databaseName: ":memory:", pluginId: "weekly" };
    await PluginEntityTable.create(db, {
      ...scope,
      input: { kind: "note", key: "w1", title: "", meta: {} },
    });
    PluginRecordTable.insert(db, { ...scope, collection: "groups", id: "r9", data: {} });
    await vi.advanceTimersByTimeAsync(600);
    expect(origins()).toEqual(["weekly", "weekly"]);
  });

  it("关联的增删计入来源实体；删除带关联的实体仍带类型", async () => {
    const id = Number(
      db
        .prepare(
          "INSERT INTO plugin_entities (plugin_id, kind, key, content_id, create_time, update_time) VALUES ('weekly', 'question', 'q', 0, 1, 1)"
        )
        .run().lastInsertRowid
    );
    await vi.advanceTimersByTimeAsync(600);
    hoisted.send.mockClear();
    const kinds = () =>
      hoisted.send.mock.calls.flatMap(([, message]) =>
        message.events.map(({ type, kind }: Record<string, unknown>) => ({ type, kind }))
      );
    db.prepare(
      `INSERT INTO plugin_links (id, plugin_id, from_id, to_kind, to_id, to_created_at, sort_index, create_time)
       VALUES ('l1', 'weekly', ?, 'card', '1', 1, 0, 1)`
    ).run(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(kinds()).toEqual([{ type: "entity.updated", kind: "question" }]);
    hoisted.send.mockClear();
    db.prepare("DELETE FROM plugin_links WHERE from_id = ?").run(id);
    db.prepare("DELETE FROM plugin_entities WHERE id = ?").run(id);
    await vi.advanceTimersByTimeAsync(600);
    expect(kinds()).toEqual([{ type: "entity.deleted", kind: "question" }]);
  });

  it("同步下载重连后只发一次全量刷新", async () => {
    card(0);
    for (const callback of hoisted.connected) callback("alpha.db", "sync_download_reconnect");
    await vi.advanceTimersByTimeAsync(600);
    expect(events()).toEqual([{ type: "workspace.reset" }]);
  });

  it("插件写入的事件带插件来源；协作投影的正文按登记的来源标注", async () => {
    const contentId = ContentTable.createContent(db, { content: doc("甲") });
    writeAsPlugin("weekly", () => card(contentId));
    await vi.advanceTimersByTimeAsync(600);
    expect(origins()).toEqual(["weekly"]);

    hoisted.send.mockClear();
    markContentOrigin("alpha.db", contentId, "weekly");
    db.prepare("UPDATE contents SET content = '[]' WHERE id = ?").run(contentId);
    await vi.advanceTimersByTimeAsync(600);
    expect(origins()).toEqual(["weekly"]);

    hoisted.send.mockClear();
    card(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(origins()).toEqual(["app"]);
  });
});
