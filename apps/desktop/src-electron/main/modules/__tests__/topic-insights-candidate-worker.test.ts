// @vitest-environment node
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { InsightCandidateScheduler } from "../topic-insights-candidate-client";
import { candidateWorkerFixture } from "./insight-candidate-worker-fixture";
import type { CandidateSource } from "../topic-insights-candidate-protocol";

vi.mock("electron-log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let fixture: Awaited<ReturnType<typeof candidateWorkerFixture>>;
let db: Database.Database;
let source: CandidateSource;
let scheduler: InsightCandidateScheduler;
beforeAll(async () => {
  fixture = await candidateWorkerFixture();
}, 30000);
afterAll(async () => {
  await fixture.dispose();
});
beforeEach(() => {
  db = new Database(join(fixture.directory, `index-${crypto.randomUUID()}.db`));
  sqliteVec.load(db);
  db.pragma("journal_mode=WAL");
  db.exec(`CREATE TABLE vec_index_meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO vec_index_meta VALUES ('main_content_embedding_fingerprint', 'model-a');
    CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT, updated_at REAL);
    CREATE TABLE content_sections (prefixed_id TEXT, update_time REAL, chunk_index INTEGER, heading_path TEXT, block_start INTEGER, text TEXT);
    CREATE VIRTUAL TABLE vec_documents USING vec0(prefixed_id TEXT, update_time FLOAT,
      content TEXT, type TEXT, chunk_index INTEGER, vec_embedding FLOAT[4] distance_metric=cosine);`);
  const add = db.prepare(
    "INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding) VALUES (?, 7.0, ?, ?, ?, vec_f32(?))"
  );
  for (const [key, chunk, vector] of [
    ["card:1", 0, [1, 0, 0, 0]],
    ["article:2", 0, [0.98, 0.2, 0, 0]],
    ["article:2", 1, [0.9, 0.1, 0, 0]],
    ["card:3", 0, [1, 0, 0, 0]],
    ["chat-prompt:session#one", 0, [0, 0, 1, 0]],
    ["chat-prompt:session#two", 0, [0, 0, 1, 0]],
    ["chat-prompt:session#other", 0, [0, 0, 0, 1]],
    ["chat-prompt:session#written", 0, [1, 0, 0, 0]],
  ] as const)
    add.run(key, key, key.split(":")[0], BigInt(chunk), JSON.stringify(vector));
  db.exec(
    "INSERT INTO content_sections VALUES ('article:2', 7, 0, 'A', 0, 'evidence-A'), ('article:2', 7, 1, 'B', 4, 'evidence-B')"
  );
  source = {
    file: db.name,
    fingerprint: "model-a",
    schemaVersion: Number(db.pragma("schema_version", { simple: true })),
  };
  scheduler = new InsightCandidateScheduler(fixture);
});
afterEach(async () => {
  await scheduler?.pause();
  if (db?.open) db.close();
});

it("真实线程保留关联排除与长文中最接近对方的证据", async () => {
  const { pairs } = await scheduler.run(source, {
    kind: "subtopic",
    keys: ["card:1", "article:2", "card:3"],
    links: [["card:1", ["card:3"]]],
    threshold: 0.8,
    limit: 10,
    longDocs: ["article:2"],
  });
  expect(pairs.map(pair => [pair.left, pair.right])).toEqual([
    ["card:1", "article:2"],
    ["article:2", "card:3"],
  ]);
  for (const pair of pairs)
    expect(pair.sections).toEqual([
      ["article:2", { heading: "B", blockStart: 4, text: "evidence-B" }],
    ]);
});

it("提问聚合排除已经写过的方向且跨主题配对保留身份", async () => {
  const result = await scheduler.run(source, {
    kind: "global",
    topics: [
      {
        topicId: 1,
        members: [
          { key: "card:1", updateTime: 7 },
          { key: "card:3", updateTime: 7 },
        ],
      },
      { topicId: 2, members: [{ key: "article:2", updateTime: 7 }] },
    ],
    links: [],
    concepts: [],
    threshold: 0.8,
    longDocs: ["article:2"],
  });
  expect(result.asked.map(group => group.times)).toEqual([2, 1]);
  expect(
    new Set(result.asked.flatMap(group => group.prompts.map(prompt => prompt.messageId)))
  ).toEqual(new Set(["one", "two", "other"]));
  expect(result.pairs.every(pair => pair.left === "article:2" || pair.right === "article:2")).toBe(
    true
  );
  expect(result.pairs.length).toBeGreaterThan(0);
});

it("取消运行中的作业后释放执行槽并允许新请求完成", async () => {
  let opened!: () => void;
  const ready = new Promise<void>(resolve => {
    opened = resolve;
  });
  scheduler = new InsightCandidateScheduler({
    ...fixture,
    onPhase: phase => {
      if (phase === "opened") opened();
    },
  });
  const add = db.prepare(
    "INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding) VALUES (?, 8.0, '', 'chat-prompt', 0, vec_f32(?))"
  );
  db.transaction(() => {
    for (let i = 0; i < 2000; i++) add.run(`chat-prompt:more#${i}`, "[0,0,1,0]");
  })();
  const controller = new AbortController();
  const job = scheduler.run(
    source,
    { kind: "global", topics: [], links: [], concepts: [], threshold: 0.8, longDocs: [] },
    controller.signal
  );
  const rejected = expect(job).rejects.toMatchObject({ name: "AbortError" });
  await ready;
  controller.abort();
  await rejected;
  const next = await scheduler.run(source, { kind: "threshold", now: 123 });
  expect(next.threshold?.fingerprint).toBe("model-a");
});

it("维护屏障排空旧读者并阻止文件替换期间的新读者", async () => {
  let opened!: () => void;
  const ready = new Promise<void>(resolve => {
    opened = resolve;
  });
  scheduler = new InsightCandidateScheduler({
    ...fixture,
    onPhase: phase => {
      if (phase === "opened") opened();
    },
  });
  const add = db.prepare(
    "INSERT INTO vec_documents(prefixed_id,update_time,content,type,chunk_index,vec_embedding) VALUES (?,8.0,'','chat-prompt',0,vec_f32(?))"
  );
  db.transaction(() => {
    for (let i = 0; i < 1000; i++) add.run(`chat-prompt:barrier#${i}`, "[0,0,1,0]");
  })();
  const pending = scheduler.run(source, {
    kind: "global",
    topics: [],
    links: [],
    concepts: [],
    threshold: 0.8,
    longDocs: [],
  });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await ready;
  const resume = await scheduler.pause(source.file);
  await rejected;
  await expect(scheduler.run(source, { kind: "threshold", now: 123 })).rejects.toThrow("维护");
  db.close();
  await rename(source.file, `${source.file}.old`);
  await rename(`${source.file}.old`, source.file);
  db = new Database(source.file);
  resume();
  await expect(scheduler.run(source, { kind: "threshold", now: 123 })).resolves.toMatchObject({
    sampled: true,
  });
});

it("索引指纹失效与线程异常不会伪装成空候选且失败后可重试", async () => {
  db.prepare("UPDATE vec_index_meta SET value='model-b'").run();
  await expect(scheduler.run(source, { kind: "threshold", now: 123 })).rejects.toThrow(
    "索引已变化"
  );
  source.fingerprint = "model-b";
  const broken = new InsightCandidateScheduler({
    ...fixture,
    workerPath: join(fixture.directory, "missing.cjs"),
  });
  await expect(broken.run(source, { kind: "threshold", now: 123 })).rejects.toThrow();
  await expect(scheduler.run(source, { kind: "threshold", now: 123 })).resolves.toMatchObject({
    sampled: true,
  });
});
