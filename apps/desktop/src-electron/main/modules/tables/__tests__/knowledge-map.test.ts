/**
 * 知识地图表的 IO：建表用真实的 index.sql 产物，读写一轮验证契约。
 */

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KnowledgeMap } from "@/knowledge-map/types";
import KnowledgeMapTable, { KNOWLEDGE_MAP_FINGERPRINT_KEY } from "../knowledge-map";

const INDEX_SQL = readFileSync(
  resolve(__dirname, "../../../../../../../packages/db-schema/schema/index.sql"),
  "utf8"
);

let mainDb: Database.Database;
let indexDb: Database.Database;

beforeEach(() => {
  mainDb = new Database(":memory:");
  mainDb.exec(`
    CREATE TABLE cards (
      id INTEGER PRIMARY KEY, tags TEXT, links TEXT, content_id INTEGER,
      update_time INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE contents (
      id INTEGER PRIMARY KEY, content TEXT, update_time INTEGER NOT NULL DEFAULT 0
    );
  `);
  indexDb = new Database(":memory:");
  indexDb.exec(INDEX_SQL);
});

afterEach(() => {
  mainDb.close();
  indexDb.close();
});

const sample: KnowledgeMap = {
  computedAt: 1234,
  nodes: [
    { cardId: 1, x: 1.5, y: -2, topic: 0, subtopic: 2 },
    { cardId: 2, x: 10, y: 20, topic: 1, subtopic: -1 },
  ],
  topics: [
    { id: 0, parent: -1, label: "JavaScript", colorSlot: 3, size: 1 },
    { id: 1, parent: -1, label: "CSS", colorSlot: 5, size: 1 },
    { id: 2, parent: 0, label: "Symbol", colorSlot: 3, size: 1 },
  ],
};

describe("KnowledgeMapTable", () => {
  it("没算过时 load 返回 null", () => {
    expect(KnowledgeMapTable.load(indexDb)).toBeNull();
  });

  it("save 后 load 原样读回，并记下指纹", () => {
    KnowledgeMapTable.save(indexDb, sample, "fp-1");
    const loaded = KnowledgeMapTable.load(indexDb)!;
    expect(loaded.computedAt).toBe(1234);
    expect(loaded.nodes.sort((a, b) => a.cardId - b.cardId)).toEqual(sample.nodes);
    expect(loaded.topics).toEqual(sample.topics);
    expect(KnowledgeMapTable.storedFingerprint(indexDb)).toBe("fp-1");
  });

  it("save 是整体替换，不残留旧地图的节点与主题", () => {
    KnowledgeMapTable.save(indexDb, sample, "fp-1");
    KnowledgeMapTable.save(
      indexDb,
      {
        computedAt: 99,
        nodes: [{ cardId: 7, x: 0, y: 0, topic: 0, subtopic: -1 }],
        topics: [sample.topics[0]],
      },
      "fp-2"
    );
    const loaded = KnowledgeMapTable.load(indexDb)!;
    expect(loaded.nodes.map(n => n.cardId)).toEqual([7]);
    expect(loaded.topics).toHaveLength(1);
    expect(KnowledgeMapTable.storedFingerprint(indexDb)).toBe("fp-2");
  });

  it("upsertNode 新增与覆盖，removeNode 删除", () => {
    KnowledgeMapTable.save(indexDb, sample, "fp");
    KnowledgeMapTable.upsertNode(indexDb, { cardId: 3, x: 5, y: 5, topic: 0, subtopic: -1 });
    KnowledgeMapTable.upsertNode(indexDb, { cardId: 1, x: 9, y: 9, topic: 1, subtopic: -1 });
    KnowledgeMapTable.removeNode(indexDb, 2);
    const byId = new Map(KnowledgeMapTable.load(indexDb)!.nodes.map(n => [n.cardId, n]));
    expect([...byId.keys()].sort()).toEqual([1, 3]);
    expect(byId.get(1)).toMatchObject({ x: 9, topic: 1 });
  });

  it("driftCount 只数整体重算之后增量写入的节点", () => {
    KnowledgeMapTable.save(indexDb, { ...sample, computedAt: Date.now() - 1000 }, "fp");
    const computedAt = KnowledgeMapTable.load(indexDb)!.computedAt;
    expect(KnowledgeMapTable.driftCount(mainDb, indexDb, computedAt)).toBe(0);
    KnowledgeMapTable.upsertNode(indexDb, { cardId: 3, x: 0, y: 0, topic: 0, subtopic: -1 });
    KnowledgeMapTable.upsertNode(indexDb, { cardId: 4, x: 0, y: 0, topic: 0, subtopic: -1 });
    expect(KnowledgeMapTable.driftCount(mainDb, indexDb, computedAt)).toBe(2);
  });

  it("driftCount 也数重算之后编辑过的卡片，与增量放置按卡片去重", () => {
    const computedAt = Date.now() - 1000;
    KnowledgeMapTable.save(indexDb, { ...sample, computedAt }, "fp");
    const insert = mainDb.prepare(
      "INSERT INTO cards (id, tags, links, update_time) VALUES (?, '[]', '[]', ?)"
    );
    insert.run(1, computedAt - 5000); // 重算前改的：不算
    insert.run(2, computedAt + 10); // 重算后编辑过
    insert.run(3, computedAt + 20); // 新建且已增量放置：只算一次
    KnowledgeMapTable.upsertNode(indexDb, { cardId: 3, x: 0, y: 0, topic: 0, subtopic: -1 });
    expect(KnowledgeMapTable.driftCount(mainDb, indexDb, computedAt)).toBe(2);
  });

  it("driftCount 把只改了正文（contents.update_time）的卡片也算作编辑过", () => {
    const computedAt = Date.now() - 1000;
    KnowledgeMapTable.save(indexDb, { ...sample, computedAt }, "fp");
    mainDb
      .prepare("INSERT INTO contents (id, content, update_time) VALUES (?, '[]', ?)")
      .run(10, computedAt + 10); // 重算后改过正文
    mainDb
      .prepare("INSERT INTO contents (id, content, update_time) VALUES (?, '[]', ?)")
      .run(11, computedAt - 5000); // 正文也是重算前改的
    const insert = mainDb.prepare(
      "INSERT INTO cards (id, tags, links, content_id, update_time) VALUES (?, '[]', '[]', ?, ?)"
    );
    insert.run(1, 10, computedAt - 5000); // 卡片元数据没动、正文动了：算
    insert.run(2, 11, computedAt - 5000); // 两边都没动：不算
    insert.run(3, null, computedAt - 5000); // 没有正文行：不算
    expect(KnowledgeMapTable.driftCount(mainDb, indexDb, computedAt)).toBe(1);
  });

  it("没有向量表时 hasVectors 为 false、neighborsOf 为空，不抛错", () => {
    expect(KnowledgeMapTable.hasVectors(indexDb, 1)).toBe(false);
    expect(KnowledgeMapTable.neighborsOf(indexDb, 1, 8)).toEqual([]);
  });

  it("cardIds 列出主库全部卡片", () => {
    mainDb.exec("INSERT INTO cards (id) VALUES (5), (9)");
    expect(KnowledgeMapTable.cardIds(mainDb).sort()).toEqual([5, 9]);
  });

  it("readFingerprint 读 embedding 指纹，与地图自己的指纹分开存", () => {
    indexDb
      .prepare("INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, 0)")
      .run("main_content_embedding_fingerprint", "model-a");
    expect(KnowledgeMapTable.readFingerprint(indexDb)).toBe("model-a");
    expect(KNOWLEDGE_MAP_FINGERPRINT_KEY).not.toBe("main_content_embedding_fingerprint");
  });

  it("readInputs 合并 links 字段与正文里的内联卡片链接，解析坏 JSON 不抛错", () => {
    mainDb.exec(`
      INSERT INTO contents (id, content) VALUES
        (10, '[{"type":"paragraph","children":[{"type":"content-link","contentType":"card","refId":2,"children":[]}]}]'),
        (11, 'not json');
      INSERT INTO cards (id, tags, links, content_id) VALUES
        (1, '["JavaScript/Symbol"]', '[3]', 10),
        (2, 'broken', NULL, 11),
        (3, NULL, '[]', NULL);
    `);
    const { cards, chunks } = KnowledgeMapTable.readInputs(mainDb, indexDb);
    const byId = new Map(cards.map(c => [c.id, c]));
    expect(byId.get(1)!.links.sort()).toEqual([2, 3]);
    expect(byId.get(1)!.tags).toEqual(["JavaScript/Symbol"]);
    expect(byId.get(2)!.tags).toEqual([]);
    // 没有 vec_documents 表（未配置 embedding）时不抛错、没有向量
    expect(chunks).toEqual([]);
  });
});
