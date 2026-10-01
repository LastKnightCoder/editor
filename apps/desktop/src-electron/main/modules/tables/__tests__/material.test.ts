import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "@tau/db-schema/schema/main.sql?raw";
import ExcerptTable from "../excerpt";
import MaterialTable from "../material";

const input = (externalId: string, quote: string) => ({
  externalId,
  quote,
  note: "想法",
  anchor: { chapterUid: 1, chapterIdx: 1, chapterTitle: "第一章", range: "1-2" },
  color: null,
  sourceTime: null,
});

describe("MaterialTable.resolve", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
  });
  afterEach(() => db.close());

  it("微信读书摘录：打开到单书页对应划线；只有想法的条目不带划线；软删除不可打开", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      input("b1:bm_1", "一句话"),
      input("b1:review:r9", "摘要"),
    ]);
    const [hl, review] = ExcerptTable.listActive(db);
    const [a, b] = MaterialTable.resolve(db, [
      { kind: "excerpt", id: hl.id },
      { kind: "excerpt", id: review.id },
    ]);
    expect(a).toMatchObject({
      title: "一句话",
      meta: "微信读书 · 《置身事内》 · 第一章",
      note: "想法",
      deleted: false,
      open: { page: "weread-book", bookId: "b1", bookmark: "bm_1" },
    });
    expect(b.open).toEqual({ page: "weread-book", bookId: "b1" });

    ExcerptTable.deleteSource(db, "weread", "b1");
    expect(MaterialTable.resolveOne(db, { kind: "excerpt", id: hl.id })).toMatchObject({
      quote: "一句话",
      deleted: true,
      open: null,
    });
  });

  it("网页摘录打开浏览器并带划线 hash", () => {
    ExcerptTable.syncSource(db, "web", "https://a.com/p", "", [
      { ...input("u-1", "网页里的话"), anchor: null },
    ]);
    const [excerpt] = ExcerptTable.listActive(db);
    expect(MaterialTable.resolveOne(db, { kind: "excerpt", id: excerpt.id })).toMatchObject({
      meta: "网页 · a.com",
      open: { page: "external-url", url: "https://a.com/p#tau-hl=u-1" },
    });
  });

  it("PDF 标注：原文、批注、页码；剪藏经谱系找到网页条目；不存在的不返回", () => {
    db.prepare(
      `INSERT INTO pdfs (id, create_time, update_time, tags, is_local, file_name, file_path)
       VALUES (1, 0, 0, '[]', 1, '论文.pdf', '/x.pdf')`
    ).run();
    db.prepare(
      `INSERT INTO pdf_annotations (id, create_time, update_time, pdf_id, page_num, annotation_payload, notes)
       VALUES (5, 0, 0, 1, 2, ?, ?)`
    ).run(
      JSON.stringify({ custom: { text: "高亮原文" } }),
      JSON.stringify([{ id: "n", note: [{ type: "paragraph", children: [{ text: "批注" }] }] }])
    );
    db.prepare(
      `INSERT INTO project_item (id, create_time, update_time, title, project_item_type)
       VALUES (9, 0, 0, '网页', 'web-view')`
    ).run();
    db.prepare(
      `INSERT INTO web_clip (id, create_time, update_time, content_id, url, title)
       VALUES (3, 0, 0, 1, 'https://b.com/x', '文章标题')`
    ).run();
    db.prepare(
      `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time)
       VALUES ('project-item', '9', 'web-clip', '3', 'clipped_from', 0)`
    ).run();

    const infos = MaterialTable.resolve(db, [
      { kind: "pdf-annotation", id: 5 },
      { kind: "web-clip", id: 3 },
      { kind: "pdf-annotation", id: 404 },
    ]);
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({
      title: "高亮原文",
      meta: "PDF · 论文.pdf · 第 3 页",
      note: "批注",
      open: { page: "pdf-detail", pdfId: 1, annotationId: 5 },
    });
    expect(infos[1]).toMatchObject({
      title: "文章标题",
      open: { page: "project-web-clip", itemId: 9 },
    });
  });
});
