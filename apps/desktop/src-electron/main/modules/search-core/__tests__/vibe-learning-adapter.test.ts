import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSearchFTS, mockSearchVec, mockGetDatabase, mockGetResourcesByIds } =
  vi.hoisted(() => ({
    mockSearchFTS: vi.fn(),
    mockSearchVec: vi.fn(),
    mockGetDatabase: vi.fn(),
    mockGetResourcesByIds: vi.fn(),
  }));

vi.mock("../../vibe-learning-db", () => ({
  default: {
    searchFTS: mockSearchFTS,
    searchVec: mockSearchVec,
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

    const ftsResults = await adapter.searchFTS("test", context, 5, "original");
    const vecResults = await adapter.searchVec("test", context, 5, "vec");

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
      },
    );

    expect(result.resourceName).toBe("资料 A");
    expect(result.chunkIndex).toBe(3);
    expect(result.score).toBe(0.9);
  });
});
