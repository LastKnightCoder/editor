import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp" }, ipcMain: { handle: vi.fn() } }));
vi.mock("../../video-note-index-queue", () => ({ default: {} }));

import KnowledgeMapTable, { meanVector } from "../knowledge-map";

const opened: Database.Database[] = [];
afterEach(() => opened.splice(0).forEach(db => db.close()));

const blob = (values: number[]) => Buffer.from(new Float32Array(values).buffer);

it("均值向量做 L2 归一化，维度不一致的丢弃", () => {
  const mean = meanVector([blob([1, 0]), blob([0, 1]), blob([1, 0, 0])])!;
  const values = [...new Float32Array(mean.buffer, mean.byteOffset, 2)];
  expect(values[0]).toBeCloseTo(Math.SQRT1_2);
  expect(values[1]).toBeCloseTo(Math.SQRT1_2);
  expect(meanVector([])).toBeNull();
});

it("多节实体只查一次近邻，邻居按实体去重", () => {
  const db = new Database(":memory:");
  opened.push(db);
  sqliteVec.load(db);
  db.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
    prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
    vec_embedding FLOAT[2] distance_metric=cosine)`);
  const insert = db.prepare(
    "INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding) VALUES (?, 1.0, '', ?, ?, vec_f32(?))"
  );
  const add = (key: string, index: number, vector: number[]) =>
    insert.run(key, key.split(":")[0], BigInt(index), JSON.stringify(vector));
  add("article:1", 0, [1, 0]);
  add("article:1", 1, [0, 1]);
  add("card:2", 0, [1, 1]);
  add("card:3", 0, [1, 0]);
  add("card:3", 1, [0.9, 0.1]);
  const neighbors = KnowledgeMapTable.neighborsOf(db, "article:1", 2);
  expect(neighbors.map(neighbor => neighbor.key)).toEqual(["card:2", "card:3"]);
  expect(neighbors[0].similarity).toBeCloseTo(1);
});
