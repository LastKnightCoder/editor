import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convertCardElements, upgradeWhiteboardCardElements } from "../whiteboard-document-upgrade";

const MAIN_SQL = readFileSync(
  resolve(__dirname, "../../../../../../packages/db-schema/schema/main.sql"),
  "utf8"
);

const legacyCard = (id: string, cardId: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "card",
  cardId,
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  maxWidth: 300,
  maxHeight: 200,
  resized: true,
  readonly: false,
  variant: "tinted",
  tone: "blue",
  ...extra,
});

describe("convertCardElements", () => {
  it("卡片元素改写为文档卡，保留位置与通用字段，丢弃卡片专属字段", () => {
    const children: unknown[] = [legacyCard("a", 7, { name: "灵感", sketch: { mode: "sketch" } })];
    expect(convertCardElements(children)).toEqual({ changed: true, releasedContentIds: [] });
    expect(children).toEqual([
      {
        id: "a",
        type: "document",
        entityRef: { kind: "card", id: 7 },
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        name: "灵感",
        sketch: { mode: "sketch" },
      },
    ]);
  });

  it("画框、分栏里的卡片也改写；其他元素原样", () => {
    const text = { id: "t", type: "richtext", contentId: 3 };
    const children: unknown[] = [
      text,
      {
        id: "f",
        type: "frame",
        children: [{ id: "c", type: "column", children: [legacyCard("k", 9)] }],
      },
    ];
    convertCardElements(children);
    expect(children[0]).toBe(text);
    expect(JSON.stringify(children)).not.toContain('"type":"card"');
    expect(JSON.stringify(children)).toContain('"entityRef":{"kind":"card","id":9}');
  });

  it("卡片元素上残留的 contentId 交给调用方释放引用", () => {
    const children: unknown[] = [legacyCard("a", 1, { contentId: 42 })];
    expect(convertCardElements(children).releasedContentIds).toEqual([42]);
    expect(children[0]).not.toHaveProperty("contentId");
  });

  it("没有卡片元素时不算改动", () => {
    expect(convertCardElements([{ id: "t", type: "richtext" }]).changed).toBe(false);
    expect(convertCardElements(undefined).changed).toBe(false);
  });
});

describe("upgradeWhiteboardCardElements", () => {
  let db: Database.Database;
  const insertPage = (data: string, updateTime = 1_000) =>
    Number(
      db
        .prepare(
          `INSERT INTO white_board_contents (create_time, update_time, name, data, ref_count) VALUES (1, ?, '页', ?, 1)`
        )
        .run(updateTime, data).lastInsertRowid
    );
  const pageOf = (id: number) =>
    db.prepare(`SELECT data, update_time FROM white_board_contents WHERE id = ?`).get(id) as {
      data: string;
      update_time: number;
    };

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(MAIN_SQL);
  });
  afterEach(() => db.close());

  it("只改写含卡片元素的页，不动 update_time；重复执行无改动", () => {
    const withCard = insertPage(
      JSON.stringify({ children: [legacyCard("a", 5)], viewPort: {} }),
      777
    );
    const plain = insertPage(JSON.stringify({ children: [{ id: "t", type: "richtext" }] }));
    const plainBefore = pageOf(plain).data;

    expect(upgradeWhiteboardCardElements(db)).toBe(1);
    const page = pageOf(withCard);
    expect(page.update_time).toBe(777);
    expect(JSON.parse(page.data).children[0]).toMatchObject({
      type: "document",
      entityRef: { kind: "card", id: 5 },
    });
    expect(JSON.parse(page.data).viewPort).toEqual({});
    expect(pageOf(plain).data).toBe(plainBefore);

    expect(upgradeWhiteboardCardElements(db)).toBe(0);
  });

  it("损坏的画布原样保留，不阻止其他页升级", () => {
    const broken = insertPage('{"type":"card" 坏的');
    const ok = insertPage(JSON.stringify({ children: [legacyCard("a", 5)] }));
    expect(upgradeWhiteboardCardElements(db)).toBe(1);
    expect(pageOf(broken).data).toBe('{"type":"card" 坏的');
    expect(pageOf(ok).data).toContain('"type":"document"');
  });
});
