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
const insertCard = (contentId: number) =>
  Number(
    db
      .prepare(
        `INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (?, ?, '[]', ?)`
      )
      .run(clock, clock++, contentId).lastInsertRowid
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

describe("ContentLinkTable 边操作", () => {
  it("同一天两条日记各自连接到正文，解除其中一条不影响另一条", () => {
    const cardContent = insertContent();
    const firstContent = insertContent();
    const secondContent = insertContent();
    const cardId = insertCard(cardContent);
    db.exec(
      "INSERT INTO diary_entries (id, type, date, create_time, update_time) VALUES (5, 'daily', '2026-10-08', 1, 1)"
    );
    const insertMoment = db.prepare(
      "INSERT INTO diary_segments (id, diary_id, content_id, create_time, update_time) VALUES (?, 5, ?, 1, 1)"
    );
    insertMoment.run(11, firstContent);
    insertMoment.run(12, secondContent);
    const card = { kind: "card" as const, id: cardId };
    const first = { kind: "diary-moment" as const, id: 11 };
    const second = { kind: "diary-moment" as const, id: 12 };
    expect(ContentLinkTable.contentIdsOfEntity(db, second)).toEqual([secondContent]);
    expect(ContentLinkTable.addLink(db, card, first)).toBe(true);
    expect(ContentLinkTable.addLink(db, card, second)).toBe(true);
    expect(
      ContentLinkTable.listByContentIds(db, [cardContent])[0].targets.map(target => target.ref)
    ).toEqual([first, second]);
    expect(ContentLinkTable.removeLink(db, card, second)).toBe(true);
    expect(ContentLinkTable.edgesOf(db, [cardContent]).get(cardContent)).toEqual([firstContent]);
  });

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

  it("同日两条日记的目标身份与 contentId 逐边回填，缓存不串值", () => {
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
      Number(
        db
          .prepare(
            `INSERT INTO diary_segments (create_time, update_time, diary_id, content_id) VALUES (?, ?, ?, ?)`
          )
          .run(clock, clock++, diaryId, contentId).lastInsertRowid
      );
    const first = insertSegment(seg1);
    const second = insertSegment(seg2);
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(src, seg1), Math.max(src, seg1), clock++);
    db.prepare(
      `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, ?)`
    ).run(Math.min(src, seg2), Math.max(src, seg2), clock++);

    const [group] = ContentLinkTable.listByContentIds(db, [src]);
    expect(group.targets.map(target => [target.ref.kind, target.ref.id, target.contentId])).toEqual(
      [
        ["diary-moment", first, seg1],
        ["diary-moment", second, seg2],
      ]
    );
  });
});
