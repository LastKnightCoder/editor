import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const createEmbeddings = vi.fn();
  const logInfo = vi.fn();
  const logWarn = vi.fn();

  return {
    createEmbeddings,
    logInfo,
    logWarn,
    getCardById: vi.fn((_: unknown, id: number) => ({
      id,
      contentId: id * 10,
      title: `卡片-${id}`,
      content: [{ type: "paragraph", children: [{ text: "命中内容" }] }],
    })),
  };
});

vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = {
      create: mockContext.createEmbeddings,
    };
  },
}));

vi.mock("electron-log", () => ({
  default: {
    info: mockContext.logInfo,
    warn: mockContext.logWarn,
    error: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp"),
  },
}));

vi.mock("../local-inference", () => ({
  default: {
    embedTexts: vi.fn(),
    embeddingHealth: vi.fn(),
  },
}));

vi.mock("../tables/card", () => ({
  default: {
    getCardById: mockContext.getCardById,
  },
}));

vi.mock("../tables/article", () => ({
  default: {
    getArticleById: vi.fn(() => null),
  },
}));

vi.mock("../tables/project", () => ({
  default: {
    getProjectItem: vi.fn(() => null),
  },
}));

vi.mock("../tables/diary", () => ({
  default: {
    getDiaryMoment: vi.fn(() => null),
  },
}));

import VecDocumentTable from "../tables/vec-document";

let lastSearchArgs: unknown[] = [];

function createIndexDb(params: {
  migrationState?: string;
  vecRebuildState?: string;
  hasVecTable?: boolean;
  hasIndexMeta?: boolean;
  searchRows?: Array<{
    prefixed_id: string;
    update_time: number;
    content: string;
    distance: number;
  }>;
}) {
  const {
    migrationState = "done",
    vecRebuildState = "ready",
    hasVecTable = true,
    hasIndexMeta = true,
    searchRows = [],
  } = params;

  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes("SELECT name FROM sqlite_master") && sql.includes("name = ?")) {
        return {
          get: (tableName: string) => {
            if (tableName === "vec_documents" && hasVecTable) {
              return { name: "vec_documents" };
            }
            if (tableName === "index_meta" && hasIndexMeta) {
              return { name: "index_meta" };
            }
            return undefined;
          },
        };
      }

      if (sql.includes("SELECT value FROM index_meta WHERE key = ?")) {
        return {
          get: (key: string) => {
            if (key === "migration_state") {
              return { value: migrationState };
            }
            if (key === "vec_rebuild_state") {
              return { value: vecRebuildState };
            }
            if (key === "rebuild_state") {
              return { value: vecRebuildState };
            }
            return undefined;
          },
        };
      }

      if (
        sql.includes("SELECT prefixed_id, update_time, content, chunk_index, distance") &&
        sql.includes("FROM vec_documents")
      ) {
        return {
          all: (...args: unknown[]) => {
            lastSearchArgs = args;
            return searchRows;
          },
        };
      }

      return {
        get: () => undefined,
        all: () => [],
      };
    }),
  } as any;
}

describe("VecDocumentTable 按块召回", () => {
  it("多取几倍块再按实体去重，长文的多节不占满名额", async () => {
    mockContext.createEmbeddings.mockResolvedValue({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    const row = (id: number, distance: number) => ({
      prefixed_id: `card:${id}`,
      update_time: 1,
      content: "命中内容",
      distance,
    });
    const indexDb = createIndexDb({
      searchRows: [row(1, 0.1), row(1, 0.11), row(1, 0.12), row(2, 0.2), row(3, 0.3)],
    });
    const results = await VecDocumentTable.searchContent({} as any, indexDb, {
      query: "测试查询",
      limit: 2,
      types: ["card"],
      modelInfo: {
        providerType: "remote_openai",
        key: "k",
        baseUrl: "https://example.com/v1",
        model: "m",
        dimensions: 3,
      },
    } as any);
    expect(results.map(result => result.id)).toEqual([1, 2]);
    expect(lastSearchArgs.at(-1)).toBe(8);
  });
});

describe("VecDocumentTable search gating", () => {
  beforeEach(() => {
    mockContext.createEmbeddings.mockReset();
    mockContext.createEmbeddings.mockResolvedValue({
      data: [
        {
          embedding: [0.1, 0.2, 0.3],
        },
      ],
    });
    mockContext.logInfo.mockClear();
    mockContext.logWarn.mockClear();
    mockContext.getCardById.mockClear();
  });

  it("vec=building 时允许查询已落库的向量结果", async () => {
    const indexDb = createIndexDb({
      vecRebuildState: "building",
      searchRows: [
        {
          prefixed_id: "card:7",
          update_time: 123,
          content: "命中内容",
          distance: 0.12,
        },
      ],
    });

    const results = await VecDocumentTable.searchContent({} as any, indexDb, {
      query: "测试查询",
      limit: 10,
      types: ["card"],
      modelInfo: {
        providerType: "remote_openai",
        key: "test-key",
        baseUrl: "https://example.com/v1",
        model: "text-embedding-3-small",
        dimensions: 3,
      },
    } as any);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 7,
      type: "card",
      source: "vec-document",
      distance: 0.12,
    });
    expect(mockContext.logWarn).not.toHaveBeenCalledWith(
      "[VecDocument] search skipped:",
      expect.anything()
    );
    expect(mockContext.logInfo).toHaveBeenCalledWith(
      "[VecDocument] search start:",
      expect.objectContaining({
        vecRebuildState: "building",
        partial: true,
        vecAvailableDuringBuilding: true,
      })
    );
  });

  it("vec=failed 时跳过向量检索并返回空结果", async () => {
    const indexDb = createIndexDb({
      vecRebuildState: "failed",
      searchRows: [
        {
          prefixed_id: "card:9",
          update_time: 999,
          content: "不应被读取",
          distance: 0.05,
        },
      ],
    });

    const results = await VecDocumentTable.searchContent({} as any, indexDb, {
      query: "失败状态查询",
      limit: 10,
      modelInfo: {
        providerType: "remote_openai",
        key: "test-key",
        baseUrl: "https://example.com/v1",
        model: "text-embedding-3-small",
        dimensions: 3,
      },
    } as any);

    expect(results).toEqual([]);
    expect(mockContext.createEmbeddings).not.toHaveBeenCalled();
    expect(mockContext.logWarn).toHaveBeenCalledWith(
      "[VecDocument] search skipped:",
      expect.objectContaining({
        vecRebuildState: "failed",
        searchable: false,
      })
    );
  });
});
