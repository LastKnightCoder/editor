import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import { searchResultDetails } from "../../search-details";
import CardTable from "../card";
import ContentAiMetaTable, { contentTitle, contentTitles } from "../content-ai-meta";
import EntitySearchTable from "../entity-search";
import KnowledgeMapTable from "../knowledge-map";

const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const meta = (title: string) => ({ title, summary: "要点", concepts: [], claims: [] });

describe("卡片标题：AI 标题 → 正文开头", () => {
  let db: Database.Database;
  let withAi: { id: number; contentId: number };
  let plain: { id: number; contentId: number };

  const addCard = (lines: string[]) => {
    const contentId = Number(
      db
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 10, 1)`
        )
        .run(JSON.stringify(lines.map(paragraph))).lastInsertRowid
    );
    const id = Number(
      db
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)`
        )
        .run(contentId).lastInsertRowid
    );
    return { id, contentId };
  };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    withAi = addCard(["第一段开头文字", "第二段"]);
    plain = addCard(["没有元信息的   卡片开头", "余下"]);
    ContentAiMetaTable.upsert(db, {
      contentId: withAi.contentId,
      textDigest: "d",
      meta: meta("AI 概括的标题"),
      model: "p/m",
    });
  });
  afterEach(() => db.close());

  it("批量取：AI 标题优先，缺的取第一块前 N 字（空白折叠）；fallback 为 0 时只给 AI 标题", () => {
    expect(contentTitles(db, [withAi.contentId, plain.contentId, 999], 6)).toEqual(
      new Map([
        [withAi.contentId, "AI 概括的标题"],
        [plain.contentId, "没有元信息的"],
      ])
    );
    expect([...contentTitles(db, [withAi.contentId, plain.contentId], 0).keys()]).toEqual([
      withAi.contentId,
    ]);
    // 只有图片的正文记了空元信息：视同没有 AI 标题
    ContentAiMetaTable.upsert(db, {
      contentId: plain.contentId,
      textDigest: "d",
      meta: meta(""),
      model: "",
    });
    expect(contentTitle(db, plain.contentId, 80)).toBe("没有元信息的 卡片开头");
  });

  it("卡片查询结果带 aiTitle（列表轻表与详情）", () => {
    const list = CardTable.getScopedCards(db, { databaseName: db.name });
    expect(list.find(card => card.id === withAi.id)?.aiTitle).toBe("AI 概括的标题");
    expect(list.find(card => card.id === plain.id)?.aiTitle).toBeUndefined();
    expect(CardTable.getCardById(db, withAi.id)?.aiTitle).toBe("AI 概括的标题");
    expect(searchResultDetails(db, "card", withAi.id)?.title).toBe("AI 概括的标题");
    expect(searchResultDetails(db, "card", plain.id)?.title).toBe("");
  });

  it("实体检索（脉络、命令面板的身份解析）：有 AI 标题时开头留在摘要里", () => {
    expect(EntitySearchTable.resolve(db, "card", withAi.id, 0)).toMatchObject({
      title: "AI 概括的标题",
      excerpt: "第一段开头文字 第二段",
    });
    expect(EntitySearchTable.resolve(db, "card", plain.id, 0)).toMatchObject({
      title: "没有元信息的   卡片开头",
      excerpt: "余下",
    });
  });

  it("知识地图卡片节点标题", () => {
    const indexDb = new Database(":memory:");
    indexDb.exec(indexSchema);
    const items = KnowledgeMapTable.listItems(db, indexDb);
    expect(items.find(item => item.key === `card:${withAi.id}`)?.title).toBe("AI 概括的标题");
    expect(items.find(item => item.key === `card:${plain.id}`)?.title).toBe(
      "没有元信息的 卡片开头"
    );
    indexDb.close();
  });
});
