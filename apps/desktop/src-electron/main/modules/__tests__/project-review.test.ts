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

import type { PiSingleShotRequest } from "@/types/pi-llm";
import { projectTree, projectsDue, reviewProject, FINAL_RECENT_MS } from "../project-review";
import ContentAiMetaTable from "../tables/content-ai-meta";
import KnowledgeAiInsightsTable from "../tables/knowledge-ai-insights";
import { buildContext, type TopicInsightsDeps } from "../topic-insights";
import { FINAL_REVIEW_SYSTEM_PROMPT, GROWTH_REVIEW_SYSTEM_PROMPT } from "../topic-insights-prompt";

const DIM = 8;
const DAY = 24 * 3600_000;
const SLOT = { providerId: "deepseek", modelId: "flash" };
const axis = (index: number, tilt = 0) =>
  Array.from({ length: DIM }, (_, i) => (i === index ? 1 : 0) + (i === 7 ? tilt : 0));
const para = (text: string) => ({ type: "paragraph", children: [{ type: "formatted", text }] });

describe("项目回顾", () => {
  let main: Database.Database;
  let index: Database.Database;
  let now = 1_790_000_000_000;
  let prompts: Array<{ system: string; prompt: string }> = [];
  const ids: Record<string, number> = {};

  const addContent = (text: string) =>
    Number(
      main
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 100, 1)`
        )
        .run(JSON.stringify([para(text)])).lastInsertRowid
    );
  const addVector = (key: string, vector: number[]) =>
    index
      .prepare(
        `INSERT INTO vec_documents (prefixed_id, update_time, content, type, chunk_index, vec_embedding)
         VALUES (?, 1.0, '', ?, 0, vec_f32(?))`
      )
      .run(key, key.split(":")[0], JSON.stringify(vector));
  const meta = (contentId: number, summary: string) =>
    ContentAiMetaTable.upsert(
      main,
      {
        contentId,
        textDigest: "d",
        meta: { title: "", summary, concepts: [], claims: [] },
        model: "m",
      },
      1
    );
  const addProject = (name: string, archived = false, updateTime = now) => {
    ids[name] = Number(
      main
        .prepare(
          `INSERT INTO project (create_time, update_time, title, children, archived) VALUES (1, ?, ?, '[]', ?)`
        )
        .run(updateTime, name, archived ? 1 : 0).lastInsertRowid
    );
  };
  const addItem = (
    project: string,
    name: string,
    vector: number[] | null,
    parent?: string,
    ref?: { kind: "card"; id: number }
  ) => {
    const contentId = ref ? null : addContent(`${name} 的正文`);
    const id = Number(
      main
        .prepare(
          `INSERT INTO project_item (create_time, update_time, title, children, parents, projects, ref_type, ref_id, project_item_type, content_id)
           VALUES (1, 1, ?, '[]', ?, ?, ?, ?, 'document', ?)`
        )
        .run(
          name,
          JSON.stringify(parent ? [ids[parent]] : []),
          JSON.stringify([ids[project]]),
          ref?.kind ?? null,
          ref?.id ?? null,
          contentId
        ).lastInsertRowid
    );
    ids[name] = id;
    if (parent) {
      const row = main
        .prepare(`SELECT children FROM project_item WHERE id = ?`)
        .get(ids[parent]) as {
        children: string;
      };
      main
        .prepare(`UPDATE project_item SET children = ? WHERE id = ?`)
        .run(JSON.stringify([...JSON.parse(row.children), id]), ids[parent]);
    } else {
      const row = main.prepare(`SELECT children FROM project WHERE id = ?`).get(ids[project]) as {
        children: string;
      };
      main
        .prepare(`UPDATE project SET children = ? WHERE id = ?`)
        .run(JSON.stringify([...JSON.parse(row.children), id]), ids[project]);
    }
    if (contentId) meta(contentId, `${name} 的要点`);
    if (vector) addVector(`project-item:${id}`, vector);
  };
  const addCard = (name: string, vector: number[]) => {
    const contentId = addContent(`${name} 的正文`);
    ids[name] = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)`
        )
        .run(contentId).lastInsertRowid
    );
    meta(contentId, `${name} 的要点`);
    addVector(`card:${ids[name]}`, vector);
  };

  const deps: TopicInsightsDeps = {
    now: () => now,
    complete: async (request: Omit<PiSingleShotRequest, "requestId">) => {
      const prompt = String(request.messages[0].content);
      prompts.push({ system: request.system ?? "", prompt });
      const reply = (value: unknown) => ({ ok: true, text: JSON.stringify(value) });
      if (request.system === GROWTH_REVIEW_SYSTEM_PROMPT) {
        return reply({
          lead: "长了 2 篇",
          belong: prompt.includes("C1 ")
            ? [{ candidate: "C1", branch: "D1", why: "补上合成" }]
            : [],
          thin: [{ branch: "D4", text: "这里还薄：只讲了工具", why: "只有一篇" }],
          asks: ["一帧里各阶段各占多少？"],
        });
      }
      return reply({
        lead: "留下 2 个观点",
        core: ["D2"],
        asks: ["合成层太多为什么变慢？"],
        home: prompt.includes("P1 ") ? "P1" : null,
      });
    },
  };
  const ctx = () => buildContext(main, index, { nodes: [], topics: [], computedAt: 0 });

  beforeEach(() => {
    now = 1_790_000_000_000;
    prompts = [];
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

    addCard("散落的合成层卡片", axis(0, 0.05));
    addCard("无关的卡片", axis(5));
    addCard("已经引用的卡片", axis(0, 0.03));
    addProject("浏览器渲染");
    addItem("浏览器渲染", "渲染流水线", axis(0));
    addItem("浏览器渲染", "布局", axis(0, 0.02), "渲染流水线");
    addItem("浏览器渲染", "性能测量", axis(3));
    addItem("浏览器渲染", "引用", null, "渲染流水线", { kind: "card", id: ids["已经引用的卡片"] });
    addProject("前端体系");
    for (const name of ["渲染篇", "网络篇", "工程化"]) addItem("前端体系", name, axis(0, 0.04));

    const vectors = (
      index.prepare(`SELECT COUNT(*) AS n FROM vec_documents`).get() as { n: number }
    ).n;
    index
      .prepare(`INSERT INTO index_meta (key, value, updated_at) VALUES (?, ?, 1)`)
      .run(
        "related_similarity_threshold",
        JSON.stringify({ fingerprint: "model-a", value: 0.9, vectors, pairs: 1000, sampledAt: 1 })
      );
  });
  afterEach(() => {
    main.close();
    index.close();
  });

  it("文档树按项目顺序深度优先，记下顶层分支与引用型条目", () => {
    const tree = projectTree(main, ids["浏览器渲染"])!;
    expect(
      tree.items.map(item => [item.title, item.depth, item.root === ids["渲染流水线"]])
    ).toEqual([
      ["渲染流水线", 0, true],
      ["布局", 1, true],
      ["引用", 1, true],
      ["性能测量", 0, false],
    ]);
    expect(tree.items[2].ref).toEqual({ kind: "card", id: ids["已经引用的卡片"] });
  });

  it("生长回顾：可能属于这里只提项目外散落的卡片（已引用、无关的不提），还薄落在那一支", async () => {
    const row = (await reviewProject(deps, ctx(), ids["浏览器渲染"], SLOT))!;
    const prompt = prompts[0].prompt;
    expect(prompts[0].system).toBe(GROWTH_REVIEW_SYSTEM_PROMPT);
    expect(prompt).toContain("C1 卡片《");
    expect(prompt).not.toContain("已经引用的卡片 的要点｜");
    expect(prompt).not.toContain("无关的卡片");
    expect(row.overview.kind).toBe("growth");
    const [belong, thin] = row.result.marks;
    expect(belong).toMatchObject({ kind: "belong", under: ids["渲染流水线"] });
    expect(belong.ends[0].ref).toEqual({ kind: "card", id: ids["散落的合成层卡片"] });
    expect(thin).toMatchObject({
      kind: "thin",
      under: ids["性能测量"],
      text: "这里还薄：只讲了工具",
    });
    expect(row.result.asks).toHaveLength(1);
  });

  it("结项回顾：核心观点链到文档，归入最接近的进行中项目，覆盖原来的生长回顾并继承状态", async () => {
    const growth = (await reviewProject(deps, ctx(), ids["浏览器渲染"], SLOT))!;
    KnowledgeAiInsightsTable.setStatus(main, growth.id, "q1", "questioned");
    main.prepare(`UPDATE project SET archived = 1 WHERE id = ?`).run(ids["浏览器渲染"]);
    prompts = [];
    const final = (await reviewProject(deps, ctx(), ids["浏览器渲染"], SLOT))!;
    expect(prompts[0].system).toBe(FINAL_REVIEW_SYSTEM_PROMPT);
    expect(prompts[0].prompt).toContain("P1 前端体系（相近度");
    expect(final.id).toBe(growth.id);
    expect(final.overview.kind).toBe("final");
    expect(final.result.refs?.map(ref => ref.ref)).toEqual([
      { kind: "project-item", id: ids["布局"] },
    ]);
    expect(final.result.home).toEqual({ projectId: ids["前端体系"], title: "前端体系" });
    expect(final.result.marks).toHaveLength(0);
  });

  it("到期判断：最近归档的写结项；生长回顾隔 7 天且变化够大才重写；第一次不自动写", async () => {
    expect(projectsDue(ctx(), now)).toEqual([]);
    await reviewProject(deps, ctx(), ids["浏览器渲染"], SLOT);
    for (let i = 0; i < 5; i++) addItem("浏览器渲染", `新文档 ${i}`, axis(0));
    expect(projectsDue(ctx(), now + DAY)).toEqual([]);
    expect(projectsDue(ctx(), now + 8 * DAY)).toEqual([
      { projectId: ids["浏览器渲染"], kind: "growth" },
    ]);

    addProject("刚归档的课题", true, now);
    addProject("很久以前归档的", true, now - FINAL_RECENT_MS - DAY);
    expect(projectsDue(ctx(), now + 8 * DAY)[0]).toEqual({
      projectId: ids["刚归档的课题"],
      kind: "final",
    });
    expect(
      projectsDue(ctx(), now + 8 * DAY).some(due => due.projectId === ids["很久以前归档的"])
    ).toBe(false);
  });
});
