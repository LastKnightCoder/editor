import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import PluginReadonlyDataTable from "../tables/plugin-data-readonly";

const scope = { databaseName: ":memory:" };

describe("插件只读数据：Notebook、材料与对话", () => {
  let db: Database.Database;
  const insert = (sql: string, ...params: unknown[]) =>
    Number(db.prepare(sql).run(...params).lastInsertRowid);
  const query = (entity: "notebook" | "material" | "chat-session", extra = {}) =>
    PluginReadonlyDataTable.query(db, { ...scope, entity, query: { limit: 10, ...extra } });
  const get = (entity: "notebook" | "material" | "chat-session", id: string) =>
    PluginReadonlyDataTable.get(db, { ...scope, entity, id });

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
  });
  afterEach(() => db.close());

  it("Notebook：信息与资料清单，不含文件路径", () => {
    const notebook = insert(
      "INSERT INTO vibe_learning_project (title, archived, pinned, create_time, update_time) VALUES ('线代', 0, 1, 1, 5)"
    );
    const resource = (
      name: string,
      sort: number,
      type: string,
      source: string | null,
      meta?: unknown
    ) =>
      insert(
        `INSERT INTO vibe_learning_resources
           (project_id, sort_index, create_time, update_time, name, original_path, resource_type,
            file_size, duration, source_type, source_meta_info, transcript_segments)
         VALUES (?, ?, 1, 1, ?, '/Users/me/secret.pdf', ?, 2048, NULL, ?, ?, '[]')`,
        notebook,
        sort,
        name,
        type,
        source,
        meta === undefined ? null : JSON.stringify(meta)
      );
    resource("讲义", 1, "pdf", "local");
    resource("网页", 2, "html", "remote", { url: "https://example.com/a" });
    resource("卡片", 3, "md", "note", { contentId: 9, type: "card", title: "卡", originalId: 4 });
    resource("材料", 4, "md", "material", { title: "摘", refs: [{ kind: "excerpt", id: 2 }] });
    resource("视频", 5, "video", "tau.bilibili", { type: "tau.bilibili", bvid: "BV1" });
    resource("旧资料", 6, "txt", null);

    expect(get("notebook", String(notebook))).toEqual({
      id: String(notebook),
      title: "线代",
      archived: false,
      pinned: true,
      resourceCount: 6,
      createdAt: 1,
      updatedAt: 5,
    });
    expect(query("notebook").items.map(item => item.id)).toEqual([String(notebook)]);
    const resources = PluginReadonlyDataTable.notebookResources(db, {
      ...scope,
      notebookId: notebook,
    });
    expect(resources?.map(item => [item.name, item.source])).toEqual([
      ["讲义", "local"],
      ["网页", "remote"],
      ["卡片", "note"],
      ["材料", "material"],
      ["视频", "online-video"],
      ["旧资料", "local"],
    ]);
    expect(resources?.[0]).toEqual({
      id: expect.any(String),
      name: "讲义",
      type: "pdf",
      source: "local",
      size: 2048,
      duration: null,
      createdAt: 1,
    });
    expect(resources?.[1].url).toBe("https://example.com/a");
    expect(resources?.[2].from).toEqual([{ kind: "card", id: "4" }]);
    expect(resources?.[3].from).toEqual([{ kind: "material", id: "excerpt:2" }]);
    expect(JSON.stringify(resources)).not.toContain("secret");
    expect(PluginReadonlyDataTable.notebookResources(db, { ...scope, notebookId: 999 })).toBeNull();
    expect(get("notebook", "abc")).toBeNull();
  });

  it("材料：三类合并分页，软删除的划线与所在 PDF 已删除的标注不返回", () => {
    const excerpt = (quote: string, time: number, deleted = 0) =>
      insert(
        `INSERT INTO excerpt (source_type, source_key, source_title, external_id, quote, note,
           create_time, update_time, is_deleted, url)
         VALUES ('web', 'k', '书', ?, ?, '想法', ?, ?, ?, 'https://book.example/1')`,
        `e${time}`,
        quote,
        time,
        time,
        deleted
      );
    const first = excerpt("第一句", 1);
    excerpt("删掉的", 2, 1);
    const pdf = insert(
      "INSERT INTO pdfs (create_time, update_time, is_local, file_name) VALUES (1, 1, 1, '论文.pdf')"
    );
    const annotation = insert(
      `INSERT INTO pdf_annotations (create_time, update_time, pdf_id, page_num, annotation_payload, notes, type)
       VALUES (3, 3, ?, 2, '{}', '', 'margin')`,
      pdf
    );
    insert(
      `INSERT INTO pdf_annotations (create_time, update_time, pdf_id, page_num, annotation_payload, notes, type)
       VALUES (4, 4, 999, 0, '{}', '', 'margin')`
    );
    const clip = insert(
      "INSERT INTO web_clip (create_time, update_time, content_id, url, title) VALUES (5, 5, 1, 'https://news.example/x', '新闻')"
    );

    const page = query("material", { limit: 2, sort: "created" });
    expect(page.items.map(item => item.id)).toEqual([
      `web-clip:${clip}`,
      `pdf-annotation:${annotation}`,
    ]);
    const rest = query("material", { limit: 2, sort: "created", cursor: page.cursor });
    expect(rest.items.map(item => item.id)).toEqual([`excerpt:${first}`]);
    expect(rest.cursor).toBeUndefined();

    expect(get("material", `excerpt:${first}`)).toEqual({
      id: `excerpt:${first}`,
      kind: "excerpt",
      title: "第一句",
      quote: "第一句",
      note: "想法",
      source: expect.any(String),
      url: "https://book.example/1",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(get("material", `web-clip:${clip}`)).toMatchObject({
      kind: "web-clip",
      title: "新闻",
      quote: "",
      url: "https://news.example/x",
    });
    expect(get("material", `pdf-annotation:${annotation}`)).toMatchObject({
      kind: "pdf-annotation",
      source: expect.stringContaining("论文.pdf"),
    });
    expect(get("material", "excerpt:2")).toBeNull();
    expect(get("material", "cards:1")).toBeNull();
    expect(() => query("material", { tag: "读书" })).toThrow("没有标签");
  });

  it("对话：只给信息，场景按宿主的四个场景，未知场景不返回", () => {
    const chat = (id: string, scope: string, time: number) =>
      db
        .prepare(
          `INSERT INTO chat_session (id, scope, session_file, cwd, title, message_count, archived, create_time, update_time)
           VALUES (?, ?, 'f.jsonl', '/tmp', ?, 3, 0, ?, ?)`
        )
        .run(id, scope, `对话${id}`, time, time);
    chat("a", "main-chat", 1);
    chat("b", "vibe-learning-chat", 2);
    chat("c", "other-chat", 3);
    expect(query("chat-session").items).toEqual([
      {
        id: "b",
        title: "对话b",
        scene: "notebook",
        messageCount: 3,
        archived: false,
        createdAt: 2,
        updatedAt: 2,
      },
      expect.objectContaining({ id: "a", scene: "main" }),
    ]);
    expect(get("chat-session", "a")).toMatchObject({ scene: "main" });
    expect(get("chat-session", "c")).toBeNull();
    const page = query("chat-session", { limit: 1 });
    expect(
      query("chat-session", { limit: 1, cursor: page.cursor }).items.map(item => item.id)
    ).toEqual(["a"]);
  });

  it("拒绝跨库、未知类型与非法游标", () => {
    expect(() =>
      PluginReadonlyDataTable.query(db, {
        databaseName: "other",
        entity: "notebook",
        query: { limit: 1 },
      })
    ).toThrow("数据库已切换");
    expect(() => query("card" as never)).toThrow("未知的数据类型");
    expect(() => query("notebook", { cursor: "1:x" })).toThrow("分页游标无效");
    expect(() => query("notebook", { limit: 500 })).toThrow("limit");
  });
});
