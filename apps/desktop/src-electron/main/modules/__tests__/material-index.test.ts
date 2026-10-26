import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));

import ExcerptTable from "../tables/excerpt";
import FTSTable from "../tables/fts";
import { listMaterialIndexDocs } from "../material-index";
import { searchResultDetails } from "../search-details";

const paragraph = (text: string) => [
  { type: "paragraph", children: [{ type: "formatted", text }] },
];

describe("外部材料进索引（KL-037）", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(mainSchema);
    db.exec("INSERT INTO excerpt_provider VALUES ('weread', '微信读书', 0)");
  });
  afterEach(() => db.close());

  const seed = () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:1",
        quote: "地方政府",
        note: "关键",
        anchor: { chapterUid: 1, chapterIdx: 1, chapterTitle: "第一章", range: "1-2" },
        color: null,
        sourceTime: null,
        location: "第一章",
        url: null,
      },
      {
        externalId: "b1:2",
        quote: "将被删除",
        note: "",
        anchor: null,
        color: null,
        sourceTime: null,
        location: "",
        url: null,
      },
    ]);
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      {
        externalId: "b1:1",
        quote: "地方政府",
        note: "关键",
        anchor: { chapterUid: 1, chapterIdx: 1, chapterTitle: "第一章", range: "1-2" },
        color: null,
        sourceTime: null,
        location: "第一章",
        url: null,
      },
    ]);
    db.prepare(
      `INSERT INTO pdfs (id, create_time, update_time, tags, is_local, file_name, file_path)
       VALUES (1, 0, 0, '[]', 1, '论文.pdf', '/x.pdf')`
    ).run();
    const insertAnnotation = db.prepare(
      `INSERT INTO pdf_annotations (id, create_time, update_time, pdf_id, page_num, annotation_payload, notes)
       VALUES (?, 0, 7, 1, 0, ?, '[]')`
    );
    insertAnnotation.run(1, JSON.stringify({ custom: { text: "高亮" } }));
    insertAnnotation.run(2, JSON.stringify({ contents: "" })); // 区域截图，无原文无批注
    db.prepare(
      `INSERT INTO contents (id, create_time, update_time, content, count) VALUES (1, 0, 50, ?, 0), (2, 0, 0, ?, 0)`
    ).run(JSON.stringify(paragraph("解析后的正文")), JSON.stringify(paragraph("孤儿")));
    db.prepare(
      `INSERT INTO project_item (id, create_time, update_time, title, project_item_type) VALUES (9, 0, 0, '网页', 'web-view')`
    ).run();
    db.prepare(
      `INSERT INTO web_clip (id, create_time, update_time, content_id, url, title)
       VALUES (3, 0, 10, 1, 'https://b.com/x', '剪藏标题'), (4, 0, 10, 2, 'https://c.com', '孤儿剪藏')`
    ).run();
    db.prepare(
      `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time)
       VALUES ('project-item', '9', 'web-clip', '3', 'clipped_from', 0)`
    ).run();
  };

  it("候选：软删摘录、无文字标注、孤儿剪藏不进；嵌入文本带来源上下文；剪藏时间取正文与剪藏较新者", async () => {
    seed();
    const docs = await listMaterialIndexDocs(db);
    expect(docs.map(d => `${d.type}:${d.id}`)).toEqual([
      "excerpt:1",
      "pdf-annotation:1",
      "web-clip:3",
    ]);
    expect(docs[0].content).toBe("置身事内 › 第一章\n地方政府\n想法：关键");
    expect(docs[1].content).toBe("论文.pdf · 第 1 页\n高亮");
    expect(docs[2]).toMatchObject({ content: "剪藏标题\n解析后的正文", updateTime: 50 });
  });

  it("检索命中的材料带展示信息与打开目标；已软删的不返回", () => {
    seed();
    const excerpt = searchResultDetails(db, "excerpt", 1);
    expect(excerpt).toMatchObject({
      contentId: 0,
      title: "地方政府",
      material: {
        meta: "微信读书 · 置身事内 · 第一章",
        open: { page: "excerpt-provider", sourceType: "weread", sourceKey: "b1" },
      },
    });
    expect(searchResultDetails(db, "excerpt", 2)).toBeNull();
    expect(searchResultDetails(db, "web-clip", 3)).toMatchObject({
      contentId: 1,
      material: { open: { page: "project-web-clip", itemId: 9 } },
    });
  });

  it("全文索引对账清理：不在候选里的类型内文档被删，其他类型不动", () => {
    const indexDb = new Database(":memory:");
    indexDb.exec(indexSchema);
    const insert = indexDb.prepare(
      `INSERT INTO content_fts (prefixed_id, update_time, content, type, title, chunk_index) VALUES (?, 0, 'x', ?, '', 0)`
    );
    insert.run("excerpt:1", "excerpt");
    insert.run("excerpt:2", "excerpt");
    insert.run("card:5", "card");
    insert.run("legacy:1", "legacy");
    expect(FTSTable.removeIndexesNotIn(indexDb, new Set(["excerpt:1"]), ["excerpt", "card"])).toBe(
      2
    );
    const left = indexDb.prepare("SELECT prefixed_id FROM content_fts ORDER BY prefixed_id").all();
    expect(left).toEqual([{ prefixed_id: "excerpt:1" }, { prefixed_id: "legacy:1" }]);
    indexDb.close();
  });
});
