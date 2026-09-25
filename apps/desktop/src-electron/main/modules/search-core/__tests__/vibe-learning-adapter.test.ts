import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSearchFTS,
  mockSearchVec,
  mockGetDatabase,
  mockGetResourcesByIds,
  mockGetChunkMetadata,
} = vi.hoisted(() => ({
  mockSearchFTS: vi.fn(),
  mockSearchVec: vi.fn(),
  mockGetDatabase: vi.fn(),
  mockGetResourcesByIds: vi.fn(),
  mockGetChunkMetadata: vi.fn(),
}));

vi.mock("../../vibe-learning-db", () => ({
  default: {
    searchFTS: mockSearchFTS,
    searchVec: mockSearchVec,
    getChunkMetadata: mockGetChunkMetadata,
  },
}));

vi.mock("../../database", () => ({
  default: {
    getDatabase: mockGetDatabase,
  },
}));

vi.mock("../../tables/vibe-learning-resource", () => ({
  default: {
    getResourcesByIds: mockGetResourcesByIds,
  },
}));

import { createVibeLearningAdapter } from "../vibe-learning-adapter";

describe("search-core/vibe-learning-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabase.mockReturnValue({});
    mockGetResourcesByIds.mockReturnValue([{ name: "资料 A" }]);
    mockGetChunkMetadata.mockReturnValue(null);
  });

  it("应为 FTS 和 Vec 结果生成 chunk 级 dedupeKey", async () => {
    mockSearchFTS.mockReturnValue([
      {
        resourceId: 1,
        chunkIndex: 3,
        content: "first chunk",
        rank: -1,
      },
    ]);
    mockSearchVec.mockReturnValue([
      {
        resourceId: 1,
        chunkIndex: 8,
        content: "second chunk",
        distance: 0.2,
      },
    ]);

    const adapter = createVibeLearningAdapter();
    const context = {
      projectId: 1,
      mainDbName: "work.db",
      vector: {
        distance: 0.6,
        embedQuery: vi.fn(async () => [0.1, 0.2]),
      },
    };

    const ftsResults = await adapter.searchFTS("test", context, 5);
    const vecResults = await adapter.searchVec("test", context, 5);

    expect(ftsResults[0]?.dedupeKey).toBe("resource:1:chunk:3");
    expect(vecResults[0]?.dedupeKey).toBe("resource:1:chunk:8");
  });

  it("finalize 应解析资源名称并保留 chunk 信息", async () => {
    const adapter = createVibeLearningAdapter();
    const result = await adapter.finalize(
      {
        key: "resource:1:chunk:3:fts",
        dedupeKey: "resource:1:chunk:3",
        source: "fts",
        payload: {
          resourceId: 1,
          resourceName: "",
          content: "chunk content",
          score: 0.8,
          chunkIndex: 3,
        },
        text: "chunk content",
        snippet: "chunk content",
        retrievalScore: 0.8,
        rrfScore: 0.8,
        topRank: 1,
        rank: 1,
        selectedChunk: "chunk content",
        finalScore: 0.9,
      },
      {
        projectId: 1,
        mainDbName: "work.db",
        vector: null,
      }
    );

    expect(result.resourceName).toBe("资料 A");
    expect(result.chunkIndex).toBe(3);
    expect(result.score).toBe(0.9);
  });

  it("searchFTS 应透传 chunk 显示内容", async () => {
    mockSearchFTS.mockReturnValue([
      {
        resourceId: 1,
        chunkIndex: 4,
        content: "Q、K、V 分别来自输入向量的不同投影。",
        rank: -0.8,
      },
    ]);
    mockGetChunkMetadata.mockReturnValue({
      searchContent: "q k v 输入 向量 不同 投影",
      displayContent: "Q、K、V 分别来自输入向量的不同投影。",
    });

    const adapter = createVibeLearningAdapter();
    const context = {
      projectId: 1,
      mainDbName: "work.db",
      vector: null,
    };

    const results = await adapter.searchFTS("QKV 投影", context, 5);

    expect(results[0]?.payload.chunkLevel).toBe("passage");
    expect(results[0]?.text).toBe("Q、K、V 分别来自输入向量的不同投影。");
  });

  it("searchFTS 应透传 chunk 精确行号和字符范围", async () => {
    mockSearchFTS.mockReturnValue([
      {
        resourceId: 1,
        chunkIndex: 4,
        content: "Q、K、V 分别来自输入向量的不同投影。",
        rank: -0.8,
      },
    ]);
    mockGetChunkMetadata.mockReturnValue({
      searchContent: "q k v 输入 向量 不同 投影",
      displayContent: "Q、K、V 分别来自输入向量的不同投影。",
      chunkStartLine: 21,
      chunkEndLine: 44,
      startOffset: 100,
      endOffset: 168,
      charCount: 68,
    });

    const adapter = createVibeLearningAdapter();
    const context = {
      projectId: 1,
      mainDbName: "work.db",
      vector: null,
    };

    const results = await adapter.searchFTS("QKV 投影", context, 5);

    expect(results[0]?.payload.chunkStartLine).toBe(21);
    expect(results[0]?.payload.chunkEndLine).toBe(44);
    expect(results[0]?.payload.startOffset).toBe(100);
    expect(results[0]?.payload.endOffset).toBe(168);
    expect(results[0]?.payload.charCount).toBe(68);
  });
});
