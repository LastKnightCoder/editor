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
  location: "第一章",
  url: null,
});

describe("MaterialTable.resolve", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(schema);
    db.exec("INSERT INTO excerpt_provider VALUES ('weread', '微信读书', 0), ('web', '网页', 0)");
  });
  afterEach(() => db.close());

  it("摘录按提供方名称、来源与位置展示，打开交给提供方并带外链兜底；软删除不可打开", () => {
    ExcerptTable.syncSource(db, "weread", "b1", "置身事内", [
      { ...input("b1:bm_1", "一句话"), url: "https://weread.qq.com/web/reader/x" },
      input("b1:review:r9", "摘要"),
    ]);
    const [hl, review] = ExcerptTable.listActive(db);
    const [a, b] = MaterialTable.resolve(db, [
      { kind: "excerpt", id: hl.id },
      { kind: "excerpt", id: review.id },
    ]);
    expect(a).toMatchObject({
      title: "一句话",
      meta: "微信读书 · 置身事内 · 第一章",
      note: "想法",
      deleted: false,
      open: {
        page: "excerpt-provider",
        sourceType: "weread",
        sourceKey: "b1",
        externalId: "b1:bm_1",
        label: "微信读书",
        url: "https://weread.qq.com/web/reader/x",
      },
    });
    expect(b.open).toMatchObject({ externalId: "b1:review:r9", url: null });

    ExcerptTable.deleteSource(db, "weread", "b1");
    expect(MaterialTable.resolveOne(db, { kind: "excerpt", id: hl.id })).toMatchObject({
      quote: "一句话",
      deleted: true,
      open: null,
    });
  });

  it("未登记名称的提供方以来源类型显示；网页摘录无标题时显示域名并带划线外链", () => {
    ExcerptTable.syncSource(db, "example.kindle", "k-book", "书", [
      { ...input("k1", "一句"), location: "位置 12" },
    ]);
    ExcerptTable.syncSource(db, "web", "https://a.com/p", "", [
      {
        ...input("u-1", "网页里的话"),
        anchor: null,
        location: "",
        url: "https://a.com/p#tau-hl=u-1",
      },
    ]);
    const [kindle, web] = ExcerptTable.listActive(db);
    expect(MaterialTable.resolveOne(db, { kind: "excerpt", id: kindle.id })?.meta).toBe(
      "example.kindle · 书 · 位置 12"
    );
    expect(MaterialTable.resolveOne(db, { kind: "excerpt", id: web.id })).toMatchObject({
      meta: "网页 · a.com",
      open: { page: "excerpt-provider", sourceType: "web", url: "https://a.com/p#tau-hl=u-1" },
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
