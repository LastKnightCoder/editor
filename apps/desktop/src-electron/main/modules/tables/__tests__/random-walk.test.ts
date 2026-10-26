import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WalkItem } from "@/types";
import RandomWalkTable from "../random-walk";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");

const TODAY = "2026-10-13";

let db: Database.Database;
let clock = 1_700_000_000_000;

const tick = () => clock++;

/** 插入一份正文，count 为字数 */
const insertContent = (text: string, count: number) =>
  Number(
    db
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, ?, 1)`
      )
      .run(tick(), tick(), JSON.stringify([{ type: "p", children: [{ text }] }]), count)
      .lastInsertRowid
  );

const insertCard = (contentId: number | null, tags: string[] = []) =>
  Number(
    db
      .prepare(`INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (?, ?, ?, ?)`)
      .run(tick(), tick(), JSON.stringify(tags), contentId).lastInsertRowid
  );

const insertArticle = (
  title: string,
  contentId: number | null,
  isDelete = 0,
  tags: string[] = []
) =>
  Number(
    db
      .prepare(
        `INSERT INTO articles (id, title, create_time, update_time, tags, links, is_delete, content_id)
         VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`
      )
      .run(null, title, tick(), tick(), JSON.stringify(tags), isDelete, contentId).lastInsertRowid
  );

const insertProjectDoc = (title: string, contentId: number, projects = "[]") =>
  Number(
    db
      .prepare(
        `INSERT INTO project_item (create_time, update_time, title, children, parents, projects, project_item_type, content_id, tags)
         VALUES (?, ?, ?, '[]', '[]', ?, 'document', ?, '[]')`
      )
      .run(tick(), tick(), title, projects, contentId).lastInsertRowid
  );

const insertDiaryMoment = (date: string, contentId: number) => {
  const diaryId = Number(
    db
      .prepare(
        `INSERT INTO diary_entries (type, date, content_id, tags, create_time, update_time)
         VALUES ('daily', ?, NULL, '[]', ?, ?)`
      )
      .run(date, tick(), tick()).lastInsertRowid
  );
  return Number(
    db
      .prepare(
        `INSERT INTO diary_segments (diary_id, content_id, tags, create_time, update_time)
         VALUES (?, ?, '[]', ?, ?)`
      )
      .run(diaryId, contentId, tick(), tick()).lastInsertRowid
  );
};

const insertPdfAnnotation = (pdfId: number, text: string, note: string, pageNum = 2) =>
  Number(
    db
      .prepare(
        `INSERT INTO pdf_annotations (pdf_id, page_num, annotation_payload, color, notes, type, create_time, update_time)
         VALUES (?, ?, ?, 'yellow', ?, 'text-markup', ?, ?)`
      )
      .run(
        pdfId,
        pageNum,
        JSON.stringify({ custom: { text } }),
        JSON.stringify([{ id: "n1", note: [{ text: note }] }]),
        tick(),
        tick()
      ).lastInsertRowid
  );

/** 插入一份过字数下限的正文（固定 40 字） */
const LONG = (text: string) => insertContent(`${text}，用来通过三十字的碎片下限校验。`, 40);

const insertPdf = (fileName: string, tags: string[] = []) =>
  Number(
    db
      .prepare(
        `INSERT INTO pdfs (create_time, update_time, tags, is_local, category, file_name)
         VALUES (?, ?, ?, 1, 'default', ?)`
      )
      .run(tick(), tick(), JSON.stringify(tags), fileName).lastInsertRowid
  );

const walkRefs = () =>
  (
    db.prepare(`SELECT kind, entity_id FROM walk_visits`).all() as Array<{
      kind: string;
      entity_id: number;
    }>
  ).map(row => ({ kind: row.kind, id: row.entity_id }));

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SQL);
});
afterEach(() => db.close());

describe("RandomWalkTable.pick 候选过滤", () => {
  it("五种实体可被抽中，字段口径正确（卡片 AI 标题优先、PDF 摘录与笔记、项目文档带项目名）", () => {
    const cardContent = insertContent(
      "一张足够长的卡片正文内容，用来通过三十字的碎片下限校验。",
      40
    );
    db.prepare(
      `INSERT INTO content_ai_meta (content_id, schema_ver, text_digest, meta, model, create_time, update_time)
       VALUES (?, 1, 'digest', ?, 'test/model', 1, 1)`
    ).run(cardContent, JSON.stringify({ title: "AI 起的标题" }));
    insertCard(cardContent, ["tag-a"]);

    let picked: WalkItem | null = null;
    for (let i = 0; i < 50 && !picked; i++) {
      const item = RandomWalkTable.pick(db, { bias: "random" });
      if (item?.ref.kind === "card") picked = item;
    }
    expect(picked).not.toBeNull();
    expect(picked?.title).toBe("AI 起的标题");
    expect(picked?.tags).toEqual(["tag-a"]);
    expect(picked?.contentId).toBe(cardContent);
    expect(picked?.content).toEqual([{ type: "p", children: [{ text: expect.any(String) }] }]);
    expect(picked?.reason).toEqual({ type: "random" });

    const articleContent = insertContent(
      "一篇足够长的文章正文，用来通过三十字的碎片下限校验。",
      40
    );
    insertArticle("旧文一篇", articleContent);
    let article: WalkItem | null = null;
    for (let i = 0; i < 80 && !article; i++) {
      const item = RandomWalkTable.pick(db, { bias: "random" });
      if (item?.ref.kind === "article") article = item;
    }
    expect(article?.title).toBe("旧文一篇");

    const docContent = insertContent(
      "一篇足够长的项目文档正文，用来通过三十字的碎片下限校验。",
      40
    );
    db.prepare(
      `INSERT INTO project (id, create_time, update_time, title, "desc", children)
       VALUES (7, 1, 1, '研究计划', NULL, '[]')`
    ).run();
    const docId = insertProjectDoc("项目里的文档", docContent, JSON.stringify([7]));
    let doc: WalkItem | null = null;
    for (let i = 0; i < 80 && !doc; i++) {
      const item = RandomWalkTable.pick(db, { bias: "random" });
      if (item?.ref.kind === "project-item") doc = item;
    }
    expect(doc?.title).toBe("项目里的文档");
    expect(doc?.source).toBe("研究计划");
    expect(doc?.ref.id).toBe(docId);

    const momentContent = insertContent(
      "一段足够长的日记碎碎念正文，用来通过三十字的碎片下限校验。",
      40
    );
    const momentId = insertDiaryMoment("2026-10-01", momentContent);
    let moment: WalkItem | null = null;
    for (let i = 0; i < 80 && !moment; i++) {
      const item = RandomWalkTable.pick(db, { bias: "random" });
      if (item?.ref.kind === "diary-moment") moment = item;
    }
    expect(moment?.ref.id).toBe(momentId);
    expect(moment?.title).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日$/);

    const pdfId = Number(
      db
        .prepare(
          `INSERT INTO pdfs (create_time, update_time, tags, is_local, category, file_name)
           VALUES (?, ?, '["pdf-tag"]', 1, 'default', '论文.pdf')`
        )
        .run(tick(), tick()).lastInsertRowid
    );
    const annotationId = insertPdfAnnotation(
      pdfId,
      "这是 PDF 里被划线摘录出来的一句原文，长度足以超过三十字的下限要求。",
      "当年读到这里的想法记录。"
    );
    let annotation: WalkItem | null = null;
    for (let i = 0; i < 200 && !annotation; i++) {
      const item = RandomWalkTable.pick(db, { bias: "random" });
      if (item?.ref.kind === "pdf-annotation") annotation = item;
    }
    expect(annotation?.ref.id).toBe(annotationId);
    expect(annotation?.excerpt).toContain("被划线摘录");
    expect(annotation?.note).toBe("当年读到这里的想法记录。");
    expect(annotation?.source).toBe("论文.pdf · 第 3 页");
    expect(annotation?.content).toBeNull();
    expect(annotation?.contentId).toBeNull();
    expect(annotation?.tags).toEqual(["pdf-tag"]);
  });

  it("字数不足的碎片、软删文章、非文档项目项、短批注都不进池；池空返回 null", () => {
    const tinyContent = insertContent("太短", 3);
    insertCard(tinyContent);
    const articleContent = insertContent(
      "一篇足够长的文章正文，用来通过三十字的碎片下限校验。",
      40
    );
    insertArticle("已删文章", articleContent, 1);
    db.prepare(
      `INSERT INTO project_item (create_time, update_time, title, children, parents, projects, project_item_type, white_board_content_id, tags)
       VALUES (?, ?, '白板项', '[]', '[]', '[]', 'white-board', 1, '[]')`
    ).run(tick(), tick());
    const pdfId = Number(
      db
        .prepare(
          `INSERT INTO pdfs (create_time, update_time, tags, is_local, category, file_name)
           VALUES (?, ?, '[]', 1, 'default', '短批注.pdf')`
        )
        .run(tick(), tick()).lastInsertRowid
    );
    insertPdfAnnotation(pdfId, "短", "");

    expect(RandomWalkTable.pick(db, { bias: "stale" })).toBeNull();
    expect(RandomWalkTable.pick(db, { bias: "random" })).toBeNull();
    expect(RandomWalkTable.pick(db, { bias: "on-this-day" })).toBeNull();
  });

  it("mute 后不再被抽中，mark-seen 更新时间与次数并参与 stale 权重", () => {
    const content = insertContent("唯一的一张够长的卡片正文，用来通过三十字的碎片下限校验。", 40);
    const cardId = insertCard(content);
    const ref = { kind: "card" as const, id: cardId };

    RandomWalkTable.markSeen(db, ref);
    RandomWalkTable.markSeen(db, ref);
    const visit = db
      .prepare(
        `SELECT last_seen_time, seen_count, muted FROM walk_visits WHERE kind = 'card' AND entity_id = ?`
      )
      .get(cardId) as { last_seen_time: number; seen_count: number; muted: number };
    expect(visit.seen_count).toBe(2);
    expect(visit.muted).toBe(0);
    expect(visit.last_seen_time).toBeGreaterThan(0);

    const seen = RandomWalkTable.pick(db, { bias: "stale" });
    expect(seen?.ref).toEqual(ref);
    expect(seen?.lastSeenTime).toBe(visit.last_seen_time);
    expect(seen?.reason.type).toBe("stale");

    RandomWalkTable.mute(db, ref);
    expect(RandomWalkTable.pick(db, { bias: "stale" })).toBeNull();
    expect(walkRefs()).toEqual([ref]);
  });

  it("exclude 生效", () => {
    const content = insertContent("唯一的一张够长的卡片正文，用来通过三十字的碎片下限校验。", 40);
    const cardId = insertCard(content);
    expect(
      RandomWalkTable.pick(db, { bias: "random", exclude: [{ kind: "card", id: cardId }] })
    ).toBeNull();
  });

  it("kinds 过滤候选：只抽指定类型，缺省 / 空数组 / 全部非法值 = 全部", () => {
    const cardContent = insertContent(
      "一张足够长的卡片正文内容，用来通过三十字的碎片下限校验。",
      40
    );
    insertCard(cardContent);
    const articleContent = insertContent(
      "一篇足够长的文章正文，用来通过三十字的碎片下限校验。",
      40
    );
    insertArticle("旧文一篇", articleContent);

    for (let i = 0; i < 20; i++) {
      expect(RandomWalkTable.pick(db, { bias: "random", kinds: ["article"] })?.ref.kind).toBe(
        "article"
      );
    }
    expect(RandomWalkTable.pick(db, { bias: "random", kinds: ["pdf-annotation"] })).toBeNull();
    expect(RandomWalkTable.pick(db, { bias: "random", kinds: [] })).not.toBeNull();
    expect(RandomWalkTable.pick(db, { bias: "random", kinds: ["not-a-kind"] })).not.toBeNull();
  });
});

describe("RandomWalkTable 今日牌堆", () => {
  const seedPool = (count: number) => {
    for (let i = 0; i < count; i++) {
      const content = insertContent(
        `第 ${i} 张足够长的卡片正文，用来通过三十字的碎片下限校验。`,
        40
      );
      insertCard(content);
    }
  };

  it("当天幂等：同日重复调用返回同一叠牌，不重新抽", () => {
    seedPool(20);
    const first = RandomWalkTable.dailyDeck(db, { date: TODAY });
    expect(first.date).toBe(TODAY);
    expect(first.cursor).toBe(0);
    expect(first.items).toHaveLength(5);
    expect(new Set(first.items.map(item => item.ref.id)).size).toBe(5);

    const second = RandomWalkTable.dailyDeck(db, { date: TODAY });
    expect(second.items.map(item => item.ref.id)).toEqual(first.items.map(item => item.ref.id));
  });

  it("那年今日的内容优先排在首位", () => {
    const todayContent = insertContent(
      "一张普通的够长卡片正文，用来通过三十字的碎片下限校验。",
      40
    );
    insertCard(todayContent);
    const momentContent = insertContent(
      "去年今日写下的足够长的日记正文，用来通过三十字的碎片下限校验。",
      40
    );
    insertDiaryMoment("2025-10-13", momentContent);

    const deck = RandomWalkTable.dailyDeck(db, { date: TODAY });
    expect(deck.items[0].ref.kind).toBe("diary-moment");
    expect(deck.items[0].reason).toEqual({ type: "on-this-day", years: 1 });
    expect(deck.items.slice(1).every(item => item.reason.type === "stale")).toBe(true);
  });

  it("reroll 换一叠不与当天已出现的重复，游标归零", () => {
    seedPool(20);
    const first = RandomWalkTable.dailyDeck(db, { date: TODAY });
    RandomWalkTable.dailyAdvance(db, { date: TODAY, cursor: 3 });
    expect(
      (
        db.prepare(`SELECT cursor FROM walk_daily_decks WHERE date = ?`).get(TODAY) as {
          cursor: number;
        }
      ).cursor
    ).toBe(3);

    const rerolled = RandomWalkTable.dailyReroll(db, { date: TODAY });
    expect(rerolled.cursor).toBe(0);
    expect(rerolled.items).toHaveLength(5);
    const firstIds = new Set(first.items.map(item => item.ref.id));
    expect(rerolled.items.some(item => firstIds.has(item.ref.id))).toBe(false);
  });

  it("失效实体在读取时被过滤，游标按剩余张数收敛", () => {
    seedPool(10);
    const first = RandomWalkTable.dailyDeck(db, { date: TODAY });
    RandomWalkTable.dailyAdvance(db, { date: TODAY, cursor: 2 });
    db.prepare(`DELETE FROM cards WHERE id = ?`).run(first.items[4].ref.id);

    const deck = RandomWalkTable.dailyDeck(db, { date: TODAY });
    expect(deck.items.map(item => item.ref.id)).not.toContain(first.items[4].ref.id);
    expect(deck.items).toHaveLength(4);
    expect(deck.cursor).toBe(2);
  });

  it("空池落库空牌堆且不抛错", () => {
    const deck = RandomWalkTable.dailyDeck(db, { date: TODAY });
    expect(deck).toEqual({ date: TODAY, items: [], cursor: 0 });
  });
});

describe("RandomWalkTable.sameTag 同标签岔路", () => {
  it("按交集标签数降序、同数按 stale 天数降序，sharedTag 取首个共同标签", () => {
    const selfId = insertCard(LONG("当前漫步到的卡片正文"), ["思维", "写作"]);
    const bothRecent = insertCard(LONG("两个交集标签且最近更新的卡片正文"), [
      "思维",
      "写作",
      "其它",
    ]);
    const bothOld = insertCard(LONG("两个交集标签且很久没动的卡片正文"), ["写作", "思维"]);
    const single = insertCard(LONG("只有一个交集标签的卡片正文"), ["思维"]);
    insertCard(LONG("毫无交集标签的卡片正文"), ["读书"]);
    db.prepare(`UPDATE cards SET update_time = ? WHERE id = ?`).run(
      clock - 40 * 86_400_000,
      bothOld
    );

    const neighbors = RandomWalkTable.sameTag(db, {
      ref: { kind: "card", id: selfId },
      tags: ["思维", "写作"],
    });
    expect(neighbors.map(n => n.ref.id)).toEqual([bothOld, bothRecent, single]);
    expect(neighbors.every(n => n.relation === "tag")).toBe(true);
    expect(neighbors[0].sharedTag).toBe("写作");
    expect(neighbors[1].sharedTag).toBe("思维");
  });

  it("排除自身、exclude、muted 与字数不足碎片；limit 默认 3、上限 10", () => {
    const selfId = insertCard(LONG("当前漫步到的卡片正文"), ["tag"]);
    const ids = Array.from({ length: 13 }, (_, i) =>
      insertCard(LONG(`第 ${i} 张同标签卡片正文`), ["tag"])
    );
    insertCard(insertContent("太短", 3), ["tag"]);
    RandomWalkTable.mute(db, { kind: "card", id: ids[1] });
    const excluded = ids[0];

    const defaults = RandomWalkTable.sameTag(db, {
      ref: { kind: "card", id: selfId },
      tags: ["tag"],
    });
    expect(defaults).toHaveLength(3);

    const capped = RandomWalkTable.sameTag(db, {
      ref: { kind: "card", id: selfId },
      tags: ["tag"],
      exclude: [{ kind: "card", id: excluded }],
      limit: 99,
    });
    expect(capped).toHaveLength(10);
    const resultIds = capped.map(n => n.ref.id);
    expect(resultIds).not.toContain(selfId);
    expect(resultIds).not.toContain(excluded);
    expect(resultIds).not.toContain(ids[1]);
  });

  it("跨实体匹配；PDF 批注按所属 pdfs.tags 匹配", () => {
    const selfId = insertCard(LONG("当前漫步到的卡片正文"), ["灵感"]);
    const articleId = insertArticle("灵感文章", LONG("一篇带灵感标签的文章正文"), 0, ["灵感"]);
    const pdfId = insertPdf("论文.pdf", ["灵感"]);
    const annotationId = insertPdfAnnotation(
      pdfId,
      "这是 PDF 里被划线摘录出来的一句原文，长度足以超过三十字的下限要求。",
      ""
    );
    insertArticle("无关文章", LONG("一篇没有标签交集的文章正文"), 0, ["读书"]);

    const neighbors = RandomWalkTable.sameTag(db, {
      ref: { kind: "card", id: selfId },
      tags: ["灵感"],
    });
    // 各表自增 id 可能撞号，按 kind + id 断言
    const keys = neighbors.map(n => `${n.ref.kind}:${n.ref.id}`);
    expect(keys).toContain(`article:${articleId}`);
    expect(keys).toContain(`pdf-annotation:${annotationId}`);
    const annotation = neighbors.find(n => n.ref.kind === "pdf-annotation");
    expect(annotation?.sharedTag).toBe("灵感");
    expect(annotation?.title).toContain("被划线摘录");
  });

  it("空标签或无交集返回空数组", () => {
    const selfId = insertCard(LONG("当前漫步到的卡片正文"), ["思维"]);
    expect(RandomWalkTable.sameTag(db, { ref: { kind: "card", id: selfId }, tags: [] })).toEqual(
      []
    );
    expect(
      RandomWalkTable.sameTag(db, { ref: { kind: "card", id: selfId }, tags: ["不存在的标签"] })
    ).toEqual([]);
  });
});

describe("RandomWalkTable.get", () => {
  it("取池内实体的完整内容，reason 按 stale 口径", () => {
    const contentId = insertContent("一张足够长的卡片正文内容，用来通过三十字的碎片下限校验。", 40);
    const cardId = insertCard(contentId, ["tag-a"]);

    const item = RandomWalkTable.get(db, { kind: "card", id: cardId });
    expect(item?.title).toContain("一张足够长的卡片正文内容");
    expect(item?.tags).toEqual(["tag-a"]);
    expect(item?.contentId).toBe(contentId);
    expect(item?.reason.type).toBe("stale");
    if (item?.reason.type === "stale") expect(item.reason.days).toBeGreaterThan(0);
  });

  it("muted、碎片、不存在的实体返回 null", () => {
    const muted = insertCard(LONG("一张足够长的卡片正文"));
    RandomWalkTable.mute(db, { kind: "card", id: muted });
    expect(RandomWalkTable.get(db, { kind: "card", id: muted })).toBeNull();
    expect(RandomWalkTable.get(db, { kind: "card", id: 99999 })).toBeNull();
    const tiny = insertCard(insertContent("太短", 3));
    expect(RandomWalkTable.get(db, { kind: "card", id: tiny })).toBeNull();
  });
});
