import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RECONCILE_BATCH, diffSources, reconcileRefs, reindexContents } from "../ref-indexer";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

const text = (t: string) => ({ type: "formatted", text: t });
const link = (contentType: string, refId: number, title: string, contentId?: number) => ({
  type: "content-link",
  contentType,
  refId,
  contentId,
  contentTitle: title,
  children: [text(title)],
});
const p = (...children: unknown[]) => ({ type: "paragraph", children });

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
const updateContent = (id: number, nodes: unknown[]) =>
  mainDb
    .prepare(`UPDATE contents SET content = ?, update_time = ? WHERE id = ?`)
    .run(JSON.stringify(nodes), clock++, id);
const refsOf = (srcContentId: number) =>
  indexDb
    .prepare(
      `SELECT dst_kind, dst_id, dst_content_id, snippet_before, snippet_label, snippet_after
       FROM entity_refs WHERE src_content_id = ? ORDER BY rowid`
    )
    .all(srcContentId);
const sourceCount = () =>
  (indexDb.prepare(`SELECT COUNT(*) AS n FROM entity_ref_sources`).get() as { n: number }).n;

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

describe("reindexContents", () => {
  it("解析内联引用写入索引，并记录对账状态", () => {
    const id = insertContent([p(text("见"), link("project-item", 3, "渲染篇", 30), text("。"))]);
    const result = reindexContents(mainDb, indexDb, [id]);
    expect(result).toEqual({ processed: 1, changed: 1 });
    expect(refsOf(id)).toEqual([
      {
        dst_kind: "project-item",
        dst_id: 3,
        dst_content_id: 30,
        snippet_before: "见",
        snippet_label: "渲染篇",
        snippet_after: "。",
      },
    ]);
    expect(sourceCount()).toBe(1);
  });

  it("修改后替换旧引用；没有引用的正文只记状态、不算变化", () => {
    const id = insertContent([p(link("card", 1, "A"))]);
    const plain = insertContent([p(text("没有引用"))]);
    reindexContents(mainDb, indexDb, [id, plain]);
    updateContent(id, [p(link("card", 2, "B"))]);
    const result = reindexContents(mainDb, indexDb, [id, plain]);
    expect(result).toEqual({ processed: 2, changed: 1 });
    expect(refsOf(id).map((r: any) => r.dst_id)).toEqual([2]);
    expect(refsOf(plain)).toEqual([]);
  });

  it("删掉全部引用算一次变化；正文被删则同时清除状态", () => {
    const id = insertContent([p(link("card", 1, "A"))]);
    reindexContents(mainDb, indexDb, [id]);
    updateContent(id, [p(text("删掉了"))]);
    expect(reindexContents(mainDb, indexDb, [id]).changed).toBe(1);
    mainDb.prepare(`DELETE FROM contents WHERE id = ?`).run(id);
    reindexContents(mainDb, indexDb, [id]);
    expect(sourceCount()).toBe(0);
  });

  it("损坏的正文 JSON 不抛错，按无引用处理", () => {
    const id = insertContent([]);
    mainDb
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run('{"type":"content-link" 坏了', id);
    expect(() => reindexContents(mainDb, indexDb, [id])).not.toThrow();
    expect(refsOf(id)).toEqual([]);
  });
});

describe("reconcileRefs", () => {
  it("首次对账覆盖全部正文；再次对账没有待处理项", async () => {
    const a = insertContent([p(link("card", 1, "A"))]);
    insertContent([p(text("x"))]);
    const first = await reconcileRefs(mainDb, indexDb);
    expect(first).toEqual({ processed: 2, changed: 1, aborted: false });
    expect(refsOf(a)).toHaveLength(1);
    expect(diffSources(mainDb, indexDb)).toEqual([]);
    expect((await reconcileRefs(mainDb, indexDb)).processed).toBe(0);
  });

  it("只处理变更与已删除的正文", async () => {
    const a = insertContent([p(link("card", 1, "A"))]);
    const b = insertContent([p(link("card", 2, "B"))]);
    const c = insertContent([p(text("x"))]);
    await reconcileRefs(mainDb, indexDb);
    updateContent(a, [p(link("card", 9, "Z"))]);
    mainDb.prepare(`DELETE FROM contents WHERE id = ?`).run(b);
    expect(diffSources(mainDb, indexDb).sort()).toEqual([a, b].sort());
    await reconcileRefs(mainDb, indexDb);
    expect(refsOf(a).map((r: any) => r.dst_id)).toEqual([9]);
    expect(refsOf(b)).toEqual([]);
    expect(refsOf(c)).toEqual([]);
  });

  it("切库（isStale）时在批间停止", async () => {
    for (let i = 0; i < RECONCILE_BATCH * 2 + 1; i++) insertContent([p(text("x"))]);
    let batches = 0;
    const result = await reconcileRefs(mainDb, indexDb, () => batches++ >= 1);
    expect(result.aborted).toBe(true);
    expect(result.processed).toBe(RECONCILE_BATCH);
  });
});

describe("文档里嵌入的白板块", () => {
  const board = (pageId: number) => ({
    type: "whiteboard",
    whiteBoardContentId: pageId,
    children: [text("")],
  });
  const embedsOf = (hostId: number) =>
    (
      indexDb
        .prepare(`SELECT page_id FROM whiteboard_embeds WHERE host_content_id = ? ORDER BY page_id`)
        .all(hostId) as Array<{ page_id: number }>
    ).map(row => row.page_id);

  it("随正文解析写入，修改与删除时更新", () => {
    const id = insertContent([p(text("见图")), board(5)]);
    expect(reindexContents(mainDb, indexDb, [id]).changed).toBe(1);
    expect(embedsOf(id)).toEqual([5]);

    updateContent(id, [board(5), board(6)]);
    expect(reindexContents(mainDb, indexDb, [id]).changed).toBe(1);
    expect(embedsOf(id)).toEqual([5, 6]);

    updateContent(id, [board(6), board(5)]);
    expect(reindexContents(mainDb, indexDb, [id]).changed).toBe(0);

    mainDb.prepare(`DELETE FROM contents WHERE id = ?`).run(id);
    expect(reindexContents(mainDb, indexDb, [id]).changed).toBe(1);
    expect(embedsOf(id)).toEqual([]);
  });

  it("解析口径升级后，已对账的正文在下次对账时重解析", async () => {
    const id = insertContent([board(7)]);
    indexDb
      .prepare(`INSERT INTO entity_ref_sources (content_id, update_time) VALUES (?, ?)`)
      .run(id, clock - 1);
    expect(diffSources(mainDb, indexDb)).toEqual([]);
    await reconcileRefs(mainDb, indexDb);
    expect(embedsOf(id)).toEqual([7]);
    expect((await reconcileRefs(mainDb, indexDb)).processed).toBe(0);
  });
});
