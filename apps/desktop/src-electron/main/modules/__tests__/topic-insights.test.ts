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
vi.mock("electron-log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../video-note-index-queue", () => ({
  default: { enqueueTask: vi.fn(), cleanupVideoNoteArtifacts: vi.fn() },
}));
vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));
vi.mock("../knowledge-map-builder", () => ({ default: {} }));

import type { KnowledgeMap } from "@/knowledge-map/types";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import ContentAiMetaTable from "../tables/content-ai-meta";
import KnowledgeAiInsightsTable from "../tables/knowledge-ai-insights";
import KnowledgeMapTable from "../tables/knowledge-map";
import {
  analyzeKnowledge,
  buildContext,
  metaCoverage,
  nameUnlabeled,
  planInsights,
  repeatsChain,
  readKnowledgeInsights,
  type TopicInsightsDeps,
} from "../topic-insights";
import {
  GLOBAL_SYSTEM_PROMPT,
  SUBTOPIC_SYSTEM_PROMPT,
  TOPIC_SYSTEM_PROMPT,
} from "../topic-insights-prompt";
import {
  conceptOverlap,
  growthSeries,
  mapGroups,
  pairCandidates,
} from "../topic-insights-candidates";

const DIM = 8;
const SLOT = { providerId: "deepseek", modelId: "flash" };
const HOUR = 3600_000;

const axis = (index: number, tilt = 0, tiltAxis = 7) =>
  Array.from({ length: DIM }, (_, i) => (i === index ? 1 : 0) + (i === tiltAxis ? tilt : 0));
const para = (text: string) => ({ type: "paragraph", children: [{ type: "formatted", text }] });

describe("topic-insights 分层阅读", () => {
  let main: Database.Database;
  let index: Database.Database;
  let now = 1_790_000_000_000;
  const keys: Record<string, string> = {};
  const contentIds: Record<string, number> = {};
  let calls: Array<{ system: string; prompt: string }> = [];
  let anchorReply = "词法环境";

  const addContent = (blocks: unknown[]) =>
    Number(
      main
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 100, 1)`
        )
        .run(JSON.stringify(blocks)).lastInsertRowid
    );
  const addVector = (key: string, chunk: number, vector: number[], text = "节原文", block = 0) => {
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, ?, vec_f32(?))`
      )
      .run(key, key.split(":")[0], BigInt(chunk), JSON.stringify(vector));
    index
      .prepare(
        `INSERT INTO content_sections (prefixed_id, update_time, chunk_index, heading_path, block_start, block_end, char_count, text)
         VALUES (?, 1, ?, '', ?, ?, ?, ?)`
      )
      .run(key, chunk, block, block, text.length, text);
  };
  // 默认每份笔记的概念各不相同（共同的「事件循环」之外带上自己的名字），概念重合不会把呼应排除掉
  const setMeta = (name: string, summary: string, concepts = ["事件循环", name, `${name} 细节`]) =>
    ContentAiMetaTable.upsert(
      main,
      {
        contentId: contentIds[name],
        textDigest: "d",
        meta: { title: name, summary, concepts, claims: [] },
        model: "m",
      },
      1
    );
  const addCard = (name: string, vector: number[]) => {
    const contentId = addContent([para(`${name} 的正文`)]);
    const id = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (?, 1, '[]', '[]', ?)`
        )
        .run(now - 30 * 24 * HOUR, contentId).lastInsertRowid
    );
    keys[name] = `card:${id}`;
    contentIds[name] = contentId;
    addVector(`card:${id}`, 0, vector);
    setMeta(name, `${name} 的要点`);
  };
  const addArticle = (name: string) => {
    const contentId = addContent([
      { type: "header", level: 2, children: [{ type: "formatted", text: "闭包" }] },
      para("闭包是函数加上它被创建时的词法环境。"),
    ]);
    const id = Number(
      main
        .prepare(
          `INSERT INTO articles (title, create_time, update_time, content_id) VALUES (?, ?, 1, ?)`
        )
        .run(name, now - 10 * 24 * HOUR, contentId).lastInsertRowid
    );
    keys[name] = `article:${id}`;
    contentIds[name] = contentId;
    addVector(`article:${id}`, 0, axis(1, 0.1, 6), "闭包是函数加上它被创建时的词法环境。", 0);
    setMeta(name, "闭包的定义");
  };

  /** JavaScript（事件循环 / 闭包）+ 学习方法（没细分）；ids 可整体换号，模拟地图重算 */
  const saveMap = (ids = { js: 0, loop: 10, closure: 11, learn: 1 }) => {
    const node = (name: string, topic: number, subtopic: number) => ({
      key: keys[name],
      x: 0,
      y: 0,
      topic,
      subtopic,
    });
    const map: KnowledgeMap = {
      computedAt: now,
      topics: [
        { id: ids.js, parent: -1, label: "JavaScript", colorSlot: 0, size: 8 },
        { id: ids.learn, parent: -1, label: "学习方法", colorSlot: 1, size: 4 },
        { id: ids.loop, parent: ids.js, label: "事件循环", colorSlot: 0, size: 4 },
        { id: ids.closure, parent: ids.js, label: "闭包", colorSlot: 0, size: 4 },
      ],
      nodes: [
        ...["c1", "c2", "c3", "c4"].map(name => node(name, ids.js, ids.loop)),
        ...["c5", "a1", "c6", "c7"].map(name => node(name, ids.js, ids.closure)),
        ...["c9", "c10", "c11", "c12"].map(name => node(name, ids.learn, -1)),
      ],
    };
    KnowledgeMapTable.save(index, map, "model-a");
  };

  const deps: TopicInsightsDeps = {
    now: () => now,
    complete: async (request: Omit<PiSingleShotRequest, "requestId">) => {
      const prompt = String(request.messages[0].content);
      calls.push({ system: request.system ?? "", prompt });
      const reply = (value: unknown) => ({ ok: true, text: JSON.stringify(value) });
      if (request.system === SUBTOPIC_SYSTEM_PROMPT) {
        const articleNo = prompt.match(/\[(\d+)\] 文章/)?.[1];
        return reply({
          overview: "子主题概述",
          shift: "",
          pattern: null,
          chain: null,
          pairs: prompt.includes("P1：")
            ? [
                {
                  pair: "P1",
                  type: "dup",
                  why: "说的是同一件事",
                  anchors: articleNo ? { [articleNo]: anchorReply } : {},
                },
              ]
            : [],
        });
      }
      if (request.system === TOPIC_SYSTEM_PROMPT) {
        return reply({
          overview: "主题概述",
          shift: "",
          lead: "主题两三句",
          gaps: [{ text: "还缺：模块加载", why: "没有讲模块" }],
          asks: ["await 之后在哪一轮？"],
          pick: prompt.includes("M1 ") ? ["M1"] : [],
        });
      }
      if (request.system === GLOBAL_SYSTEM_PROMPT) {
        return reply({
          lead: "版图两三句",
          bridges: prompt.includes("B1：")
            ? [{ candidate: "B1", principle: "共同的道理", why: "同一个道理" }]
            : [],
          asked: [],
          asks: [],
        });
      }
      return { ok: false, text: "", error: "未知提示词" };
    },
  };
  const count = (system: string) => calls.filter(call => call.system === system).length;
  const run = (force = false) => {
    calls = [];
    const map = KnowledgeMapTable.load(index)!;
    return analyzeKnowledge(deps, buildContext(main, index, map), SLOT, { force });
  };

  beforeEach(() => {
    now = 1_790_000_000_000;
    anchorReply = "词法环境";
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
    ["c1", "c2", "c3", "c4"].forEach((name, i) => addCard(name, axis(0, i * 0.01)));
    addCard("c5", axis(1));
    addArticle("a1");
    addCard("c6", axis(3));
    addCard("c7", axis(4));
    ["c9", "c10", "c11"].forEach((name, i) => addCard(name, axis(2, i * 0.01)));
    // 学习方法里的这一张和事件循环在讲同一件事：跨主题的呼应候选
    addCard("c12", axis(0, 0.02));
    const vectors = (
      index.prepare(`SELECT COUNT(*) AS n FROM vec_documents`).get() as { n: number }
    ).n;
    index
      .prepare(`INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, 1)`)
      .run(
        "related_similarity_threshold",
        JSON.stringify({ fingerprint: "model-a", value: 0.9, vectors, pairs: 1000, sampledAt: 1 })
      );
    saveMap();
  });
  afterEach(() => {
    main.close();
    index.close();
  });

  it("候选：分组、生长、相近对排除已连接并限制每份出现次数", () => {
    const map = KnowledgeMapTable.load(index)!;
    const groups = mapGroups(map, KnowledgeMapTable.listEntities(main));
    expect(groups.map(topic => [topic.label, topic.groups.map(group => group.label)])).toEqual([
      ["JavaScript", ["事件循环", "闭包"]],
      ["学习方法", ["学习方法"]],
    ]);
    const series = growthSeries([now, now - 100 * 24 * HOUR, 0], now, 4);
    expect(series.map(item => item.count)).toEqual([0, 0, 1, 1]);
    const vectors = ["a", "b", "c", "d", "e"].map(key => ({
      key,
      mean: new Float32Array(axis(0, key.charCodeAt(0) * 0.001)),
      chunks: [],
    }));
    const pairs = pairCandidates(vectors, (x, y) => x === "a" && y === "b", 0.9, 10);
    expect(pairs.some(pair => pair.left === "a" && pair.right === "b")).toBe(false);
    for (const key of ["a", "b", "c", "d", "e"]) {
      expect(
        pairs.filter(pair => pair.left === key || pair.right === key).length
      ).toBeLessThanOrEqual(3);
    }
  });

  it("首轮：三层都写，子主题挂到主题下，长文片段逐字核对后带上", async () => {
    const outcome = await run();
    expect(outcome).toMatchObject({ subtopics: 3, topics: 2, global: true, failures: 0 });
    expect([
      count(SUBTOPIC_SYSTEM_PROMPT),
      count(TOPIC_SYSTEM_PROMPT),
      count(GLOBAL_SYSTEM_PROMPT),
    ]).toEqual([3, 2, 1]);
    const topics = KnowledgeAiInsightsTable.list(main, "topic");
    const subtopics = KnowledgeAiInsightsTable.list(main, "subtopic");
    const js = topics.find(row => row.label === "JavaScript")!;
    expect(
      subtopics
        .filter(row => row.parentId === js.id)
        .map(row => row.label)
        .sort()
    ).toEqual(["事件循环", "闭包"]);
    expect(js.result.lead).toBe("主题两三句");
    expect(js.result.marks.map(mark => mark.kind)).toEqual(["dup", "gap"]);
    expect(js.result.growth).toHaveLength(12);

    const closure = subtopics.find(row => row.label === "闭包")!;
    const article = closure.result.marks[0].ends.find(end => end.ref.kind === "article")!;
    expect(article).toMatchObject({ anchor: "词法环境", block: 1 });

    const global = KnowledgeAiInsightsTable.list(main, "global")[0];
    expect(global.result.lead).toBe("版图两三句");
    const bridge = global.result.marks[0];
    expect(bridge.kind).toBe("bridge");
    expect(bridge.text).toBe("共同的道理");
    expect(new Set(bridge.ends.map(end => end.topic))).toEqual(new Set(["JavaScript", "学习方法"]));
    expect(calls.find(call => call.system === GLOBAL_SYSTEM_PROMPT)!.prompt).toContain("候选呼应");
  });

  it("长文片段对不上原文就丢掉，标记照留", async () => {
    anchorReply = "原文里没有这句";
    await run();
    const closure = KnowledgeAiInsightsTable.list(main, "subtopic").find(
      row => row.label === "闭包"
    )!;
    const article = closure.result.marks[0].ends.find(end => end.ref.kind === "article")!;
    expect(article.anchor).toBeUndefined();
  });

  it("没变化不调用；改了 1/4 增量改写，后台不重写全局，点按钮重写", async () => {
    await run();
    expect((await run()).subtopics).toBe(0);
    expect(calls).toHaveLength(0);

    now += HOUR;
    setMeta("c1", "改过的要点");
    const outcome = await run();
    expect(outcome).toMatchObject({ subtopics: 1, topics: 1, global: false });
    expect(calls[0].prompt).toContain("上一次的概述：子主题概述");
    const loop = KnowledgeAiInsightsTable.list(main, "subtopic").find(
      row => row.label === "事件循环"
    )!;
    expect(loop.increments).toBe(1);

    now += HOUR;
    setMeta("c2", "又改了");
    expect((await run(true)).global).toBe(true);
  });

  it("全局 6 小时后才在后台重写；连续增量 3 次后完整重写", async () => {
    await run();
    for (let i = 0; i < 3; i++) {
      now += HOUR;
      setMeta("c1", `第 ${i} 次`);
      await run();
    }
    const loop = () =>
      KnowledgeAiInsightsTable.list(main, "subtopic").find(row => row.label === "事件循环")!;
    expect(loop().increments).toBe(3);
    now += 4 * HOUR;
    setMeta("c1", "第 4 次");
    const outcome = await run();
    expect(loop().increments).toBe(0);
    expect(calls[0].prompt).not.toContain("上一次的概述");
    expect(outcome.global).toBe(true);
  });

  it("不相关的标记重新生成后不再出现", async () => {
    await run();
    const js = () =>
      KnowledgeAiInsightsTable.list(main, "topic").find(row => row.label === "JavaScript")!;
    const dup = js().result.marks.find(mark => mark.kind === "dup")!;
    KnowledgeAiInsightsTable.setStatus(main, js().id, dup.id, "dismissed");
    now += HOUR;
    setMeta("c1", "改过的要点");
    await run();
    expect(calls.some(call => call.system === TOPIC_SYSTEM_PROMPT)).toBe(true);
    expect(js().result.marks.map(mark => mark.kind)).toEqual(["gap"]);
  });

  it("地图重算主题换号：按成员对回原行，不重新调用；读结果带当前主题 id", async () => {
    await run();
    const before = KnowledgeAiInsightsTable.list(main)
      .map(row => row.id)
      .sort();
    saveMap({ js: 5, loop: 50, closure: 51, learn: 6 });
    await run();
    expect(calls).toHaveLength(0);
    expect(
      KnowledgeAiInsightsTable.list(main)
        .map(row => row.id)
        .sort()
    ).toEqual(before);
    const ctx = buildContext(main, index, KnowledgeMapTable.load(index)!);
    const payload = readKnowledgeInsights(ctx, main, { configured: true, running: false });
    expect(payload.topics.map(topic => [topic.label, topic.topicId]).sort()).toEqual([
      ["JavaScript", 5],
      ["学习方法", 6],
    ]);
    expect(payload.global?.result.lead).toBe("版图两三句");
    expect(payload.coverage).toBe(1);
  });

  it("主题消失：对不上的旧行删掉；元信息覆盖率", async () => {
    await run();
    const map = KnowledgeMapTable.load(index)!;
    KnowledgeMapTable.save(
      index,
      {
        ...map,
        topics: map.topics.filter(topic => topic.label !== "学习方法"),
        nodes: map.nodes.map(node =>
          node.topic === 1 ? { ...node, topic: -1, subtopic: -1 } : node
        ),
      },
      "model-a"
    );
    const ctx = buildContext(main, index, KnowledgeMapTable.load(index)!);
    expect(planInsights(ctx).orphans).toHaveLength(2);
    await run();
    expect(KnowledgeAiInsightsTable.list(main, "topic").map(row => row.label)).toEqual([
      "JavaScript",
    ]);
    main
      .prepare(`DELETE FROM content_ai_meta WHERE content_id IN (?, ?)`)
      .run(contentIds.c1, contentIds.c2);
    expect(metaCoverage(buildContext(main, index, KnowledgeMapTable.load(index)!))).toBeCloseTo(
      6 / 8
    );
  });

  it("后台调用失败只跳过那一处；点按钮时直接报错", async () => {
    const failing: TopicInsightsDeps = {
      now: () => now,
      complete: async () => ({ ok: false, text: "", error: "额度用尽" }),
    };
    const ctx = buildContext(main, index, KnowledgeMapTable.load(index)!);
    const outcome = await analyzeKnowledge(failing, ctx, SLOT, { force: false });
    expect(outcome.failures).toBe(3);
    expect(KnowledgeAiInsightsTable.list(main)).toHaveLength(0);
    await expect(analyzeKnowledge(failing, ctx, SLOT, { force: true })).rejects.toThrow("额度用尽");
  });

  it("同一主题内连续 3 次失败即停：剩余子主题、主题与全局不再发出注定失败的请求", async () => {
    // 单主题 4 个子主题（各 3 成员），密钥失效时第 4 个子主题不应再被调用
    KnowledgeMapTable.save(
      index,
      {
        computedAt: now,
        topics: [
          { id: 0, parent: -1, label: "JavaScript", colorSlot: 0, size: 12 },
          { id: 10, parent: 0, label: "事件循环", colorSlot: 0, size: 3 },
          { id: 11, parent: 0, label: "闭包", colorSlot: 0, size: 3 },
          { id: 12, parent: 0, label: "DOM", colorSlot: 0, size: 3 },
          { id: 13, parent: 0, label: "模块", colorSlot: 0, size: 3 },
        ],
        nodes: [
          ...["c1", "c2", "c9"].map(name => ({ key: keys[name], x: 0, y: 0, topic: 0, subtopic: 10 })),
          ...["c3", "c4", "c10"].map(name => ({ key: keys[name], x: 0, y: 0, topic: 0, subtopic: 11 })),
          ...["c5", "a1", "c11"].map(name => ({ key: keys[name], x: 0, y: 0, topic: 0, subtopic: 12 })),
          ...["c6", "c7", "c12"].map(name => ({ key: keys[name], x: 0, y: 0, topic: 0, subtopic: 13 })),
        ],
      },
      "model-a"
    );
    calls = [];
    let invoked = 0;
    const failing: TopicInsightsDeps = {
      now: () => now,
      complete: async () => {
        invoked++;
        return { ok: false, text: "", error: "额度用尽" };
      },
    };
    const ctx = buildContext(main, index, KnowledgeMapTable.load(index)!);
    const outcome = await analyzeKnowledge(failing, ctx, SLOT, { force: false });
    expect(outcome.failures).toBe(3);
    expect(invoked).toBe(3);
    expect(KnowledgeAiInsightsTable.list(main)).toHaveLength(0);
  });

  it("没起名的主题与子主题用成员最常见的概念起名，不和主题名、同主题的其他子主题重名", () => {
    const meta = (concepts: string[]) => ({
      contentId: 0,
      schemaVer: 1,
      textDigest: "",
      model: "",
      createTime: 0,
      updateTime: 0,
      meta: { title: "", summary: "", concepts, claims: [] },
    });
    const member = (contentId: number) => ({ key: `card:${contentId}`, contentId }) as never;
    const metas = new Map([
      [1, meta(["JavaScript", "Promise", "事件循环"])],
      [2, meta(["Promise", "async"])],
      [3, meta(["Promise", "Set"])],
      [4, meta(["Set", "Map"])],
    ]);
    const [topic] = nameUnlabeled(
      [
        {
          topicId: 0,
          label: "JavaScript",
          members: [member(1), member(2), member(3), member(4)],
          groups: [
            { key: "0:1", topicId: 0, subtopicId: 1, label: "", members: [member(1), member(2)] },
            { key: "0:2", topicId: 0, subtopicId: 2, label: "", members: [member(3)] },
            { key: "0:3", topicId: 0, subtopicId: 3, label: " ", members: [] },
          ],
        },
      ],
      metas as never
    );
    expect(topic.groups.map(group => group.label)).toEqual(["Promise", "Set", "其他"]);
  });

  it("概念高度重合的跨主题配对是重复，不进呼应候选", async () => {
    // c12（学习方法）和事件循环那几张卡概念完全一样：只是被分进了不同主题
    for (const name of ["c1", "c2", "c3", "c4", "c12"]) {
      setMeta(name, `${name} 的要点`, ["事件循环", "微任务", "宏任务"]);
    }
    await run();
    expect(calls.find(call => call.system === GLOBAL_SYSTEM_PROMPT)!.prompt).toContain(
      "候选呼应：无"
    );
    expect(
      conceptOverlap(["warnings 模块", "warn 函数"], ["warnings模块", "UserWarning"])
    ).toBeCloseTo(1 / 3);
    expect(conceptOverlap([], ["x"])).toBe(0);
  });

  it("「还缺」复述已挑中的缺一环空位时不再单列", () => {
    const chain = {
      id: "s1",
      kind: "chain" as const,
      why: "",
      ends: [],
      missing: { index: 1, text: "从作用域到原型链的桥梁" },
      status: "open" as const,
    };
    expect(repeatsChain("还缺：作用域到原型链的桥", [chain])).toBe(true);
    expect(repeatsChain("还缺：模块加载", [chain])).toBe(false);
    expect(repeatsChain("还缺：作用域到原型链的桥", [])).toBe(false);
  });
});
