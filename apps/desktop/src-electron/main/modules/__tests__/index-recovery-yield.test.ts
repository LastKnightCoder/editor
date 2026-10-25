import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const createVideoNotesDb = () => ({
    prepare: vi.fn((sql: string) => {
      if (sql.includes("sqlite_master") && sql.includes("name='video_notes'")) {
        return {
          get: () => ({ name: "video_notes" }),
          all: () => [],
        };
      }
      if (sql.includes("FROM video_notes")) {
        return {
          get: () => undefined,
          all: () => mockContext.videoRows,
        };
      }
      return {
        get: () => undefined,
        all: () => [],
      };
    }),
  });

  const makeItems = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      type: "daily",
      content: [],
      update_time: index + 1,
      updateTime: index + 1,
      transcript_segments: JSON.stringify([{ text: `片段-${index + 1}`, start: 0, end: 1000 }]),
    }));

  return {
    yieldEvery: vi.fn(async () => undefined),
    yieldToEventLoop: vi.fn(async () => undefined),
    cards: makeItems(30),
    articles: [],
    projects: [],
    diaries: [] as Array<{ id: number; diaryId: number; content: unknown[]; updateTime: number }>,
    videoRows: makeItems(25),
    databaseModuleMock: {
      ensureIndexDatabaseReady: vi.fn(async () => ({
        migrationState: "done",
        rebuildState: "ready",
      })),
      getDatabase: vi.fn((): ReturnType<typeof createVideoNotesDb> | undefined =>
        createVideoNotesDb()
      ),
      getIndexDatabase: vi.fn(() => ({})),
      setIndexRebuildState: vi.fn(),
      onDatabaseConnected: vi.fn(),
    },
    ftsTableMock: {
      removeIndexesByType: vi.fn(() => 0),
      checkIndexExists: vi.fn(() => null),
      removeIndexByIdAndType: vi.fn(),
      removeIndexesNotIn: vi.fn(() => 0),
      indexContent: vi.fn(() => true),
    },
    vecTableMock: {
      removeIndexesByType: vi.fn(() => 0),
      checkIndexExists: vi.fn(() => null),
      removeIndexesNotIn: vi.fn(() => 0),
      indexContent: vi.fn(async () => true),
      clearTableData: vi.fn(),
      initTableByVecLength: vi.fn(),
    },
    videoNoteIndexDbMock: {
      checkIndexExists: vi.fn(() => false),
      setVecDimensions: vi.fn(),
      reinitVecTable: vi.fn(() => true),
    },
  };
});

vi.mock("../../utils/event-loop-yield", () => ({
  yieldEvery: mockContext.yieldEvery,
  yieldToEventLoop: mockContext.yieldToEventLoop,
}));

vi.mock("../database", () => ({
  default: mockContext.databaseModuleMock,
}));
vi.mock("../index-content-client", () => ({
  IndexContentClient: class {
    prepare = async () => ({ content: "mock-markdown", sections: [] });
    dispose = async () => {};
  },
}));
vi.mock("../index-candidates", () => ({
  listContentIndexCandidates: () => [
    ...mockContext.cards.map(row => ({
      id: row.id,
      type: "card",
      updateTime: row.update_time,
      read: () => ({ raw: "[]" }),
    })),
    ...mockContext.diaries.map(row => ({
      id: row.id,
      type: "diary-moment",
      updateTime: row.updateTime,
      read: () => ({ raw: "[]" }),
    })),
  ],
}));
vi.mock("../chat-prompt-index", () => ({
  CHAT_PROMPT_TYPE: "chat-prompt",
  listChatPromptDocs: () => [],
}));

vi.mock("../tables/card", () => ({
  default: {
    getAllCards: () => mockContext.cards,
  },
}));

vi.mock("../tables/content", () => ({
  default: { readText: vi.fn(async () => ({ content: "mock-markdown", sections: [] })) },
}));

vi.mock("../tables/article", () => ({
  default: {
    getAllArticles: () => mockContext.articles,
  },
}));

vi.mock("../tables/project", () => ({
  default: {
    getAllProjectItems: () => mockContext.projects,
  },
}));

vi.mock("../tables/diary", () => ({
  default: {
    getAllDiarySegmentsFlat: () => mockContext.diaries,
  },
}));

vi.mock("../tables/plugin-entity", () => ({
  default: { indexDocs: () => [] },
}));

vi.mock("../tables/fts", () => ({
  default: mockContext.ftsTableMock,
}));

vi.mock("../tables/vec-document", () => ({
  default: mockContext.vecTableMock,
}));

vi.mock("../material-index", () => ({
  MATERIAL_INDEX_TYPES: ["excerpt", "pdf-annotation", "web-clip"],
  listMaterialIndexDocs: () => [],
  listMaterialIndexCandidates: () => [],
}));

vi.mock("../video-note-index-db", () => ({
  default: mockContext.videoNoteIndexDbMock,
}));

vi.mock("../local-inference", () => ({
  default: {
    embedTexts: vi.fn(),
    embeddingHealth: vi.fn(),
  },
}));

vi.mock("../search-core/pipeline", () => ({
  runSearchPipeline: vi.fn(),
}));

vi.mock("../search-core/video-note-adapter", () => ({
  createVideoNoteAdapter: vi.fn(),
}));

vi.mock("@/utils/markdown.ts", () => ({
  getMarkdown: () => "mock-markdown",
}));

import mainContentFtsIndexQueue from "../main-content-fts-index-queue";
import mainContentVecIndexQueue from "../main-content-vec-index-queue";
import videoNoteIndexQueue from "../video-note-index-queue";

describe("index recovery cooperative scheduling", () => {
  beforeEach(() => {
    mockContext.diaries = [];
    mockContext.yieldEvery.mockClear();
    mockContext.yieldToEventLoop.mockClear();
    mockContext.videoNoteIndexDbMock.checkIndexExists.mockClear();
    mockContext.videoNoteIndexDbMock.reinitVecTable.mockClear();
    (videoNoteIndexQueue as any).queue = [];
    (videoNoteIndexQueue as any).queueGeneration = 0;
    (videoNoteIndexQueue as any).isProcessing = false;
    (videoNoteIndexQueue as any).recoveryNeededDbNames = new Set();
  });

  it("主内容向量任务收集会按批调用 yieldEvery", async () => {
    const { tasks } = await (mainContentVecIndexQueue as any).collectSnapshot(
      {},
      { prepare: () => ({ get: () => undefined }) },
      false,
      true
    );

    expect(tasks).toHaveLength(30);
    expect(mockContext.yieldEvery).toHaveBeenCalledWith(25, 25);
    expect(mockContext.yieldToEventLoop).toHaveBeenCalled();
  });

  it("主内容 FTS 任务收集会按批调用 yieldEvery", async () => {
    const result = await (mainContentFtsIndexQueue as any).collectTasks(
      {},
      { prepare: () => ({ get: () => undefined }) },
      () => undefined
    );

    expect(result.tasks).toHaveLength(30);
    expect(mockContext.yieldEvery).toHaveBeenCalledWith(25, 25);
    expect(mockContext.yieldToEventLoop).toHaveBeenCalled();
  });

  it("主内容全文与向量队列把同一天两条日记作为两个实体收集", async () => {
    mockContext.diaries = [
      { id: 11, diaryId: 5, content: [], updateTime: 7 },
      { id: 12, diaryId: 5, content: [], updateTime: 8 },
    ];
    const { tasks: vec } = await (mainContentVecIndexQueue as any).collectSnapshot(
      {},
      { prepare: () => ({ get: () => undefined }) },
      false,
      true
    );
    const fts = await (mainContentFtsIndexQueue as any).collectTasks(
      {},
      { prepare: () => ({ get: () => undefined }) },
      () => undefined
    );
    const expected = [
      expect.objectContaining({ id: 11, type: "diary-moment", updateTime: 7 }),
      expect.objectContaining({ id: 12, type: "diary-moment", updateTime: 8 }),
    ];
    expect(vec.filter((item: { type: string }) => item.type === "diary-moment")).toEqual(expected);
    expect(fts.tasks.filter((item: { type: string }) => item.type === "diary-moment")).toEqual(
      expected
    );
  });

  it("视频笔记恢复扫描与重建会按批调用 yieldEvery", async () => {
    const enqueueSpy = vi
      .spyOn(videoNoteIndexQueue as any, "enqueueTask")
      .mockImplementation(() => undefined);

    await (videoNoteIndexQueue as any).checkAndRecoverVideoNotes("data.db");
    mockContext.videoNoteIndexDbMock.checkIndexExists.mockReturnValue(true);
    await (videoNoteIndexQueue as any).reinitAllVecTables(1024, "data.db");

    expect(enqueueSpy).toHaveBeenCalled();
    expect(mockContext.videoNoteIndexDbMock.reinitVecTable).toHaveBeenCalled();
    expect(mockContext.yieldEvery).toHaveBeenCalledWith(20, 20);
    expect(mockContext.yieldToEventLoop).toHaveBeenCalled();

    enqueueSpy.mockRestore();
  });

  it("视频笔记任务在数据库暂不可用时会回队等待重连", async () => {
    mockContext.databaseModuleMock.getDatabase.mockReturnValueOnce(undefined);
    (videoNoteIndexQueue as any).queue = [
      {
        mainDbName: "data.db",
        videoNoteId: 1,
        generation: 0,
      },
    ];

    await (videoNoteIndexQueue as any).processQueue();

    expect((videoNoteIndexQueue as any).queue).toEqual([
      expect.objectContaining({
        mainDbName: "data.db",
        videoNoteId: 1,
        generation: 0,
      }),
    ]);
  });
});
