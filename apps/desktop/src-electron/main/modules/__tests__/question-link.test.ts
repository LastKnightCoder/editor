import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));

// 切断 tables → database 模块的循环依赖链
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import MAIN_SCHEMA_SQL from "../../../../../../packages/db-schema/schema/main.sql?raw";
import ContentTable from "../tables/content";
import QuestionGroupTable from "../tables/question-group";
import QuestionTable from "../tables/question";
import QuestionLinkTable from "../tables/question-link";
import QuestionEventTable from "../tables/question-event";

const doc = (...lines: string[]) =>
  lines.map(text => ({ type: "paragraph", children: [{ type: "formatted", text }] })) as never;

const refCount = (db: Database.Database, contentId: number) =>
  (
    db.prepare(`SELECT ref_count FROM contents WHERE id = ?`).get(contentId) as
      { ref_count: number } | undefined
  )?.ref_count ?? null;

describe("问题材料关联与探究轨迹", () => {
  let db: Database.Database;
  let groupId: number;

  const insertCard = (text: string, createTime = Date.now()) => {
    const contentId = ContentTable.createContent(db, { content: doc(text, "正文") });
    db.prepare(`UPDATE contents SET create_time = ? WHERE id = ?`).run(createTime, contentId);
    const cardId = Number(
      db
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, '[]', '[]', ?)`
        )
        .run(createTime, createTime, contentId).lastInsertRowid
    );
    return { contentId, cardId };
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SCHEMA_SQL);
    QuestionGroupTable.upgradeTable(db);
    groupId = QuestionGroupTable.getDefaultGroup(db).id;
  });

  afterEach(() => {
    db.close();
  });

  it("回填：answers 转为类型化关联，补齐轨迹，只执行一次", () => {
    const base = Date.now() - 10 * 86400000;
    const card = insertCard("dirtyPaths 只标记祖先", base + 2 * 86400000);
    const answerContent = ContentTable.createContent(db, { content: doc("我的结论") });
    db.prepare(`UPDATE contents SET create_time = ? WHERE id = ?`).run(
      base + 4 * 86400000,
      answerContent
    );
    const questionId = Number(
      db
        .prepare(
          `INSERT INTO questions (create_time, update_time, question_content, answers, group_id, status, resolved_time)
           VALUES (?, ?, ?, ?, ?, 'resolved', ?)`
        )
        .run(
          base,
          base,
          "normalize 为什么触发这么多次？",
          JSON.stringify([card.contentId, answerContent]),
          groupId,
          base + 5 * 86400000
        ).lastInsertRowid
    );

    QuestionLinkTable.backfill(db);
    QuestionLinkTable.backfill(db);

    const links = QuestionLinkTable.list(db, questionId);
    expect(links.map(l => [l.targetType, l.targetId])).toEqual([
      ["card", card.cardId],
      ["answer", answerContent],
    ]);
    const events = QuestionEventTable.list(db, questionId);
    expect(events.map(e => e.type)).toEqual(["create", "link", "link", "status"]);
    expect(events[1].payload).toMatchObject({ targetType: "card", created: true, estimated: true });
    // 引用计数沿用旧数据
    expect(refCount(db, card.contentId)).toBe(1);
    // answers 缓存保持 content id
    expect(QuestionTable.getQuestionById(db, questionId)!.answers).toEqual([
      card.contentId,
      answerContent,
    ]);
  });

  it("回填：非已解答问题清空旧的「首个答案时间」", () => {
    const now = Date.now();
    const questionId = Number(
      db
        .prepare(
          `INSERT INTO questions (create_time, update_time, question_content, answers, group_id, status, resolved_time)
           VALUES (?, ?, 'q', '[]', ?, 'in_progress', ?)`
        )
        .run(now, now, groupId, now).lastInsertRowid
    );
    QuestionLinkTable.backfill(db);
    expect(QuestionTable.getQuestionById(db, questionId)!.resolvedTime).toBeNull();
  });

  it("关联已有卡片：增加引用、自动进入探究中；解除关联只释放引用", () => {
    const question = QuestionTable.createQuestion(db, "B+ 树为什么适合索引？", groupId, doc(""));
    const card = insertCard("叶子链表支持范围扫描");

    QuestionLinkTable.linkTargets(
      db,
      question.id,
      [{ targetType: "card", targetId: card.cardId }],
      {
        incRef: true,
      }
    );
    expect(refCount(db, card.contentId)).toBe(2);
    expect(QuestionTable.getQuestionById(db, question.id)!.status).toBe("in_progress");

    // 重复关联被忽略
    expect(
      QuestionLinkTable.linkTargets(
        db,
        question.id,
        [{ targetType: "card", targetId: card.cardId }],
        {
          incRef: true,
        }
      )
    ).toEqual([]);

    QuestionLinkTable.unlinkTarget(db, question.id, { targetType: "card", targetId: card.cardId });
    expect(refCount(db, card.contentId)).toBe(1);
    expect(QuestionTable.getQuestionById(db, question.id)!.answers).toEqual([]);
    const types = QuestionEventTable.list(db, question.id).map(e =>
      e.type === "status" ? `status:${(e.payload as { to: string }).to}` : e.type
    );
    expect(types).toEqual(["create", "link", "status:in_progress", "unlink"]);
  });

  it("独立答案：旧 addAnswer 记为新建，解除关联后内容删除", () => {
    const question = QuestionTable.createQuestion(db, "TIME_WAIT 为什么 2MSL？", groupId, doc(""));
    const answer = QuestionTable.createAnswer(db, doc("可靠关闭 + 旧报文消亡"));
    QuestionTable.addAnswer(db, question.id, { contentId: answer.id, content: [] }, false);

    const detail = QuestionLinkTable.getDetail(db, question.id)!;
    expect(detail.materials[0]).toMatchObject({
      targetType: "answer",
      title: "可靠关闭 + 旧报文消亡",
    });
    expect(detail.events.find(e => e.type === "link")!.payload).toMatchObject({ created: true });

    QuestionTable.deleteAnswer(db, question.id, answer.id);
    expect(refCount(db, answer.id)).toBeNull();
  });

  it("项目与白板可关联，不参与 answers 缓存", () => {
    const question = QuestionTable.createQuestion(db, "协同编辑怎么选？", groupId, doc(""));
    const now = Date.now();
    const projectId = Number(
      db
        .prepare(
          `INSERT INTO project (create_time, update_time, title, "desc", children) VALUES (?, ?, 'Vibe Learning', '[]', '[1,2,3]')`
        )
        .run(now, now).lastInsertRowid
    );
    const boardId = Number(
      db
        .prepare(
          `INSERT INTO white_boards (create_time, update_time, title, description, white_board_content_ids) VALUES (?, ?, '对比图', '两种路线', '[1]')`
        )
        .run(now, now).lastInsertRowid
    );
    QuestionLinkTable.linkTargets(db, question.id, [
      { targetType: "project", targetId: projectId },
      { targetType: "white_board", targetId: boardId },
    ]);
    const { materials } = QuestionLinkTable.getDetail(db, question.id)!;
    expect(materials.map(m => [m.title, m.meta])).toEqual([
      ["Vibe Learning", "3 篇文档"],
      ["对比图", ""],
    ]);
    expect(QuestionTable.getQuestionById(db, question.id)!.answers).toEqual([]);

    // 目标被删后显示为失效，不报错
    db.prepare(`DELETE FROM white_boards WHERE id = ?`).run(boardId);
    expect(QuestionLinkTable.getDetail(db, question.id)!.materials[1].missing).toBe(true);
  });

  it("状态：无材料也可标为已解答；撤销删除事件并恢复", () => {
    const question = QuestionTable.createQuestion(db, "番茄钟 25 分钟有依据吗？", groupId, doc(""));
    const resolved = QuestionTable.updateQuestionStatus(db, question.id, "resolved");
    expect(resolved.resolvedTime).not.toBeNull();
    QuestionTable.updateQuestionStatus(db, question.id, "not_started", {
      revertEventId: resolved.eventId,
    });
    const after = QuestionTable.getQuestionById(db, question.id)!;
    expect(after.status).toBe("not_started");
    expect(after.resolvedTime).toBeNull();
    expect(QuestionEventTable.list(db, question.id).map(e => e.type)).toEqual(["create"]);
  });

  it("删除问题：释放全部引用并清理关联与轨迹", () => {
    const question = QuestionTable.createQuestion(db, "q", groupId, doc(""));
    const card = insertCard("c");
    QuestionLinkTable.linkTargets(
      db,
      question.id,
      [{ targetType: "card", targetId: card.cardId }],
      {
        incRef: true,
      }
    );
    QuestionEventTable.addNote(db, question.id, "读到一半");
    QuestionTable.deleteQuestion(db, question.id);
    expect(refCount(db, card.contentId)).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM question_link`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM question_event`).get()).toEqual({ n: 0 });
  });

  it("快速收集：#分组 按全名或前缀匹配，找不到落默认分组", () => {
    QuestionGroupTable.createGroup(db, { title: "编辑器原理" });
    expect(QuestionTable.captureQuestion(db, "IME 为什么重复字符", "编辑器").groupTitle).toBe(
      "编辑器原理"
    );
    expect(QuestionTable.captureQuestion(db, "随手一问", "不存在").groupId).toBe(groupId);
  });

  it("首页：探究中的问题带最近进展", () => {
    const question = QuestionTable.createQuestion(db, "FSRS 参数怎么拟合？", groupId, doc(""));
    QuestionTable.updateQuestionStatus(db, question.id, "in_progress");
    QuestionEventTable.addNote(db, question.id, "数据少时差别不大");
    const [preview] = QuestionLinkTable.listActive(db);
    expect(preview.id).toBe(question.id);
    expect(preview.lastEventTitle).toBe("数据少时差别不大");
  });
  it("材料选择器：按关键字检索卡片并标出已关联", () => {
    const question = QuestionTable.createQuestion(db, "q", groupId, doc(""));
    const hit = insertCard("B+ 树扇出");
    insertCard("TCP 握手");
    QuestionLinkTable.linkTargets(db, question.id, [{ targetType: "card", targetId: hit.cardId }], {
      incRef: true,
    });
    const found = QuestionLinkTable.searchTargets(db, {
      questionId: question.id,
      targetType: "card",
      keyword: "扇出",
    });
    expect(found.map(c => [c.title, c.linked])).toEqual([["B+ 树扇出", true]]);
    expect(
      QuestionLinkTable.searchTargets(db, { questionId: question.id, targetType: "card" })
    ).toHaveLength(2);
  });
});
