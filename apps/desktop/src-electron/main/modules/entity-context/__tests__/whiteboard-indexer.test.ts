import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diffWhiteboardSources,
  reconcileWhiteboardRefs,
  reindexWhiteboardPages,
} from "../whiteboard-indexer";

const SCHEMA_DIR = resolve(__dirname, "../../../../../../../packages/db-schema/schema");
const MAIN_SQL = readFileSync(resolve(SCHEMA_DIR, "main.sql"), "utf8");
const INDEX_SQL = readFileSync(resolve(SCHEMA_DIR, "index.sql"), "utf8");

let mainDb: Database.Database;
let indexDb: Database.Database;
let clock = 1_000;

const canvas = (...children: unknown[]) => JSON.stringify({ children });
const insertPage = (data: string) =>
  Number(
    mainDb
      .prepare(
        `INSERT INTO white_board_contents (create_time, update_time, name, data, ref_count) VALUES (?, ?, '页', ?, 1)`
      )
      .run(clock, clock++, data).lastInsertRowid
  );
const updatePage = (id: number, data: string) =>
  mainDb
    .prepare(`UPDATE white_board_contents SET data = ?, update_time = ? WHERE id = ?`)
    .run(data, clock++, id);
const refsOf = (pageId: number) =>
  indexDb
    .prepare(
      `SELECT dst_kind, dst_id, via FROM whiteboard_refs WHERE page_id = ? ORDER BY dst_kind, dst_id`
    )
    .all(pageId);

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

describe("白板引用索引", () => {
  it("解析页里的卡片与思维导图关联的笔记；引用集合不变时不算变化", () => {
    const id = insertPage(
      canvas(
        { id: "a", type: "card", cardId: 3 },
        { id: "m", type: "mind-node", text: [], children: [{ id: "n", type: "mind-node", contentId: 9, text: [], children: [] }] }
      )
    );
    expect(reindexWhiteboardPages(mainDb, indexDb, [id])).toEqual({ processed: 1, changed: 1 });
    expect(refsOf(id)).toEqual([
      { dst_kind: "card", dst_id: 3, via: "card" },
      { dst_kind: "content", dst_id: 9, via: "mind-node" },
    ]);

    // 拖动元素：画布变了，引用没变
    updatePage(
      id,
      canvas(
        { id: "m", type: "mind-node", text: [], children: [{ id: "n", type: "mind-node", contentId: 9, text: [], children: [] }] },
        { id: "a", type: "card", cardId: 3, x: 100 }
      )
    );
    expect(reindexWhiteboardPages(mainDb, indexDb, [id]).changed).toBe(0);
  });

  it("对账只处理变化与已删除的页", async () => {
    const a = insertPage(canvas({ id: "a", type: "card", cardId: 1 }));
    const b = insertPage(canvas({ id: "b", type: "card", cardId: 2 }));
    expect(await reconcileWhiteboardRefs(mainDb, indexDb)).toEqual({
      processed: 2,
      changed: 2,
      aborted: false,
    });
    expect(diffWhiteboardSources(mainDb, indexDb)).toEqual([]);

    updatePage(a, canvas({ id: "a", type: "card", cardId: 5 }));
    mainDb.prepare(`DELETE FROM white_board_contents WHERE id = ?`).run(b);
    expect(diffWhiteboardSources(mainDb, indexDb).sort()).toEqual([a, b].sort());
    await reconcileWhiteboardRefs(mainDb, indexDb);
    expect(refsOf(a)).toEqual([{ dst_kind: "card", dst_id: 5, via: "card" }]);
    expect(refsOf(b)).toEqual([]);
    expect((await reconcileWhiteboardRefs(mainDb, indexDb)).processed).toBe(0);
  });
});
