import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ContentLinkTable from "../content-link";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");

let db: Database.Database;
let clock = 1_000;

const insertContent = () =>
  Number(
    db
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, '[]', 0, 1)`
      )
      .run(clock, clock++).lastInsertRowid
  );
const insertCard = (contentId: number, links: number[] = []) =>
  Number(
    db
      .prepare(
        `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, ?, '[]', ?, ?)`
      )
      .run(clock, clock++, JSON.stringify(links), contentId).lastInsertRowid
  );
const edges = () =>
  db
    .prepare(
      `SELECT content_id, target_content_id FROM content_links ORDER BY content_id, target_content_id`
    )
    .all() as Array<{ content_id: number; target_content_id: number }>;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(MAIN_SQL);
});
afterEach(() => db.close());

describe("ContentLinkTable.migrateCardsLinks（与移动端 migrate_v5_to_v6 同语义）", () => {
  it("双边冗余收敛为无向边、悬空目标丢弃、共用正文不互连、迁移后清空且幂等", () => {
    const a = insertContent();
    const b = insertContent();
    const c = insertContent();
    const cardA = insertCard(a);
    const cardB = insertCard(b, [cardA]);
    const cardC = insertCard(c);
    // 与 cardA 共用同一份正文的卡：不与 cardA 互连；悬空目标 99 丢弃
    const sharing = insertCard(a);
    db.prepare(`UPDATE cards SET links = ? WHERE id = ?`).run(
      JSON.stringify([cardB, cardC, 99, sharing]),
      cardA
    );

    ContentLinkTable.migrateCardsLinks(db);
    expect(edges()).toEqual([
      { content_id: Math.min(a, b), target_content_id: Math.max(a, b) },
      { content_id: Math.min(a, c), target_content_id: Math.max(a, c) },
    ]);
    // cards.links 全部清空
    const remaining = db
      .prepare(
        `SELECT COUNT(*) AS n FROM cards WHERE links IS NOT NULL AND links NOT IN ('[]', '', 'null')`
      )
      .get() as { n: number };
    expect(remaining.n).toBe(0);
    // 幂等：再次执行不再命中护栏，边数不变
    ContentLinkTable.migrateCardsLinks(db);
    expect(edges()).toHaveLength(2);
  });

  it("空库与全部空 links 直接跳过", () => {
    insertCard(insertContent());
    ContentLinkTable.migrateCardsLinks(db);
    expect(edges()).toEqual([]);
  });
});

describe("ContentLinkTable 边操作", () => {
  it("addLink 规范化落边、removeLink 双向精确删、同正文拒连", () => {
    const a = insertContent();
    const b = insertContent();
    const cardA = insertCard(a);
    insertCard(b);

    expect(ContentLinkTable.addLink(db, { kind: "card", id: cardA }, { kind: "card", id: 2 })).toBe(
      true
    );
    // 重复连接返回 false，不产生第二条边
    expect(ContentLinkTable.addLink(db, { kind: "card", id: 2 }, { kind: "card", id: cardA })).toBe(
      false
    );
    expect(edges()).toEqual([{ content_id: Math.min(a, b), target_content_id: Math.max(a, b) }]);
    expect(
      ContentLinkTable.removeLink(db, { kind: "card", id: cardA }, { kind: "card", id: 2 })
    ).toBe(true);
    expect(
      ContentLinkTable.removeLink(db, { kind: "card", id: cardA }, { kind: "card", id: 2 })
    ).toBe(false);
    expect(edges()).toEqual([]);
  });

  it("edgesOf 双向收集邻居（两侧任一方向都算）", () => {
    const a = insertContent();
    const b = insertContent();
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(a, b), Math.max(a, b), clock);
    const map = ContentLinkTable.edgesOf(db, [b]);
    expect(map.get(b)).toEqual([a]);
  });

  it("removeLink 与存储方向无关（反向参数也能删）", () => {
    const a = insertContent();
    const b = insertContent();
    const cardA = insertCard(a);
    const cardB = insertCard(b);
    ContentLinkTable.addLink(db, { kind: "card", id: cardA }, { kind: "card", id: cardB });
    expect(
      ContentLinkTable.removeLink(db, { kind: "card", id: cardB }, { kind: "card", id: cardA })
    ).toBe(true);
    expect(edges()).toEqual([]);
  });
});

describe("ContentLinkTable.listByContentIds（表格连接列数据源）", () => {
  const insertArticle = (title: string, contentId: number) =>
    Number(
      db
        .prepare(
          `INSERT INTO articles (create_time, update_time, title, author, tags, links, content_id)
           VALUES (?, ?, ?, '', '[]', '[]', ?)`
        )
        .run(clock, clock++, title, contentId).lastInsertRowid
    );
  const insertProjectItem = (title: string, contentId: number) =>
    Number(
      db
        .prepare(
          `INSERT INTO project_item (create_time, update_time, title, content_id, children, parents, projects, project_item_type)
           VALUES (?, ?, ?, ?, '[]', '[]', '[]', 'document')`
        )
        .run(clock, clock++, title, contentId).lastInsertRowid
    );

  it("双向归组、代表身份解析、悬空边过滤；共用正文一方的连接从任一身份可见", () => {
    const cardContent = insertContent();
    const articleContent = insertContent();
    const cardId = insertCard(cardContent);
    insertArticle("渲染笔记", articleContent);
    // 项目文档共用卡片正文（refType='card' 的创建路径）
    insertProjectItem("渲染篇", cardContent);
    ContentLinkTable.addLink(db, { kind: "card", id: cardId }, { kind: "article", id: 1 });
    // 悬空边：两端都无身份（指向不存在实体的正文）
    const orphan = insertContent();
    const orphan2 = insertContent();
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(orphan, orphan2), Math.max(orphan, orphan2), clock++);

    const groups = ContentLinkTable.listByContentIds(db, [cardContent, articleContent]);
    const byContent = new Map(groups.map(group => [group.contentId, group.targets]));
    // 卡片正文一侧：目标是文章（代表身份 + 标题 + 落点正文）
    expect(byContent.get(cardContent)).toEqual([
      { ref: { kind: "article", id: 1 }, title: "渲染笔记", contentId: articleContent },
    ]);
    // 文章一侧：共用正文的代表身份是卡片（ENTITY_REF_PRIORITY 卡片优先）；
    // 卡片正文为空 → resolve 标题回落「无标题卡片」
    expect(byContent.get(articleContent)).toEqual([
      { ref: { kind: "card", id: cardId }, title: "无标题卡片", contentId: cardContent },
    ]);
    // 悬空边不出现
    expect(groups).toHaveLength(2);
  });

  it("同一身份多份正文作目标时 contentId 逐边回填（缓存不串值）", () => {
    // 日记两天各一段正文，都被同一张卡连接：目标是同一 diary 身份，但落点正文不同
    const seg1 = insertContent();
    const seg2 = insertContent();
    const src = insertContent();
    insertCard(src);
    const diaryId = Number(
      db
        .prepare(
          `INSERT INTO diary_entries (create_time, update_time, type, date, content_id) VALUES (?, ?, 'daily', '2026-10-01', NULL)`
        )
        .run(clock, clock++).lastInsertRowid
    );
    const insertSegment = (contentId: number) =>
      db
        .prepare(
          `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
        )
        .run(clock, clock++, diaryId, contentId);
    insertSegment(seg1);
    insertSegment(seg2);
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(src, seg1), Math.max(src, seg1), clock++);
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(src, seg2), Math.max(src, seg2), clock++);

    const [group] = ContentLinkTable.listByContentIds(db, [src]);
    // 两条边的目标身份都是 diary:<diaryId>，但 contentId 必须各自等于 seg1/seg2
    expect(group.targets.map(target => [target.ref.kind, target.contentId])).toEqual([
      ["diary", seg1],
      ["diary", seg2],
    ]);
  });
});
