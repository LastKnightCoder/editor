import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/tmp") } }));
vi.mock("electron-log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../local-inference", () => ({ default: { embedTexts: vi.fn() } }));
vi.mock("../search-details", () => ({ searchResultDetails: vi.fn(() => null) }));

import VecDocumentTable from "../tables/vec-document";

const DIM = 4;

describe("只进向量的提问不出现在检索里（KL-064）", () => {
  let index: Database.Database;
  const add = (key: string, type: string, vector: number[]) =>
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, 0, vec_f32(?))`
      )
      .run(key, type, JSON.stringify(vector));

  beforeEach(() => {
    index = new Database(":memory:");
    sqliteVec.load(index);
    index.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
      prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
      vec_embedding FLOAT[${DIM}] distance_metric=cosine)`);
    add("chat-prompt:s1#a", "chat-prompt", [1, 0, 0, 0]);
    add("card:1", "card", [0.9, 0.1, 0, 0]);
  });
  afterEach(() => index.close());

  it("不限类型时不召回提问；显式指定时照常", () => {
    const hits = VecDocumentTable.searchVecDocuments(index, [1, 0, 0, 0], 10, [], 1);
    expect(hits.map(([doc]) => doc.type)).toEqual(["card"]);
    const prompts = VecDocumentTable.searchVecDocuments(
      index,
      [1, 0, 0, 0],
      10,
      ["chat-prompt" as never],
      1
    );
    expect(prompts).toHaveLength(1);
  });

  it("字符串 id 的写入辅助：判断已索引、按 id 删除", () => {
    expect(VecDocumentTable.checkIndexExists(index, "s1#a", "chat-prompt")).toEqual({
      updateTime: 1,
    });
    VecDocumentTable.removeIndexByIdAndType(index, "s1#a", "chat-prompt");
    expect(VecDocumentTable.checkIndexExists(index, "s1#a", "chat-prompt")).toBeNull();
  });
});
