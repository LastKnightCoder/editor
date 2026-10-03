/**
 * 迭代 7a 规模实测（KL-029：按重度用户的结构推导，不按本机数据）。设环境变量才跑：
 *   KL_CONTENT_AI_SCALE=1 npx vitest run src-electron/main/modules/__tests__/content-ai-scale.eval.test.ts
 *
 * 夹具：2 万张卡（约 500 字）+ 3000 篇长文（约 6000 字、8 节）；元信息覆盖全部正文；
 * 索引库 2 万 + 3000 × 8 = 4.4 万条 1024 维向量（按主题聚成团的随机向量），引用与链接各若干。
 * 量：元信息对账（不调模型）、进度统计、卡片标题批量查询、卡片列表轻表、「相关」查询。
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { describe, expect, it, vi } from "vitest";
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
vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));

import { contentPlainText, textDigest } from "@/entity/text-digest";
import { ContentAiQueue, computeContentAiStatus } from "../content-ai-queue";
import { relatedOf, ensureRelatedThreshold } from "../entity-context/context-related";
import CardTable from "../tables/card";
import ContentAiMetaTable, { contentTitles } from "../tables/content-ai-meta";

const CARDS = 20_000;
const DOCS = 3_000;
const DOC_SECTIONS = 8;
const DIM = 1024;
const TOPICS = 200;

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(20261003);
const WORDS =
  "知识卡片连接观点写作阅读问题材料主题项目文章笔记索引向量检索财政土地产业学习复习记忆".split("");
const text = (length: number) =>
  Array.from({ length }, () => WORDS[Math.floor(random() * WORDS.length)]).join("");
const paragraphs = (length: number, count: number) =>
  Array.from({ length: count }, (_, i) => [
    { type: "header", level: 2, children: [{ type: "formatted", text: `第 ${i + 1} 节` }] },
    {
      type: "paragraph",
      children: [{ type: "formatted", text: text(Math.floor(length / count)) }],
    },
  ]).flat();

const centers = Array.from({ length: TOPICS }, () =>
  Float32Array.from({ length: DIM }, () => random() - 0.5)
);
const vectorNear = (topic: number) => {
  const center = centers[topic];
  const out = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) out[i] = center[i] + (random() - 0.5) * 0.6;
  return Buffer.from(out.buffer);
};

const timed = async <T>(label: string, run: () => T | Promise<T>, rows: string[]) => {
  const started = performance.now();
  const result = await run();
  const ms = performance.now() - started;
  rows.push(`| ${label} | ${ms.toFixed(1)} ms |`);
  console.log(`[content-ai-scale] ${label}: ${ms.toFixed(1)} ms`);
  return result;
};

describe.skipIf(!process.env.KL_CONTENT_AI_SCALE)("迭代 7a 规模", () => {
  it(`${CARDS} 张卡 + ${DOCS} 篇长文`, async () => {
    const main = new Database(":memory:");
    main.exec(mainSchema);
    const index = new Database(":memory:");
    sqliteVec.load(index);
    index.exec(indexSchema);
    index.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
        prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
        vec_embedding FLOAT[${DIM}] distance_metric=cosine)`);
    index
      .prepare(`INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, 1)`)
      .run("main_content_embedding_fingerprint", "scale");

    const rows: string[] = [];
    const insertContent = main.prepare(
      `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, ?, 1)`
    );
    const insertCard = main.prepare(
      `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', ?, ?)`
    );
    const insertArticle = main.prepare(
      `INSERT INTO articles (title, create_time, update_time, content_id) VALUES (?, 1, 1, ?)`
    );
    const insertVector = index.prepare(
      `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, ?, ?)`
    );
    const insertRef = index.prepare(
      `INSERT INTO entity_refs (src_content_id, dst_kind, dst_id, dst_content_id) VALUES (?, 'card', ?, ?)`
    );
    const cardContents: number[] = [];
    await timed(
      "建夹具（主库 + 4.4 万向量）",
      () =>
        main.transaction(() => {
          index.transaction(() => {
            for (let i = 0; i < CARDS; i++) {
              const body = [
                { type: "paragraph", children: [{ type: "formatted", text: text(500) }] },
              ];
              const contentId = Number(
                insertContent.run(JSON.stringify(body), 500).lastInsertRowid
              );
              // 每张卡与前一张双向链接（一半的卡）
              const links =
                i % 2 === 1
                  ? JSON.stringify([i])
                  : i % 2 === 0 && i + 1 < CARDS
                    ? JSON.stringify([i + 2])
                    : "[]";
              const id = Number(insertCard.run(links, contentId).lastInsertRowid);
              cardContents.push(contentId);
              insertVector.run(`card:${id}`, "card", 0n, vectorNear(i % TOPICS));
              if (i % 10 === 0 && i > 0) insertRef.run(contentId, id - 1, cardContents[i - 1]);
            }
            for (let i = 0; i < DOCS; i++) {
              const body = paragraphs(6000, DOC_SECTIONS);
              const contentId = Number(
                insertContent.run(JSON.stringify(body), 6000).lastInsertRowid
              );
              const id = Number(insertArticle.run(`长文 ${i}`, contentId).lastInsertRowid);
              for (let s = 0; s < DOC_SECTIONS; s++) {
                insertVector.run(
                  `article:${id}`,
                  "article",
                  BigInt(s),
                  vectorNear((i + s) % TOPICS)
                );
              }
            }
          })();
        })(),
      rows
    );

    // 元信息：首轮处理完的状态（每份都有，指纹为生成时的正文）
    await timed(
      "写入全部元信息（夹具）",
      () =>
        main.transaction(() => {
          for (const row of main.prepare(`SELECT id, content FROM contents`).all() as Array<{
            id: number;
            content: string;
          }>) {
            ContentAiMetaTable.upsert(
              main,
              {
                contentId: row.id,
                textDigest: textDigest(contentPlainText(JSON.parse(row.content))),
                meta: { title: `标题 ${row.id}`, summary: "要点", concepts: [], claims: [] },
                model: "p/m",
              },
              2
            );
          }
        })(),
      rows
    );

    const complete = vi.fn(async () => ({ ok: true, text: "{}" }));
    const queue = new ContentAiQueue({
      databases: async () => ({ mainDb: main, indexDb: index }),
      complete,
      notifyChanged: () => undefined,
      sleep: async () => undefined,
      now: () => 10,
    });
    queue.applySetting({
      llmProviders: [{ id: "p", models: [{ id: "m" }] }],
      llmUsageSettings: { contentMetadata: { providerId: "p", modelId: "m" } },
    } as never);
    await queue.idle();

    await timed(
      "连库对账：全部已是最新（扫库 + 清孤儿）",
      async () => {
        queue.onDatabaseConnected(":memory:");
        await queue.idle();
      },
      rows
    );
    expect(complete).not.toHaveBeenCalled();

    // 全部正文的 update_time 晚于元信息（如同步下载后）：逐份读正文算指纹，判断后只记核对时间
    main.prepare(`UPDATE contents SET update_time = 5`).run();
    await timed(
      `连库对账：${CARDS + DOCS} 份都改过但未达重算条件（读正文 + 指纹 + 核对）`,
      async () => {
        queue.onDatabaseConnected(":memory:");
        await queue.idle();
      },
      rows
    );
    expect(complete).not.toHaveBeenCalled();

    await timed(
      "设置页进度统计（content-ai:status）",
      () => computeContentAiStatus(main, true, false),
      rows
    );
    const someIds = cardContents.slice(0, 50);
    await timed("卡片标题批量查询：50 张", () => contentTitles(main, someIds, 80), rows);
    const all = await timed(
      `卡片标题批量查询：全部 ${CARDS} 张（知识地图口径）`,
      () => contentTitles(main, cardContents, 80),
      rows
    );
    expect(all.size).toBe(CARDS);
    await timed(
      `卡片列表轻表（含 aiTitle）：${CARDS} 张`,
      () => CardTable.getScopedCards(main, { databaseName: main.name }),
      rows
    );

    await timed("「相关」阈值抽样（1000 对）", () => ensureRelatedThreshold(index), rows);
    const relatedTimes: number[] = [];
    for (let i = 0; i < 30; i++) {
      const started = performance.now();
      relatedOf(main, index, {
        kind: i % 3 === 0 ? "article" : "card",
        id: 1 + Math.floor(random() * (i % 3 === 0 ? DOCS : CARDS)),
      });
      relatedTimes.push(performance.now() - started);
    }
    relatedTimes.sort((a, b) => a - b);
    const avg = relatedTimes.reduce((a, b) => a + b, 0) / relatedTimes.length;
    rows.push(
      `| 「相关」查询 30 次（卡片 / 长文混合） | 平均 ${avg.toFixed(1)} ms，p95 ${relatedTimes[Math.floor(relatedTimes.length * 0.95)].toFixed(1)} ms，最大 ${relatedTimes[relatedTimes.length - 1].toFixed(1)} ms |`
    );
    console.log(["| 项目 | 耗时 |", "| --- | --- |", ...rows].join("\n"));
    main.close();
    index.close();
  }, 1_800_000);
});
