import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
// 队列类经依赖注入测试，模块接线用到的单例只需能被导入
vi.mock("../database", () => ({ default: {} }));
vi.mock("../pi-ai-runtime", () => ({ default: {} }));
vi.mock("../user-setting", () => ({ default: {} }));

import {
  ContentAiQueue,
  IDLE_MS,
  computeContentAiStatus,
  type ContentAiDeps,
} from "../content-ai-queue";
import ContentAiMetaTable from "../tables/content-ai-meta";

const SETTING = {
  llmProviders: [{ id: "p", models: [{ id: "m" }] }],
  llmUsageSettings: { contentMetadata: { providerId: "p", modelId: "m" } },
} as never;
const EMPTY_SETTING = { llmProviders: [], llmUsageSettings: {} } as never;

const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});
const LONG =
  "卡片是连接的枢纽，观点要能被单独引用，才能在不同的文章里反复出现。写作时先列出要回答的问题，再去材料里找证据，比先读完再写更不容易跑题。";

function addContent(db: Database.Database, text: string, time: number): number {
  const content = JSON.stringify(text ? [paragraph(text)] : []);
  return Number(
    db
      .prepare(
        `INSERT INTO contents (create_time, update_time, content, count, ref_count) VALUES (?, ?, ?, ?, 1)`
      )
      .run(time, time, content, text.length).lastInsertRowid
  );
}

function addCard(db: Database.Database, text: string, time = 1): number {
  const contentId = addContent(db, text, time);
  db.prepare(`INSERT INTO cards (create_time, update_time, content_id) VALUES (?, ?, ?)`).run(
    time,
    time,
    contentId
  );
  return contentId;
}

function editContent(db: Database.Database, contentId: number, text: string, time: number) {
  db.prepare(`UPDATE contents SET content = ?, count = ?, update_time = ? WHERE id = ?`).run(
    JSON.stringify([paragraph(text)]),
    text.length,
    time,
    contentId
  );
}

const okOutput = (title: string) =>
  JSON.stringify({ title, summary: "要点", concepts: ["卡片"], claims: [] });

describe("content-ai-queue", () => {
  let mainDb: Database.Database;
  let indexDb: Database.Database;
  let now: number;
  let complete: ReturnType<typeof vi.fn>;
  let notifyChanged: ReturnType<typeof vi.fn>;
  let queue: ContentAiQueue;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
    mainDb = new Database(":memory:");
    mainDb.exec(mainSchema);
    indexDb = new Database(":memory:");
    indexDb.exec(indexSchema);
    now = 1_000_000;
    complete = vi.fn(async () => ({ ok: true, text: okOutput("AI 标题") }));
    notifyChanged = vi.fn();
    const deps: ContentAiDeps = {
      databases: async name => (name === "a.db" ? { mainDb, indexDb } : null),
      complete: (request, signal) => complete(request, signal),
      notifyChanged,
      sleep: async () => undefined,
      now: () => now,
    };
    queue = new ContentAiQueue(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
    mainDb.close();
    indexDb.close();
  });

  it("槽未配置时不运行，配上即对账全部正文", async () => {
    const card = addCard(mainDb, LONG);
    queue.applySetting(EMPTY_SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(complete).not.toHaveBeenCalled();

    queue.applySetting(SETTING);
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);
    const row = ContentAiMetaTable.get(mainDb, card)!;
    expect(row.meta.title).toBe("AI 标题");
    expect(row.model).toBe("p/m");
    expect(complete.mock.calls[0][0]).toMatchObject({
      providerId: "p",
      modelId: "m",
      thinking: "off",
      source: { feature: "contentMetadata" },
    });
  });

  it("范围：卡片、文章、项目文档，最近更新的先处理；日记、空正文、外部材料不处理", async () => {
    const old = addCard(mainDb, "较早的卡片正文", 1);
    const recent = addCard(mainDb, "最近的卡片正文", 5);
    const articleContent = addContent(mainDb, "文章正文", 3);
    mainDb
      .prepare(
        `INSERT INTO articles (title, create_time, update_time, content_id) VALUES ('文章', 3, 3, ?)`
      )
      .run(articleContent);
    const docContent = addContent(mainDb, "项目文档正文", 2);
    mainDb
      .prepare(
        `INSERT INTO project_item (title, create_time, update_time, content_id) VALUES ('文档', 2, 2, ?)`
      )
      .run(docContent);
    const diaryContent = addContent(mainDb, "日记正文", 9);
    mainDb
      .prepare(
        `INSERT INTO diary_entries (id, type, date, create_time, update_time) VALUES (1, 'daily', '2026-10-01', 1, 1)`
      )
      .run();
    mainDb
      .prepare(
        `INSERT INTO diary_segments (diary_id, content_id, create_time, update_time) VALUES (1, ?, 1, 1)`
      )
      .run(diaryContent);
    const imageOnly = addContent(mainDb, "", 8);
    mainDb.prepare(`UPDATE contents SET count = 1 WHERE id = ?`).run(imageOnly);
    mainDb
      .prepare(`INSERT INTO cards (create_time, update_time, content_id) VALUES (8, 8, ?)`)
      .run(imageOnly);

    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    const order = complete.mock.calls.map(call => call[0].messages[0].content as string);
    expect(order).toHaveLength(4);
    expect(order[0]).toContain("最近的卡片正文");
    expect(order[1]).toContain("文章正文");
    expect(order[1]).toContain("标题：文章");
    expect(order[3]).toContain("较早的卡片正文");
    expect(ContentAiMetaTable.get(mainDb, diaryContent)).toBeNull();
    expect(ContentAiMetaTable.getMany(mainDb, [old, recent, articleContent, docContent]).size).toBe(
      4
    );
    const status = computeContentAiStatus(mainDb, true, false);
    // 只有图片的正文不调模型，记空元信息，进度能走满
    expect(ContentAiMetaTable.get(mainDb, imageOnly)).toMatchObject({
      model: "",
      meta: { title: "" },
    });
    expect(status).toMatchObject({ total: 5, processed: 5 });
    expect(status.estimatedTokens).toBeGreaterThan(5 * 400);
  });

  it("编辑静置 10 分钟后才判断；小改只记核对时间，大改重算", async () => {
    const card = addCard(mainDb, LONG);
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);

    now += 1000;
    editContent(mainDb, card, LONG.replace("枢纽", "中心"), now);
    queue.onContentWritten("a.db", card, "update");
    now += IDLE_MS - 1;
    queue.sweep();
    await queue.idle();
    expect(ContentAiMetaTable.get(mainDb, card)!.updateTime).toBeLessThan(now);

    now += 1;
    queue.sweep();
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(ContentAiMetaTable.get(mainDb, card)!.updateTime).toBe(now);

    complete.mockResolvedValue({ ok: true, text: okOutput("新标题") });
    now += 1000;
    editContent(mainDb, card, "今天整理了书架，把读过的小说按作者重新排列，下午去公园散步。", now);
    queue.onContentWritten("a.db", card, "update");
    now += IDLE_MS;
    queue.sweep();
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(ContentAiMetaTable.get(mainDb, card)!.meta.title).toBe("新标题");
  });

  it("连库对账时小改累积到阈值以下也会重算（指纹保留生成时的版本）", async () => {
    const card = addCard(mainDb, LONG);
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    const digest = ContentAiMetaTable.get(mainDb, card)!.textDigest;
    now += 1000;
    editContent(mainDb, card, LONG.replace("枢纽", "中心"), now);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(ContentAiMetaTable.get(mainDb, card)!.textDigest).toBe(digest);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("单份失败重试 2 次后跳过并记录，下次连库成功后清除记录", async () => {
    const card = addCard(mainDb, LONG);
    complete.mockResolvedValue({ ok: true, text: "不是 JSON" });
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(3);
    expect(ContentAiMetaTable.get(mainDb, card)).toBeNull();
    const record = () =>
      JSON.parse(
        (
          indexDb
            .prepare(`SELECT value FROM index_meta WHERE key = 'content_ai_failures'`)
            .get() as {
            value: string;
          }
        ).value
      );
    expect(record()).toEqual([expect.objectContaining({ contentId: card, error: "输出无法解析" })]);

    complete.mockResolvedValue({ ok: true, text: okOutput("AI 标题") });
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(ContentAiMetaTable.get(mainDb, card)).not.toBeNull();
    expect(record()).toEqual([]);
  });

  it("连续多份失败视为全局问题，停止本轮", async () => {
    for (let i = 0; i < 8; i++) addCard(mainDb, `${LONG}${i}`, i + 1);
    complete.mockResolvedValue({ ok: false, text: "", error: "401" });
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(5 * 3);
  });

  it("切库作废进行中的一轮，迟到的结果不写入", async () => {
    const card = addCard(mainDb, LONG);
    let release: (value: { ok: boolean; text: string }) => void = () => undefined;
    complete.mockImplementation(
      () => new Promise(resolve => (release = resolve as typeof release))
    );
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    queue.onDatabaseConnected("b.db");
    release({ ok: true, text: okOutput("迟到的标题") });
    await queue.idle();
    expect(ContentAiMetaTable.get(mainDb, card)).toBeNull();
  });

  it("清空槽即停止：中止进行中的请求，之后的写入不再排队", async () => {
    const card = addCard(mainDb, LONG);
    let signal: AbortSignal | undefined;
    complete.mockImplementation(
      (_request: unknown, s: AbortSignal) =>
        new Promise(resolve => {
          signal = s;
          s.addEventListener("abort", () => resolve({ ok: false, text: "", error: "已取消" }));
        })
    );
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    queue.applySetting(EMPTY_SETTING);
    expect(signal?.aborted).toBe(true);
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);
    queue.onContentWritten("a.db", card, "update");
    now += IDLE_MS;
    queue.sweep();
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("元信息写入后节流通知；换模型不作废已有元信息", async () => {
    const card = addCard(mainDb, LONG);
    queue.applySetting(SETTING);
    queue.onDatabaseConnected("a.db");
    await queue.idle();
    await vi.runAllTimersAsync();
    expect(notifyChanged).toHaveBeenCalledWith("a.db");

    queue.applySetting({
      llmProviders: [{ id: "p", models: [{ id: "m" }, { id: "n" }] }],
      llmUsageSettings: { contentMetadata: { providerId: "p", modelId: "n" } },
    } as never);
    await queue.idle();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(ContentAiMetaTable.get(mainDb, card)!.model).toBe("p/m");
  });
});
