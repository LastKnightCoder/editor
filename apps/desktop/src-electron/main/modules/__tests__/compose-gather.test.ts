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

import { gather, paragraphSimilarity } from "../compose-gather";
import { parseGatherOutput } from "../compose-gather-prompt";
import ComposeBoardTable from "../tables/compose-board";
import ContentAiMetaTable from "../tables/content-ai-meta";

const DIM = 8;
const axis = (index: number, noise = 0) =>
  Array.from({ length: DIM }, (_, i) => (i === index ? 1 : 0) + (i === 7 ? noise : 0));
const para = (text: string) => ({ type: "paragraph", children: [{ type: "formatted", text }] });

describe("compose-gather", () => {
  let main: Database.Database;
  let index: Database.Database;

  const addContent = (text: string) =>
    Number(
      main
        .prepare(
          `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, ?, 10, 1)`
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
  const addCard = (text: string, vector: number[]) => {
    const contentId = addContent(text);
    const id = Number(
      main
        .prepare(
          `INSERT INTO cards (create_time, update_time, tags, links, content_id) VALUES (1, 1, '[]', '[]', ?)`
        )
        .run(contentId).lastInsertRowid
    );
    addVector(`card:${id}`, vector);
    return { id, contentId, key: `card:${id}` };
  };
  const addArticle = (title: string, vector: number[] | null) => {
    const contentId = addContent("正文");
    const id = Number(
      main
        .prepare(
          `INSERT INTO articles (title, create_time, update_time, content_id) VALUES (?, 1, 1, ?)`
        )
        .run(title, contentId).lastInsertRowid
    );
    if (vector) addVector(`article:${id}`, vector);
    return { id, contentId, key: `article:${id}` };
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
  });
  afterEach(() => {
    main.close();
    index.close();
  });

  it("候选排除本文、白板上已有与移走的；概念补召回；按模型分组返回", async () => {
    const self = addArticle("间隔重复为什么有效", axis(0));
    const near = addCard("遗忘曲线", axis(0, 0.1));
    const onBoard = addCard("提取练习", axis(0, 0.2));
    const dismissed = addCard("被移走的", axis(0, 0.3));
    const linked = addCard("显式连接的", axis(0, 0.35));
    const cited = addCard("正文里引用的", axis(0, 0.4));
    main
      .prepare(
        `INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (?, ?, 1)`
      )
      .run(Math.min(self.contentId, linked.contentId), Math.max(self.contentId, linked.contentId));
    main.prepare(`UPDATE contents SET content = ? WHERE id = ?`).run(
      JSON.stringify([
        {
          type: "paragraph",
          children: [
            { type: "formatted", text: "见" },
            {
              type: "content-link",
              refId: cited.id,
              contentId: cited.contentId,
              contentType: "card",
              contentTitle: "x",
              children: [{ type: "formatted", text: "x" }],
            },
          ],
        },
      ]),
      self.contentId
    );
    const concept = addCard("向量没召回但概念对上", axis(4));
    ContentAiMetaTable.upsert(main, {
      contentId: concept.contentId,
      textDigest: "d",
      meta: { title: "", summary: "FSRS 调度", concepts: ["FSRS"], claims: [] },
      model: "p/m",
    });
    ComposeBoardTable.ensure(main, self.contentId, "写间隔重复");
    ComposeBoardTable.dismiss(main, self.contentId, [dismissed.key]);

    let prompt = "";
    const complete = vi.fn(async (request: { messages: Array<{ content: string }> }) => {
      prompt = request.messages[0].content;
      const no = (title: string) =>
        Number(prompt.match(new RegExp(`\\[(\\d+)\\] 卡片 › ${title}`))![1]);
      return {
        ok: true,
        text: JSON.stringify({
          groups: [
            {
              name: "为什么有效的机制",
              items: [
                { candidate: no("遗忘曲线"), why: "起点" },
                { candidate: 999, why: "不存在" },
              ],
            },
            { name: "调度", items: [{ candidate: no("向量没召回但概念对上"), why: "一手材料" }] },
            { name: "空组", items: [] },
          ],
        }),
      };
    });
    const phases: string[] = [];
    const result = await gather(
      { embed: async () => [axis(0)], complete: complete as never },
      main,
      index,
      { contentId: self.contentId, intent: "解释间隔重复和 FSRS", exclude: [onBoard.key] },
      { providerId: "p", modelId: "m" },
      phase => phases.push(phase.phase)
    );
    expect(phases).toEqual(["candidates", "thinking"]);
    expect(prompt).not.toContain("提取练习");
    expect(prompt).not.toContain("被移走的");
    expect(prompt).not.toContain("显式连接的");
    expect(prompt).not.toContain("正文里引用的");
    expect(prompt).not.toContain("间隔重复为什么有效》");
    expect(result.groups).toEqual([
      {
        name: "为什么有效的机制",
        items: [expect.objectContaining({ ref: { kind: "card", id: near.id }, why: "起点" })],
      },
      {
        name: "调度",
        items: [
          expect.objectContaining({ ref: { kind: "card", id: concept.id }, why: "一手材料" }),
        ],
      },
    ]);
  });

  it("没有意图也没有正文时拒绝；没有候选时不调模型", async () => {
    const empty = main
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (1, 1, '[]', 0, 1)`
      )
      .run().lastInsertRowid;
    const complete = vi.fn();
    const deps = { embed: async () => [axis(0)], complete: complete as never };
    await expect(
      gather(
        deps,
        main,
        index,
        { contentId: Number(empty), intent: " ", exclude: [] },
        {
          providerId: "p",
          modelId: "m",
        }
      )
    ).rejects.toThrow();
    const result = await gather(
      deps,
      main,
      index,
      { contentId: Number(empty), intent: "随便写写", exclude: [] },
      { providerId: "p", modelId: "m" }
    );
    expect(result).toEqual({ groups: [], candidates: 0 });
    expect(complete).not.toHaveBeenCalled();
  });

  it("解析：截断组名与理由、编号去重、超出上限的丢弃", () => {
    const parsed = parseGatherOutput(
      `好的 {"groups":[{"name":"一个非常非常非常非常非常长的组名","items":[{"candidate":1,"why":"${"很".repeat(60)}"},{"candidate":1,"why":"重复"}]}]}`,
      new Set([1, 2])
    );
    expect(parsed!.groups[0].name).toHaveLength(16);
    expect(parsed!.groups[0].items).toHaveLength(1);
    expect(parsed!.groups[0].items[0].why).toHaveLength(40);
    expect(parseGatherOutput("不是 JSON", new Set([1]))).toBeNull();
  });

  it("段落比对：取各份资料节向量的最大余弦", () => {
    const a = addCard("a", axis(0));
    const b = addCard("b", axis(3));
    const { scores } = paragraphSimilarity(index, axis(0), [a.key, b.key, "card:999"]);
    expect(scores[0].similarity).toBeCloseTo(1);
    expect(scores[1].similarity).toBeCloseTo(0);
    expect(scores[2].similarity).toBe(0);
  });
});
