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

import ArticleTable from "../../tables/article";
import CardTable from "../../tables/card";
import ContentLinkTable from "../../tables/content-link";
import DiaryTable from "../../tables/diary";
import ProjectTable from "../../tables/project";
import QuestionLinkTable from "../../tables/question-link";
import QuestionTable from "../../tables/question";
import ChatSessionTable from "../../tables/chat-session";
import EntityLineageTable from "../../tables/entity-lineage";
import FlashcardTable from "../../tables/flashcard";
import TodoItemTable from "../../tables/todo-item";
import TodoNoteLinkTable from "../../tables/todo-note-link";
import VibeLearningProjectTable from "../../tables/vibe-learning-project";
import VibeLearningResourceTable from "../../tables/vibe-learning-resource";
import VLNoteTable from "../../tables/vl-note";
import WhiteBoardContentTable from "../../tables/white-board-content";
import WhiteboardTable from "../../tables/whiteboard";
import { CONTENT_AI_META_CHANGED_EVENT } from "../../tables/content-ai-meta";
import ExcerptTable from "../../tables/excerpt";
import PdfTable from "../../tables/pdf";
import { getEntityContext } from "../context-query";
import { reconcileRefs } from "../ref-indexer";
import { CONTEXT_WRITE_EVENTS, WHITEBOARD_CANVAS_EVENTS } from "../write-events";

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

const insertContent = (nodes: unknown[]) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, 0, 1)`
      )
      .run(clock, clock++, JSON.stringify(nodes)).lastInsertRowid
  );
const insertCard = (contentId: number) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, '[]', '[]', ?)`
      )
      .run(clock, clock, contentId).lastInsertRowid
  );
const insertArticle = (title: string, contentId: number, isDelete = 0) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id, is_delete)
         VALUES (?, ?, ?, '', '[]', '[]', ?, ?)`
      )
      .run(clock, clock, title, contentId, isDelete).lastInsertRowid
  );
const insertProjectItem = (title: string, contentId: number) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents, projects, project_item_type)
         VALUES (?, ?, ?, ?, '[]', '[]', '[]', 'document')`
      )
      .run(clock, clock, title, contentId).lastInsertRowid
  );
const insertQuestion = (title: string, status = "in_progress") =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO questions (create_time, update_time, question_content, answers, status) VALUES (?, ?, ?, '[]', ?)`
      )
      .run(clock, clock++, title, status).lastInsertRowid
  );
const linkQuestion = (questionId: number, targetType: string, targetId: number) =>
  mainDb
    .prepare(
      `INSERT INTO question_link (question_id, target_type, target_id, content_id, create_time, sort_index)
       VALUES (?, ?, ?, NULL, ?, 0)`
    )
    .run(questionId, targetType, targetId, clock);

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

describe("getEntityContext", () => {
  it("被引用、共用正文与相关问题", async () => {
    const cardContent = insertContent([p(text("重排与重绘"))]);
    const cardId = insertCard(cardContent);
    const itemId = insertProjectItem("渲染篇", cardContent);
    const articleContent = insertContent([
      p(text("几何属性变了就会触发"), link("card", cardId, "重排与重绘", cardContent), text("。")),
      p(link("card", cardId, "重排与重绘", cardContent)),
    ]);
    const articleId = insertArticle("浏览器渲染", articleContent);
    // 引用了与卡片共用正文的项目文档，也算引用了卡片
    const noteContent = insertContent([p(link("project-item", itemId, "渲染篇", cardContent))]);
    const otherCard = insertCard(noteContent);
    const q1 = insertQuestion("为什么 transform 不触发重排？");
    linkQuestion(q1, "card", cardId);
    const q2 = insertQuestion("渲染篇还缺什么？", "not_started");
    linkQuestion(q2, "project_item", itemId);
    await reconcileRefs(mainDb, indexDb);

    const ctx = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    expect(ctx.self).toMatchObject({ ref: { kind: "card", id: cardId }, title: "重排与重绘" });
    expect(ctx.projections.map(e => e.ref)).toEqual([{ kind: "project-item", id: itemId }]);
    expect(ctx.backlinkTotal).toBe(2);
    expect(ctx.backlinks.map(b => b.source.ref)).toEqual([
      { kind: "card", id: otherCard },
      { kind: "article", id: articleId },
    ]);
    expect(ctx.backlinks[1].snippets).toEqual([
      { before: "几何属性变了就会触发", label: "重排与重绘", after: "。" },
      // 第二段只有链接：以上一段作前文
      { before: "几何属性变了就会触发重排与重绘。", label: "重排与重绘", after: "" },
    ]);
    expect(ctx.questions.map(q => [q.id, q.status])).toEqual([
      [q1, "in_progress"],
      [q2, "not_started"],
    ]);

    // 文章引用了卡片（连接分区内联条目）；卡片自己没有出链
    const fromArticle = getEntityContext(mainDb, indexDb, { kind: "article", id: articleId })!;
    expect(fromArticle.links.map(l => [l.entity.ref, l.inlineOnly])).toEqual([
      [{ kind: "card", id: cardId }, true],
    ]);
    expect(ctx.links).toEqual([]);

    // 从项目文档看，同样能看到卡片身份与被引用
    const fromItem = getEntityContext(mainDb, indexDb, { kind: "project-item", id: itemId })!;
    expect(fromItem.projections.map(e => e.ref)).toEqual([{ kind: "card", id: cardId }]);
    expect(fromItem.backlinkTotal).toBe(2);
  });

  it("自引用、软删来源不计；缺 contentId 的老节点按类型与 id 兜底", async () => {
    const selfContent = insertContent([p(text("自己"))]);
    const cardId = insertCard(selfContent);
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(JSON.stringify([p(text("自己")), p(link("card", cardId, "自己"))]), selfContent);
    const deletedContent = insertContent([p(link("card", cardId, "自己"))]);
    insertArticle("已删", deletedContent, 1);
    const legacy = insertContent([p(link("card", cardId, "自己"))]);
    const legacyArticle = insertArticle("老文章", legacy);
    await reconcileRefs(mainDb, indexDb);

    const ctx = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    expect(ctx.backlinks.map(b => b.source.ref)).toEqual([{ kind: "article", id: legacyArticle }]);
  });

  it("问题答案被投影成卡片时，按答案正文也能找到问题", () => {
    const answerContent = insertContent([p(text("答案"))]);
    const cardId = insertCard(answerContent);
    const q = insertQuestion("某个问题");
    linkQuestion(q, "answer", answerContent);
    const ctx = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    expect(ctx.questions.map(item => item.id)).toEqual([q]);
  });

  it("碎碎念只拥有自己的正文与反向引用，同一天其他条目独立", async () => {
    const seg1 = insertContent([p(text("上午"))]);
    const seg2 = insertContent([p(text("下午"))]);
    const diaryId = Number(
      mainDb
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id) VALUES (?, ?, 'daily', '2026-09-18', NULL)`
        )
        .run(clock, clock).lastInsertRowid
    );
    for (const seg of [seg1, seg2]) {
      mainDb
        .prepare(
          `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
        )
        .run(clock, clock, diaryId, seg);
    }
    const first = (
      mainDb.prepare("SELECT id FROM diary_segments WHERE content_id = ?").get(seg1) as {
        id: number;
      }
    ).id;
    const second = (
      mainDb.prepare("SELECT id FROM diary_segments WHERE content_id = ?").get(seg2) as {
        id: number;
      }
    ).id;
    const src = insertContent([p(link("diary-moment", first, "9 月 18 日", seg1))]);
    insertCard(src);
    await reconcileRefs(mainDb, indexDb);
    const ctx = getEntityContext(mainDb, indexDb, { kind: "diary-moment", id: first })!;
    expect(ctx.backlinkTotal).toBe(1);
    expect(ctx.projections).toEqual([]);
    expect(
      getEntityContext(mainDb, indexDb, { kind: "diary-moment", id: second })!.backlinkTotal
    ).toBe(0);
  });

  it("日记一天有多条时，被引用与引用了都打开到相关的那一条", async () => {
    const diaryId = Number(
      mainDb
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id) VALUES (?, ?, 'daily', '2025-11-13', NULL)`
        )
        .run(clock, clock).lastInsertRowid
    );
    const insertSegment = (contentId: number) =>
      Number(
        mainDb
          .prepare(
            `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
          )
          .run(clock, clock, diaryId, contentId).lastInsertRowid
      );
    const cardContent = insertContent([p(text("期货"))]);
    const cardId = insertCard(cardContent);
    insertSegment(insertContent([p(text("上午"))]));
    const secondContent = insertContent([
      p(text("前置内容")),
      p(link("card", cardId, "期货", cardContent)),
    ]);
    const second = insertSegment(secondContent);
    // 卡片反过来引用这一天的第二条
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(
        JSON.stringify([p(link("diary-moment", second, "11 月 13 日", secondContent))]),
        cardContent
      );
    await reconcileRefs(mainDb, indexDb);

    const ctx = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    const target = { page: "diary", date: "2025-11-13", momentId: second };
    expect(ctx.backlinks[0].source.open).toEqual({ ...target, at: { block: 1 } });
    expect(ctx.links[0].entity.open).toEqual(target);
  });

  it("旧周记的碎碎念作为来源时按归属日定位，标题使用该条正文", async () => {
    const seg = insertContent([p(text("本周小结"), link("card", 0, "占位"))]);
    const diaryId = Number(
      mainDb
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id, tags) VALUES (?, ?, 'weekly', '2025-W46', NULL, '["周记"]')`
        )
        .run(clock, clock).lastInsertRowid
    );
    const momentId = Number(
      mainDb
        .prepare(
          `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
        )
        .run(clock, clock, diaryId, seg).lastInsertRowid
    );
    const cardContent = insertContent([p(text("期货"))]);
    const cardId = insertCard(cardContent);
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(JSON.stringify([p(text("本周小结"), link("card", cardId, "期货", cardContent))]), seg);
    await reconcileRefs(mainDb, indexDb);

    const [backlink] = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!.backlinks;
    expect(backlink.source).toMatchObject({
      ref: { kind: "diary-moment", id: momentId },
      title: expect.stringContaining("本周小结"),
      meta: expect.stringContaining("2025-11-10"),
      open: { page: "diary", date: "2025-11-10", momentId },
    });
  });

  it("连接分区：显式连接绑定 contentId，共用正文（从卡片创建的项目文档）共享同一组连接", () => {
    const cardContent = insertContent([p(text("重排与重绘"))]);
    const cardId = insertCard(cardContent);
    const articleContent = insertContent([p(text("浏览器渲染"))]);
    const articleId = insertArticle("渲染笔记", articleContent);
    const [low, high] =
      cardContent < articleContent ? [cardContent, articleContent] : [articleContent, cardContent];
    mainDb
      .prepare(
        `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
      )
      .run(low, high, clock++);
    // 项目文档复用卡片正文（refType='card' 的创建路径）
    const itemId = insertProjectItem("渲染篇", cardContent);

    const fromCard = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    expect(fromCard.links.map(l => [l.entity.ref, l.inlineOnly])).toEqual([
      [{ kind: "article", id: articleId }, false],
    ]);
    const fromItem = getEntityContext(mainDb, indexDb, { kind: "project-item", id: itemId })!;
    expect(fromItem.links.map(l => l.entity.ref)).toEqual([{ kind: "article", id: articleId }]);
    // 反向：文章也看到卡片（代表身份）
    const fromArticle = getEntityContext(mainDb, indexDb, { kind: "article", id: articleId })!;
    expect(fromArticle.links.map(l => l.entity.ref)).toEqual([{ kind: "card", id: cardId }]);
  });

  it("连接分区：指向已无身份正文的悬空边被丢弃", () => {
    const selfContent = insertContent([p(text("自己"))]);
    const cardId = insertCard(selfContent);
    const orphan = insertContent([p(text("孤儿"))]);
    const [low, high] = selfContent < orphan ? [selfContent, orphan] : [orphan, selfContent];
    mainDb
      .prepare(
        `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
      )
      .run(low, high, clock++);

    const ctx = getEntityContext(mainDb, indexDb, { kind: "card", id: cardId })!;
    expect(ctx.links).toEqual([]);
  });

  it("出链去重，排除自身、共用正文的身份与已删除的目标", () => {
    const targetContent = insertContent([p(text("目标"))]);
    const targetId = insertArticle("目标文章", targetContent);
    const selfContent = insertContent([]);
    const itemId = insertProjectItem("渲染篇", selfContent);
    const cardId = insertCard(selfContent);
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(
        JSON.stringify([
          p(link("article", targetId, "目标文章"), link("article", targetId, "目标文章")),
          p(link("article", 999, "已删除")),
          p(link("project-item", itemId, "渲染篇"), link("card", cardId, "自己")),
        ]),
        selfContent
      );
    const ctx = getEntityContext(mainDb, indexDb, { kind: "project-item", id: itemId })!;
    expect(ctx.links.map(l => [l.entity.ref, l.entity.title])).toEqual([
      [{ kind: "article", id: targetId }, "目标文章"],
    ]);
  });

  it("插件内容可被 @ 引用：被引用与自身展示", async () => {
    const noteContent = insertContent([p(text("这周读完了《置身事内》"))]);
    const noteId = Number(
      mainDb
        .prepare(
          `INSERT INTO plugin_entities (plugin_id, kind, key, title, content_id, create_time, update_time)
           VALUES ('tau.weekly-review', 'note', '2026-W43', '第 43 周周记', ?, 1, 1)`
        )
        .run(noteContent).lastInsertRowid
    );
    const articleContent = insertContent([
      p(text("详见"), link("plugin-entity", noteId, "第 43 周周记", noteContent)),
    ]);
    const articleId = insertArticle("读书计划", articleContent);
    await reconcileRefs(mainDb, indexDb);

    const ctx = getEntityContext(mainDb, indexDb, { kind: "plugin-entity", id: noteId })!;
    expect(ctx.self).toMatchObject({
      ref: { kind: "plugin-entity", id: noteId },
      title: "第 43 周周记",
    });
    expect(ctx.backlinks.map(b => [b.source.ref, b.snippets])).toEqual([
      [{ kind: "article", id: articleId }, [{ before: "详见", label: "第 43 周周记", after: "" }]],
    ]);
  });

  it("实体不存在返回 null", () => {
    expect(getEntityContext(mainDb, indexDb, { kind: "card", id: 404 })).toBeNull();
  });
});

describe("CONTEXT_WRITE_EVENTS", () => {
  it("每个事件名都是实际注册的 IPC 写事件", () => {
    const registered = new Set(
      [
        ArticleTable,
        CardTable,
        ContentLinkTable,
        DiaryTable,
        ProjectTable,
        QuestionLinkTable,
        QuestionTable,
        WhiteboardTable,
        WhiteBoardContentTable,
        ChatSessionTable,
        EntityLineageTable,
        FlashcardTable,
        TodoItemTable,
        TodoNoteLinkTable,
        VibeLearningProjectTable,
        VibeLearningResourceTable,
        VLNoteTable,
        ExcerptTable,
        PdfTable,
      ].flatMap(table => Object.keys(table.getListenEvents()))
    );
    // 笔记元信息由 content-ai-queue 写入后补发
    registered.add(CONTENT_AI_META_CHANGED_EVENT);
    const unknown = [...CONTEXT_WRITE_EVENTS, ...WHITEBOARD_CANVAS_EVENTS].filter(
      name => !registered.has(name)
    );
    expect(unknown).toEqual([]);
  });

  it("正文连接的写事件必须在白名单里（连接是「连接」分区的数据源）", () => {
    // 反向守护：白名单漏登真实写事件时，增删连接不会广播 entity-context:changed
    expect(CONTEXT_WRITE_EVENTS.has("content-links:add")).toBe(true);
    expect(CONTEXT_WRITE_EVENTS.has("content-links:remove")).toBe(true);
  });
});
