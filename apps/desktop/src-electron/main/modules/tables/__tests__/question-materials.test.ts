import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";

// 问题表经内容表间接加载到 electron 与视频笔记队列
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import EntityLineageTable from "../entity-lineage";
import EntitySearchTable from "../entity-search";
import ExcerptTable from "../excerpt";
import QuestionChatTable from "../question-chat";
import QuestionLinkTable from "../question-link";
import QuestionTable from "../question";

const SESSION = "8f3a1c2e-0b4d-4e5f-9a6b-1c2d3e4f5a6b";

function addSession(db: Database.Database, id: string, scope: string, title: string) {
  db.prepare(
    `INSERT INTO chat_session (id, scope, session_file, title, message_count, create_time, update_time)
     VALUES (?, ?, ?, ?, 4, 1, 2)`
  ).run(id, scope, `${id}.jsonl`, title);
}

describe("问题的外部材料与探究对话", () => {
  let db: Database.Database;
  let questionId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    db.exec("INSERT INTO excerpt_provider VALUES ('weread', '微信读书', 0), ('web', '网页', 0)");
    questionId = QuestionTable.captureQuestion(db, "为什么地方财政依赖土地").question.id;
  });
  afterEach(() => db.close());

  it("摘录作为材料：不持引用计数，源端删除后保留原文", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:bm_1",
        quote: "土地财政",
        note: "想法",
        anchor: null,
        color: null,
        sourceTime: null,
        location: "",
        url: null,
      },
    ]);
    const [excerpt] = ExcerptTable.listActive(db);
    QuestionLinkTable.linkTargets(db, questionId, [
      { targetType: "excerpt", targetId: excerpt.id },
    ]);

    const row = db.prepare(`SELECT content_id FROM question_link`).get() as {
      content_id: number | null;
    };
    expect(row.content_id).toBeNull();
    const detail = QuestionLinkTable.getDetail(db, questionId)!;
    expect(detail.question.status).toBe("in_progress");
    expect(detail.materials[0]).toMatchObject({
      targetType: "excerpt",
      title: "土地财政",
      missing: false,
      material: { open: { page: "excerpt-provider", sourceType: "weread", sourceKey: "b1" } },
    });

    ExcerptTable.deleteSource(db, "weread", "b1");
    const [after] = QuestionLinkTable.getDetail(db, questionId)!.materials;
    expect(after.missing).toBe(false);
    expect(after.meta).toContain("原划线已删除");
    expect(after.material?.open).toBeNull();
  });

  it("不存在的 PDF 标注与剪藏解析为缺失", () => {
    QuestionLinkTable.linkTargets(db, questionId, [
      { targetType: "pdf-annotation", targetId: 99 },
      { targetType: "web-clip", targetId: 98 },
    ]);
    const materials = QuestionLinkTable.getDetail(db, questionId)!.materials;
    expect(materials.map(m => m.missing)).toEqual([true, true]);
  });

  it("关联对话：UUID 原样存取、去重、记轨迹、计入构成", () => {
    addSession(db, SESSION, "main-chat", "土地财政的来龙去脉");
    expect(QuestionChatTable.link(db, questionId, { sessionId: SESSION, messageIds: ["e1"] })).toBe(
      true
    );
    expect(QuestionChatTable.link(db, questionId, { sessionId: SESSION })).toBe(false);

    const stored = db
      .prepare(`SELECT session_id, typeof(session_id) AS t FROM question_chat`)
      .get();
    expect(stored).toEqual({ session_id: SESSION, t: "text" });

    const detail = QuestionLinkTable.getDetail(db, questionId)!;
    expect(detail.question.status).toBe("in_progress");
    expect(detail.chats).toMatchObject([
      {
        sessionId: SESSION,
        messageIds: ["e1"],
        title: "土地财政的来龙去脉",
        scopeLabel: "",
        openable: true,
        missing: false,
        initiated: false,
      },
    ]);
    expect(detail.events.map(e => e.type)).toEqual(
      expect.arrayContaining(["create", "link", "status"])
    );
    const summary = QuestionLinkTable.listSummaries(db).find(q => q.id === questionId)!;
    expect(summary.linkCounts["chat-session"]).toBe(1);

    expect(QuestionChatTable.unlink(db, questionId, SESSION)).toBe(1);
    expect(QuestionLinkTable.getDetail(db, questionId)!.chats).toEqual([]);
  });

  it("对话场景、删除降级与由此发起", () => {
    addSession(db, "s-pdf", "pdf-chat", "PDF 里的追问");
    QuestionChatTable.link(db, questionId, { sessionId: "s-pdf" });
    QuestionChatTable.link(db, questionId, { sessionId: "s-gone" });
    addSession(db, SESSION, "main-chat", "围绕问题");
    QuestionChatTable.link(db, questionId, { sessionId: SESSION });
    EntityLineageTable.record(db, {
      src: { kind: "question", id: questionId },
      dst: { kind: "chat-session", id: SESSION },
      relation: "discussed_in",
    });

    const chats = new Map(
      QuestionLinkTable.getDetail(db, questionId)!.chats.map(c => [c.sessionId, c])
    );
    expect(chats.get("s-pdf")).toMatchObject({ scopeLabel: "PDF 对话", openable: false });
    expect(chats.get("s-gone")).toMatchObject({ missing: true, openable: false });
    expect(chats.get(SESSION)).toMatchObject({ initiated: true, openable: true });
  });

  it("答案「创建为卡片」后不迁移材料，答案行带出共用正文的卡片", () => {
    const answer = QuestionTable.createAnswer(db, [
      { type: "paragraph", children: [{ type: "formatted", text: "因为分税制" }] },
    ] as never);
    QuestionLinkTable.linkTargets(db, questionId, [{ targetType: "answer", targetId: answer.id }]);
    const now = Date.now();
    const cardId = Number(
      db
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id)
           VALUES (?, ?, '[]', '[]', ?)`
        )
        .run(now, now, answer.id).lastInsertRowid
    );
    const [material] = QuestionLinkTable.getDetail(db, questionId)!.materials;
    expect(material).toMatchObject({ targetType: "answer", targetId: answer.id });
    expect(material.projections).toEqual([{ kind: "card", id: cardId }]);
  });

  it("关联已有：能按引文搜到摘录、按标题搜到对话", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:bm_1",
        quote: "土地财政",
        note: "",
        anchor: null,
        color: null,
        sourceTime: null,
        location: "",
        url: null,
      },
      {
        externalId: "b1:bm_2",
        quote: "招商引资",
        note: "",
        anchor: null,
        color: null,
        sourceTime: null,
        location: "",
        url: null,
      },
    ]);
    addSession(db, SESSION, "pdf-chat", "关于土地的追问");
    const excerpts = EntitySearchTable.search(db, { kind: "excerpt", keyword: "土地" });
    expect(excerpts.map(c => c.title)).toEqual(["土地财政"]);
    expect(excerpts[0].meta).toContain("置身事内");
    const chats = EntitySearchTable.search(db, { kind: "chat-session", keyword: "土地" });
    expect(chats).toMatchObject([{ sessionId: SESSION, meta: "PDF 对话 · 4 条消息" }]);
    expect(EntitySearchTable.search(db, { kind: "web-clip" })).toEqual([]);
  });

  it("删除问题时一并清理探究对话", () => {
    QuestionChatTable.link(db, questionId, { sessionId: SESSION });
    QuestionTable.deleteQuestion(db, questionId);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM question_chat`).get()).toEqual({ n: 0 });
  });

  it("立项来源：问题 ↔ Notebook 双向查询，Notebook 删除后为空", () => {
    db.prepare(
      `INSERT INTO vibe_learning_project (id, title, create_time, update_time) VALUES (7, '土地财政课题', 1, 1)`
    ).run();
    EntityLineageTable.record(db, {
      src: { kind: "question", id: questionId },
      dst: { kind: "vl-project", id: 7 },
      relation: "upgraded_to",
    });
    expect(QuestionLinkTable.getDetail(db, questionId)!.notebook).toEqual({
      id: 7,
      title: "土地财政课题",
    });
    expect(QuestionLinkTable.sourceOfNotebook(db, 7)).toEqual({
      id: questionId,
      title: "为什么地方财政依赖土地",
    });
    db.prepare(`DELETE FROM vibe_learning_project WHERE id = 7`).run();
    expect(QuestionLinkTable.getDetail(db, questionId)!.notebook).toBeNull();
  });
});
