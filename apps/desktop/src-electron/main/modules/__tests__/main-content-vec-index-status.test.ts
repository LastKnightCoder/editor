import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const meta = new Map<string, string>();
  const state = {
    cards: [] as Array<{ id: number; content: string; update_time: number }>,
    articles: [] as Array<{ id: number; content: string; update_time: number }>,
    indexedRows: [] as Array<{ prefixed_id: string; update_time: number }>,
  };

  const indexDb = {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      if (sql.includes("sqlite_master")) {
        return { get: () => ({ name: "vec_documents" }) };
      }
      if (sql.includes("FROM vec_documents GROUP BY prefixed_id")) {
        return { all: () => state.indexedRows };
      }
      if (sql.includes("SELECT value FROM vec_index_meta")) {
        return { get: (key: string) => (meta.has(key) ? { value: meta.get(key) } : undefined) };
      }
      if (sql.includes("INSERT INTO vec_index_meta")) {
        return {
          run: (key: string, value: string) => {
            meta.set(key, value);
            return {};
          },
        };
      }
      return { get: () => undefined, all: () => [], run: () => ({}) };
    }),
  };

  return {
    meta,
    state,
    indexDb,
    mainDb: {},
    prepareContent: vi.fn(async (input: { raw: string }) => ({ content: input.raw, sections: [] })),
    databaseModuleMock: {
      ensureIndexDatabaseReady: vi.fn(async () => ({ migrationState: "done" })),
      getDatabase: vi.fn(() => mockContext.mainDb),
      getIndexDatabase: vi.fn(() => indexDb),
      setIndexRebuildState: vi.fn(),
    },
    vecTableMock: {
      checkIndexExists: vi.fn((_db: unknown, id: number, type: string) => {
        const row = state.indexedRows.find(r => r.prefixed_id === `${type}:${id}`);
        return row ? { updateTime: row.update_time } : null;
      }),
      indexContent: vi.fn(async (_db: unknown, _params: { id: number; type: string }) => true),
      removeIndexesNotIn: vi.fn((_db: unknown, _keep: Set<string>, _types: readonly string[]) => 0),
      clearTableData: vi.fn(),
      initTableByVecLength: vi.fn(),
    },
  };
});

vi.mock("../../utils/event-loop-yield", () => ({
  yieldEvery: vi.fn(async () => undefined),
  yieldToEventLoop: vi.fn(async () => undefined),
}));
vi.mock("../database", () => ({ default: mockContext.databaseModuleMock }));
vi.mock("../index-content-client", () => ({
  IndexContentClient: class {
    prepare = mockContext.prepareContent;
    dispose = async () => {};
  },
}));
vi.mock("../index-candidates", () => ({
  listContentIndexCandidates: () => [
    ...mockContext.state.cards.map(row => ({
      ...row,
      type: "card",
      updateTime: row.update_time,
      read: () => ({ raw: row.content }),
    })),
    ...mockContext.state.articles.map(row => ({
      ...row,
      type: "article",
      updateTime: row.update_time,
      read: () => ({ raw: row.content }),
    })),
  ],
}));
vi.mock("../chat-prompt-index", () => ({
  CHAT_PROMPT_TYPE: "chat-prompt",
  listChatPromptDocs: () => [],
}));
vi.mock("../tables/card", () => ({ default: { getAllCards: () => mockContext.state.cards } }));
vi.mock("../tables/article", () => ({
  default: { getAllArticles: () => mockContext.state.articles },
}));
vi.mock("../tables/project", () => ({ default: { getAllProjectItems: () => [] } }));
vi.mock("../tables/diary", () => ({ default: { getAllDiarySegmentsFlat: () => [] } }));
vi.mock("../tables/vec-document", () => ({ default: mockContext.vecTableMock }));
vi.mock("../material-index", () => ({
  MATERIAL_INDEX_TYPES: ["excerpt", "pdf-annotation", "web-clip"],
  listMaterialIndexCandidates: () => [
    { id: 9, type: "excerpt", read: () => ({ content: "一句划线" }), updateTime: 10 },
  ],
}));
vi.mock("@/utils/markdown.ts", () => ({
  getMarkdown: (content: unknown) => (typeof content === "string" ? content : ""),
}));
vi.mock("@/entity/sections", () => ({ splitSections: () => [] }));

import mainContentVecIndexQueue from "../main-content-vec-index-queue";
import { MAIN_CHUNK_BUILD_KEY, mainEmbeddingFingerprint } from "@/entity/chunk-version";

const embeddingConfig = {
  provider: "local",
  model: "model-a",
  dimensions: 4,
  fingerprint: "fp-a",
} as any;

describe("MainContentVecIndexQueue 索引状态", () => {
  beforeEach(() => {
    mockContext.meta.clear();
    mockContext.mainDb = {};
    mockContext.state.cards = [
      { id: 1, content: "已索引", update_time: 100 },
      { id: 2, content: "索引后又改过", update_time: 300 },
      { id: 3, content: "从未索引", update_time: 100 },
      { id: 4, content: "", update_time: 100 },
    ];
    mockContext.state.articles = [{ id: 1, content: "文章", update_time: 50 }];
    mockContext.state.indexedRows = [
      { prefixed_id: "card:1", update_time: 100 },
      { prefixed_id: "card:2", update_time: 200 },
      { prefixed_id: "article:1", update_time: 50 },
    ];
    mockContext.vecTableMock.indexContent.mockClear();
    mockContext.prepareContent.mockClear();
  });

  it("统计按 已索引 / 待更新 / 未索引 分桶，空正文不计入", async () => {
    const stats = await mainContentVecIndexQueue.getIndexStats("data.db");

    expect(stats).toMatchObject({ total: 5, indexed: 2, outdated: 1, unindexed: 2 });
    expect(stats?.byType.card).toEqual({ total: 3, indexed: 1, outdated: 1, unindexed: 1 });
    expect(stats?.byType.excerpt).toEqual({ total: 1, indexed: 0, outdated: 0, unindexed: 1 });
    expect(stats?.byType.article).toEqual({ total: 1, indexed: 1, outdated: 0, unindexed: 0 });
  });

  it("一万篇未变正文不读取或转换，覆盖率仍正确", async () => {
    mockContext.state.cards = Array.from({ length: 10000 }, (_, index) => ({
      id: index + 1,
      content: "长正文",
      update_time: 100,
    }));
    mockContext.state.articles = [];
    mockContext.state.indexedRows = mockContext.state.cards.map(row => ({
      prefixed_id: `card:${row.id}`,
      update_time: 100,
    }));
    const stats = await mainContentVecIndexQueue.getIndexStats("data.db");
    expect(stats?.byType.card).toEqual({ total: 10000, indexed: 10000, outdated: 0, unindexed: 0 });
    expect(mockContext.prepareContent).not.toHaveBeenCalled();
  });

  it("手动索引只处理待更新与未索引文档，并推送进度、记录上一轮", async () => {
    const phases: string[] = [];
    const unsubscribe = mainContentVecIndexQueue.onProgress(p => phases.push(p.phase));

    const result = await mainContentVecIndexQueue.reconcileByPolicy({
      mainDbName: "data.db",
      embeddingConfig,
      fingerprintChanged: false,
      autoIndex: true,
      reason: "manual",
    });
    unsubscribe();

    expect(result).toMatchObject({ queued: 3, indexed: 3, stale: false });
    expect(mockContext.vecTableMock.indexContent).toHaveBeenCalledTimes(3);
    expect(mockContext.prepareContent.mock.calls.map(([input]) => input.raw)).toEqual([
      "索引后又改过",
      "从未索引",
      "",
    ]);
    // 对账清理：候选集合（含材料）之外的向量被删
    const [, keep, types] = mockContext.vecTableMock.removeIndexesNotIn.mock.calls.at(-1)!;
    expect([...keep].sort()).toEqual(["article:1", "card:1", "card:2", "card:3", "excerpt:9"]);
    expect(types).toContain("web-clip");
    expect(phases[0]).toBe("collecting");
    expect(phases).toContain("indexing");
    expect(phases.at(-1)).toBe("done");
    expect(mainContentVecIndexQueue.isRunning()).toBe(false);

    const lastRun = mainContentVecIndexQueue.getLastRun(mockContext.indexDb as any);
    expect(lastRun).toMatchObject({
      reason: "manual",
      phase: "done",
      queued: 3,
      indexed: 3,
      failed: 0,
    });
    expect(lastRun?.finishedAt).toBeTypeOf("number");
  });

  it("连续失败时记录失败原因", async () => {
    mockContext.vecTableMock.indexContent.mockResolvedValue(false);
    mockContext.state.cards.push(
      { id: 5, content: "a", update_time: 1 },
      { id: 6, content: "b", update_time: 1 }
    );

    await expect(
      mainContentVecIndexQueue.reconcileByPolicy({
        mainDbName: "data.db",
        embeddingConfig,
        fingerprintChanged: false,
        autoIndex: true,
        reason: "manual",
      })
    ).rejects.toThrow();

    const lastRun = mainContentVecIndexQueue.getLastRun(mockContext.indexDb as any);
    expect(lastRun?.phase).toBe("failed");
    expect(lastRun?.failed).toBe(3);
    expect(lastRun?.error).toContain("连续失败");
    mockContext.vecTableMock.indexContent.mockResolvedValue(true);
  });

  it("转换期间取消扫描，不清理索引也不进入嵌入", async () => {
    mockContext.vecTableMock.removeIndexesNotIn.mockClear();
    mockContext.prepareContent.mockImplementationOnce(async () => {
      mainContentVecIndexQueue.abortCurrentRun();
      return { content: "变化正文", sections: [] };
    });
    const result = await mainContentVecIndexQueue.reconcileByPolicy({
      mainDbName: "data.db",
      embeddingConfig,
      fingerprintChanged: false,
      autoIndex: true,
      reason: "manual",
    });
    expect(result.stale).toBe(true);
    expect(mockContext.vecTableMock.removeIndexesNotIn).not.toHaveBeenCalled();
    expect(mockContext.vecTableMock.indexContent).not.toHaveBeenCalled();
  });

  it("清空已索引正文后移出候选，统计无需重复转换未变化的空正文", async () => {
    mockContext.state.cards[0].content = "";
    mockContext.state.cards[0].update_time = 101;
    await mainContentVecIndexQueue.reconcileByPolicy({
      mainDbName: "data.db",
      embeddingConfig,
      fingerprintChanged: false,
      autoIndex: true,
      reason: "manual",
    });
    const [, keep] = mockContext.vecTableMock.removeIndexesNotIn.mock.calls.at(-1)!;
    expect(keep.has("card:1")).toBe(false);
    mockContext.prepareContent.mockClear();
    await mainContentVecIndexQueue.getIndexStats("data.db");
    expect(mockContext.prepareContent.mock.calls.every(([input]) => input.raw !== "")).toBe(true);
  });

  it("部分失败保留 pending，重试不会重嵌已成功的实体", async () => {
    mockContext.vecTableMock.clearTableData.mockClear();
    mockContext.vecTableMock.indexContent
      .mockImplementationOnce(async () => {
        mockContext.state.indexedRows = mockContext.state.indexedRows.map(row =>
          row.prefixed_id === "card:2" ? { ...row, update_time: 300 } : row
        );
        return true;
      })
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(async () => {
        mockContext.state.indexedRows.push({ prefixed_id: "excerpt:9", update_time: 10 });
        return true;
      });
    const options = {
      mainDbName: "data.db",
      embeddingConfig,
      fingerprintChanged: false,
      autoIndex: true,
      reason: "startup_reconcile" as const,
    };
    const first = await mainContentVecIndexQueue.reconcileByPolicy(options);
    expect(first).toMatchObject({ queued: 3, indexed: 2, failed: 1, stale: false });
    expect(mockContext.databaseModuleMock.setIndexRebuildState).toHaveBeenLastCalledWith(
      "data.db",
      "pending",
      "vec"
    );
    mockContext.vecTableMock.indexContent.mockClear();
    const second = await mainContentVecIndexQueue.reconcileByPolicy(options);
    expect(second).toMatchObject({ queued: 1, indexed: 1, failed: 0 });
    expect(mockContext.vecTableMock.indexContent.mock.calls[0][1]).toMatchObject({
      id: 3,
      type: "card",
    });
    expect(mockContext.vecTableMock.clearTableData).not.toHaveBeenCalled();
  });

  it("重建失败仍保存已准备的口径，供编排器恢复同一张表", async () => {
    mockContext.vecTableMock.indexContent.mockResolvedValue(false);
    await expect(
      mainContentVecIndexQueue.reconcileByPolicy({
        mainDbName: "data.db",
        embeddingConfig,
        fingerprintChanged: true,
        autoIndex: true,
        reason: "startup_reconcile",
      })
    ).rejects.toThrow("连续失败");
    expect(mockContext.meta.get(MAIN_CHUNK_BUILD_KEY)).toBe(
      mainEmbeddingFingerprint(embeddingConfig.fingerprint)
    );
    mockContext.vecTableMock.indexContent.mockResolvedValue(true);
  });
});
