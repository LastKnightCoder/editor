import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import EntityLineageTable from "../../tables/entity-lineage";
import { getEntityContext } from "../context-query";
import { reconcileRefs } from "../ref-indexer";
import { reconcileWhiteboardRefs } from "../whiteboard-indexer";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const text = (t: string) => ({ type: "formatted", text: t });
const p = (...children: unknown[]) => ({ type: "paragraph", children });
const link = (contentType: string, refId: number, title: string, contentId?: number) => ({
  type: "content-link",
  contentType,
  refId,
  contentId,
  contentTitle: title,
  children: [text(title)],
});

let mainDb: Database.Database;
let indexDb: Database.Database;
let clock = 1_000;

const run = (sql: string, ...params: unknown[]) =>
  Number(mainDb.prepare(sql).run(...params).lastInsertRowid);
const insertContent = (nodes: unknown[]) =>
  run(
    `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, 0, 1)`,
    clock,
    clock++,
    JSON.stringify(nodes)
  );
const insertCard = (contentId: number) =>
  run(
    `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, '[]', '[]', ?)`,
    clock,
    clock++,
    contentId
  );
const insertProjectItem = (title: string, contentId: number | null, pageId: number | null = null) =>
  run(
    `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents, projects, project_item_type, white_board_content_id)
     VALUES (?, ?, ?, ?, '[]', '[]', '[]', ?, ?)`,
    clock,
    clock++,
    title,
    contentId,
    pageId ? "white-board" : "document",
    pageId
  );
const insertPage = (name: string, children: unknown[], refCount = 1) =>
  run(
    `INSERT INTO white_board_contents (create_time, update_time, name, data, ref_count) VALUES (?, ?, ?, ?, ?)`,
    clock,
    clock++,
    name,
    JSON.stringify({ children }),
    refCount
  );
const insertBoard = (title: string, pageIds: number[]) =>
  run(
    `INSERT INTO white_boards (create_time, update_time, title, tags, white_board_content_ids) VALUES (?, ?, ?, '[]', ?)`,
    clock,
    clock++,
    title,
    JSON.stringify(pageIds)
  );
const insertNotebook = (title: string) =>
  run(
    `INSERT INTO vibe_learning_project (create_time, update_time, title) VALUES (?, ?, ?)`,
    clock,
    clock++,
    title
  );

const reindex = async () => {
  await reconcileRefs(mainDb, indexDb);
  await reconcileWhiteboardRefs(mainDb, indexDb);
};
const contextOf = (kind: "card" | "project-item", id: number) =>
  getEntityContext(mainDb, indexDb, { kind, id })!;

beforeEach(() => {
  mainDb = new Database(":memory:");
  mainDb.exec(MAIN_SQL);
  indexDb = new Database(":memory:");
  indexDb.exec(INDEX_SQL);
});

afterEach(() => {
  mainDb.close();
  indexDb.close();
});

describe("来源与衍生", () => {
  it("从对话存下的卡片显示来源；对话删除后保留灰显一行", () => {
    run(
      `INSERT INTO chat_session (id, scope, session_file, title, create_time, update_time) VALUES ('s1', 'global', 'f', '层叠上下文', 1, 1)`
    );
    const cardId = insertCard(insertContent([p(text("回答"))]));
    EntityLineageTable.record(mainDb, {
      src: { kind: "chat-session", id: "s1" },
      dst: { kind: "card", id: cardId },
      relation: "saved_from",
      srcAnchor: { messageIds: ["m1"] },
    });

    expect(contextOf("card", cardId).sources).toEqual([
      {
        node: { kind: "chat-session", id: "s1" },
        relation: "saved_from",
        title: "层叠上下文",
        meta: "对话",
        missing: false,
        open: { page: "chat", id: "s1" },
      },
    ]);

    mainDb.exec(`DELETE FROM chat_session WHERE id = 's1'`);
    expect(contextOf("card", cardId).sources).toEqual([
      expect.objectContaining({ title: "", meta: "对话", missing: true, open: null }),
    ]);
  });

  it("共用正文的身份共享来源；衍生含谱系出边与引用正文的闪卡，已删除的不显示", () => {
    const notebook = insertNotebook("浏览器原理");
    const noteContent = insertContent([p(text("笔记"))]);
    const vlNote = run(
      `INSERT INTO vl_note (create_time, update_time, project_id, content_id, title) VALUES (?, ?, ?, ?, '渲染')`,
      clock,
      clock++,
      notebook,
      noteContent
    );
    const cardContent = insertContent([p(text("卡"))]);
    const cardId = insertCard(cardContent);
    const itemId = insertProjectItem("渲染篇", cardContent);
    EntityLineageTable.record(mainDb, {
      src: { kind: "vl-note", id: vlNote },
      dst: { kind: "project-item", id: itemId },
      relation: "derived",
    });
    const copyId = insertProjectItem("副本", insertContent([p(text("副本"))]));
    EntityLineageTable.record(mainDb, {
      src: { kind: "card", id: cardId },
      dst: { kind: "project-item", id: copyId },
      relation: "derived",
    });
    EntityLineageTable.record(mainDb, {
      src: { kind: "card", id: cardId },
      dst: { kind: "project-item", id: 999 },
      relation: "derived",
    });
    const deck = run(
      `INSERT INTO flashcard_decks (name, create_time, update_time) VALUES ('前端', 1, 1)`
    );
    const flashcard = run(
      `INSERT INTO flashcards (deck_id, type, prompt, data, due_time, create_time, update_time) VALUES (?, 'qa', ?, '{}', 0, ?, ?)`,
      deck,
      JSON.stringify([p(text("什么是重排？"))]),
      clock,
      clock++
    );
    run(
      `INSERT INTO flashcard_references (card_id, content_id, ref_type, title, create_time, update_time) VALUES (?, ?, 'content', '卡', 1, 1)`,
      flashcard,
      cardContent
    );

    const ctx = contextOf("card", cardId);
    expect(ctx.sources).toEqual([
      expect.objectContaining({
        node: { kind: "vl-note", id: vlNote },
        title: "渲染",
        meta: "Notebook · 浏览器原理",
        open: { page: "vibe-learning-detail", id: notebook },
      }),
    ]);
    // 按时间倒序：谱系行写入时取当前时间，比夹具里的闪卡新
    expect(ctx.derived.map(item => [item.node, item.title, item.meta])).toEqual([
      [{ kind: "project-item", id: copyId }, "副本", "项目文档"],
      [{ kind: "flashcard", id: flashcard }, "什么是重排？", "闪卡 · 前端"],
    ]);
    expect(ctx.derived[1].open).toEqual({ page: "review", deckId: deck });
  });

  it("Notebook 笔记转成卡片时，卡片的 Notebook 投影显示这篇笔记", () => {
    const notebook = insertNotebook("学习");
    const content = insertContent([p(text("笔记"))]);
    const vlNote = run(
      `INSERT INTO vl_note (create_time, update_time, project_id, content_id, title) VALUES (1, 1, ?, ?, '大纲')`,
      notebook,
      content
    );
    const cardId = insertCard(content);
    expect(contextOf("card", cardId).notebookProjections).toEqual([
      expect.objectContaining({ node: { kind: "vl-note", id: vlNote }, title: "大纲" }),
    ]);
  });
});

describe("被使用", () => {
  it("白板：卡片元素、思维导图关联、文本块里的引用归到白板；孤儿页不显示", async () => {
    const cardContent = insertContent([p(text("重排"))]);
    const cardId = insertCard(cardContent);
    const a = insertPage("第一页", [{ id: "c", type: "card", cardId }]);
    insertBoard("前端图", [a]);
    const mindNote = insertContent([p(text("关联"))]);
    const b = insertPage("导图", [
      {
        id: "m",
        type: "mind-node",
        text: [],
        children: [{ id: "n", type: "mind-node", contentId: cardContent, text: [], children: [] }],
      },
    ]);
    const c = insertPage("第二页", [{ id: "r", type: "richtext", contentId: mindNote }]);
    insertBoard("复习", [b, c]);
    // 文本块正文引用了卡片：这份正文没有实体身份
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(JSON.stringify([p(link("card", cardId, "重排", cardContent))]), mindNote);
    const orphan = insertPage("废弃", [{ id: "x", type: "card", cardId }], 0);
    insertBoard("旧", [orphan]);
    await reindex();

    const usages = contextOf("card", cardId).usages;
    expect(usages.map(u => [u.kind, u.title, "meta" in u ? u.meta : ""])).toEqual([
      ["whiteboard", "前端图", "白板"],
      ["whiteboard", "复习", "白板 · 导图"],
    ]);
    expect(usages[0].open).toEqual({ page: "whiteboard-detail", id: expect.any(Number), pageId: a });
    // 白板里的引用不进「被引用」
    expect(contextOf("card", cardId).backlinks).toEqual([]);
  });

  it("白板：项目里的白板条目与文档里嵌入的白板块，归属是对应的实体", async () => {
    const cardContent = insertContent([p(text("重排"))]);
    const cardId = insertCard(cardContent);
    const inProject = insertPage("项目页", [{ id: "c", type: "card", cardId }]);
    const itemId = insertProjectItem("项目白板", null, inProject);
    const embedded = insertPage("嵌入页", [{ id: "c", type: "card", cardId }]);
    const host = insertContent([{ type: "whiteboard", whiteBoardContentId: embedded, children: [text("")] }]);
    const hostItem = insertProjectItem("架构说明", host);
    await reindex();

    expect(
      contextOf("card", cardId).usages.map(u => [u.title, "meta" in u ? u.meta : "", u.open])
    ).toEqual([
      ["项目白板", "项目里的白板", { page: "entity", ref: { kind: "project-item", id: itemId } }],
      ["架构说明", "文档里的白板", { page: "entity", ref: { kind: "project-item", id: hostItem } }],
    ]);
  });

  it("待办（未归档）与 Notebook 资源", () => {
    const content = insertContent([p(text("卡"))]);
    const cardId = insertCard(content);
    const group = run(
      `INSERT INTO todo_group (title, sort_index, create_time, update_time) VALUES ('默认', 0, 1, 1)`
    );
    const todo = (title: string, archived: number) =>
      run(
        `INSERT INTO todo_item (group_id, title, is_archived, create_time, update_time) VALUES (?, ?, ?, 1, 1)`,
        group,
        title,
        archived
      );
    const live = todo("整理笔记", 0);
    const archived = todo("旧任务", 1);
    for (const todoId of [live, archived]) {
      run(
        `INSERT INTO todo_note_link (todo_id, content_id, create_time, update_time) VALUES (?, ?, 1, 1)`,
        todoId,
        content
      );
    }
    const notebook = insertNotebook("浏览器原理");
    run(
      `INSERT INTO vibe_learning_resources (project_id, create_time, update_time, name, original_path, resource_type, source_type)
       VALUES (?, 1, 1, '卡', ?, 'note', 'note')`,
      notebook,
      `note://${content}`
    );

    expect(contextOf("card", cardId).usages).toEqual([
      {
        kind: "todo",
        key: `todo:${live}`,
        title: "整理笔记",
        completed: false,
        open: { page: "todos", selectedId: live },
      },
      {
        kind: "notebook",
        key: `notebook:${notebook}`,
        title: "浏览器原理",
        open: { page: "vibe-learning-detail", id: notebook },
      },
    ]);
  });
});
