import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mainSchema from "@tau/db-schema/schema/main.sql?raw";
import indexSchema from "@tau/db-schema/schema/index.sql?raw";

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => "/tmp" },
}));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));

import { analyzeContent, findCandidates, proseOf, readInsights } from "../content-insights";
import ContentAiMetaTable from "../tables/content-ai-meta";

const DIM = 8;
const PROSE =
  "这是一段足够长的正文文字，用来通过文字量的过滤条件，讲的是浏览器渲染流程里布局与合成的关系和代价。".repeat(
    2
  );

function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe("content-insights", () => {
  let main: Database.Database;
  let index: Database.Database;
  const random = rng(11);
  const near = (axis: number, noise = 0.05) =>
    Array.from({ length: DIM }, (_, i) => (i === axis ? 1 : 0) + (random() - 0.5) * noise);
  const para = (value: string) => ({
    type: "paragraph",
    children: [{ type: "formatted", text: value }],
  });

  const addContent = (blocks: unknown[]) =>
    Number(
      main
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 100, 1)`
        )
        .run(JSON.stringify(blocks)).lastInsertRowid
    );
  const addVector = (
    key: string,
    chunk: number,
    vector: number[],
    sectionText = PROSE,
    heading = ""
  ) => {
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, ?, vec_f32(?))`
      )
      .run(key, key.split(":")[0], BigInt(chunk), JSON.stringify(vector));
    index
      .prepare(
        `INSERT INTO content_sections (prefixed_id, update_time, chunk_index, heading_path, block_start, block_end, char_count, text)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`
      )
      .run(key, chunk, heading, chunk, chunk, sectionText.length, sectionText);
  };
  const addCard = (text: string, vector: number[], sectionText = PROSE) => {
    const contentId = addContent([para(text)]);
    const id = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, content_id) VALUES (1, 1, '[]', ?)`
        )
        .run(contentId).lastInsertRowid
    );
    addVector(`card:${id}`, 0, vector, sectionText);
    return { id, contentId };
  };

  beforeEach(() => {
    main = new Database(":memory:");
    main.exec(mainSchema);
    index = new Database(":memory:");
    sqliteVec.load(index);
    index.exec(indexSchema);
    index.exec(`CREATE VIRTUAL TABLE vec_documents USING vec0(
      prefixed_id TEXT, update_time FLOAT, content TEXT, type TEXT, chunk_index INTEGER,
      vec_embedding FLOAT[${DIM}] distance_metric=cosine)`);
    index
      .prepare(`INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, 1)`)
      .run("main_content_embedding_fingerprint", "model-a");
    for (let i = 0; i < 60; i++) addCard(`噪音 ${i}`, near(1 + (i % 2), 0.8));
  });
  afterEach(() => {
    main.close();
    index.close();
  });

  const addArticle = () => {
    const blocks = [
      { type: "header", level: 2, children: [{ type: "formatted", text: "布局" }] },
      para("读 offsetTop 时会触发强制同步布局，代价很高。"),
      { type: "header", level: 2, children: [{ type: "formatted", text: "合成" }] },
      para("只改 transform 和 opacity 时可以只走合成。"),
    ];
    const contentId = addContent(blocks);
    const id = Number(
      main
        .prepare(
          `INSERT INTO articles (title, create_time, update_time, content_id) VALUES ('浏览器渲染', 1, 1, ?)`
        )
        .run(contentId).lastInsertRowid
    );
    addVector(`article:${id}`, 0, near(0), PROSE, "布局");
    addVector(`article:${id}`, 1, near(0), "短", "合成");
    return { ref: { kind: "article" as const, id }, contentId, blocks };
  };

  it("文字量过滤：去掉代码、图片、链接后计数", () => {
    expect(proseOf("```js\nconst a = 1\n```\n![](x.png) [链接文字](http://a.b) 正文")).toBe(
      "链接文字正文"
    );
  });

  it("候选：排除已有关系与文字太少的节，按对方正文去重，带要点与主张", () => {
    const article = addArticle();
    const linked = addCard("已经连接的卡", near(0));
    main
      .prepare(
        `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time) VALUES ('article', ?, 'card', ?, 'derived', 1)`
      )
      .run(String(article.ref.id), String(linked.id));
    const good = addCard("掉帧排查", near(0));
    const short = addCard("只有链接的卡", near(0), "[x](http://a)");
    ContentAiMetaTable.upsert(main, {
      contentId: good.contentId,
      textDigest: "d",
      meta: { title: "掉帧排查", summary: "批量读写", concepts: [], claims: ["读布局会强制同步"] },
      model: "p/m",
    });
    const self = {
      ref: article.ref,
      key: `article:${article.ref.id}`,
      contentId: article.contentId,
      title: "浏览器渲染",
      content: article.blocks as never,
    };
    const { candidates, linkedKeys } = findCandidates(main, index, self);
    const ids = candidates.map(c => c.target.ref.id);
    expect(ids).toContain(good.id);
    expect(ids).not.toContain(linked.id);
    expect(ids).not.toContain(short.id);
    expect(linkedKeys).toContain(`card:${linked.id}`);
    expect(candidates.find(c => c.target.ref.id === good.id)!.prompt).toMatchObject({
      summary: "批量读写",
      claims: ["读布局会强制同步"],
    });
    expect(candidates.map(c => c.no)).toEqual(candidates.map((_, i) => i + 1));
  });

  it("指定候选：不受近邻阈值约束、排在前面并标记，已有关系与本文仍排除", () => {
    const article = addArticle();
    const far = addCard("白板上的远亲", near(5));
    const linked = addCard("已经连接的卡", near(0));
    main
      .prepare(
        `INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time) VALUES ('article', ?, 'card', ?, 'derived', 1)`
      )
      .run(String(article.ref.id), String(linked.id));
    const self = {
      ref: article.ref,
      key: `article:${article.ref.id}`,
      contentId: article.contentId,
      title: "浏览器渲染",
      content: article.blocks as never,
    };
    expect(findCandidates(main, index, self).candidates.map(c => c.target.ref.id)).not.toContain(
      far.id
    );
    const { candidates } = findCandidates(main, index, self, {
      seed: [{ kind: "card", id: far.id }, { kind: "card", id: linked.id }, article.ref],
    });
    expect(candidates[0]).toMatchObject({ seeded: true, target: { ref: { id: far.id } } });
    expect(candidates.filter(c => c.seeded)).toHaveLength(1);
    expect(candidates.map(c => c.target.ref.id)).not.toContain(linked.id);
  });

  it("分析：一次调用，核对片段，保存结果；正文大改后标记为过期", async () => {
    const article = addArticle();
    const good = addCard("掉帧排查", near(0));
    const complete = vi.fn(async (request: { messages: Array<{ content: string }> }) => {
      const prompt = request.messages[0].content;
      const no = Number(prompt.match(/\[候选 (\d+)\] 卡片《掉帧排查》/)![1]);
      return {
        ok: true,
        text: JSON.stringify({
          lead: "这是渲染主题里的一篇。",
          marks: [
            {
              type: "link",
              section: 1,
              anchor: "强制同步布局",
              candidate: no,
              why: "那张卡是真实案例",
            },
            { type: "link", section: 1, anchor: "编造的片段", candidate: no, why: "对不上" },
            { type: "gap", section: 1, text: "合成层怎么划分", why: "没写" },
          ],
          asks: ["为什么 CSS 阻塞渲染？"],
        }),
      };
    });
    const phases: string[] = [];
    const result = await analyzeContent(
      { complete: complete as never, now: () => 500 },
      main,
      index,
      article.ref,
      { providerId: "p", modelId: "m" },
      phase => phases.push(phase.phase)
    );
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toMatchObject({
      source: { feature: "contentInsights" },
      thinking: "off",
    });
    expect(phases).toEqual(["candidates", "thinking"]);
    expect(result.result.marks.map(m => [m.kind, m.anchor || m.text, m.target?.ref.id])).toEqual([
      ["link", "强制同步布局", good.id],
      ["gap", "合成层怎么划分", undefined],
    ]);
    expect(result).toMatchObject({ analyzedAt: 500, stale: false, model: "p/m" });
    expect(readInsights(main, article.ref)!.stale).toBe(false);

    main
      .prepare(`UPDATE contents SET content = ? WHERE id = ?`)
      .run(
        JSON.stringify([para("今天整理书架，下午去公园散步，晚上做了番茄炒蛋。")]),
        article.contentId
      );
    expect(readInsights(main, article.ref)!.stale).toBe(true);
  });

  it("模型失败时报错；输出无法解析时再试一次仍不行才报错，不写入", async () => {
    const article = addArticle();
    const failing = { complete: async () => ({ ok: false, text: "", error: "401" }), now: () => 1 };
    await expect(
      analyzeContent(failing, main, index, article.ref, { providerId: "p", modelId: "m" })
    ).rejects.toThrow("401");
    const garbage = { complete: vi.fn(async () => ({ ok: true, text: "抱歉" })), now: () => 1 };
    await expect(
      analyzeContent(garbage, main, index, article.ref, { providerId: "p", modelId: "m" })
    ).rejects.toThrow("无法解析");
    expect(garbage.complete).toHaveBeenCalledTimes(2);
    expect(readInsights(main, article.ref)).toBeNull();
  });
});
