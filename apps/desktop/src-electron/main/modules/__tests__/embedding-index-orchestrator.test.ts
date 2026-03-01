import { beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const metaStore = new Map<string, string>();
  const fakeIndexDb = {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      if (sql.includes("SELECT value FROM vec_index_meta WHERE key = ?")) {
        return {
          get: (key: string) =>
            metaStore.has(key) ? { value: metaStore.get(key) } : undefined,
        };
      }
      if (sql.includes("INSERT INTO vec_index_meta")) {
        return {
          run: (key: string, value: string) => {
            metaStore.set(key, value);
            return {};
          },
        };
      }
      return {
        get: () => undefined,
        run: () => ({}),
        all: () => [],
      };
    }),
  };

  return {
    metaStore,
    fakeIndexDb,
    databaseModuleMock: {
      onDatabaseConnected: vi.fn(),
      getDatabase: vi.fn(() => ({ name: "data.db" })),
      getIndexDatabase: vi.fn(() => fakeIndexDb),
      getCurrentDatabaseName: vi.fn(() => "data.db"),
    },
    userSettingModuleMock: {
      onSettingChanged: vi.fn(),
      getSettingSnapshot: vi.fn(),
    },
    mainContentQueueMock: {
      abortCurrentRun: vi.fn(),
      reconcileByPolicy: vi.fn(async () => ({
        stale: false,
        queued: 0,
        indexed: 0,
      })),
    },
    vibeLearningQueueMock: {
      abortCurrentRun: vi.fn(),
      handleEmbeddingSwitchByPolicy: vi.fn(async () => ({
        reinitOk: true,
        queued: 0,
        droppedPending: 0,
        previousGeneration: 0,
        currentGeneration: 1,
      })),
    },
    videoNoteQueueMock: {
      abortCurrentRun: vi.fn(),
      handleEmbeddingSwitchByPolicy: vi.fn(async () => ({
        reinitOk: true,
        queued: 0,
        droppedPending: 0,
        previousGeneration: 0,
        currentGeneration: 1,
      })),
    },
    resolveEmbeddingConfig: vi.fn(),
  };
});

vi.mock("../database", () => ({
  default: mockContext.databaseModuleMock,
}));

vi.mock("../user-setting", () => ({
  default: mockContext.userSettingModuleMock,
}));

vi.mock("../main-content-vec-index-queue", () => ({
  default: mockContext.mainContentQueueMock,
}));

vi.mock("../vibe-learning-index-queue", () => ({
  default: mockContext.vibeLearningQueueMock,
}));

vi.mock("../video-note-index-queue", () => ({
  default: mockContext.videoNoteQueueMock,
}));

vi.mock("../../utils/embedding-config", () => ({
  resolveEmbeddingConfig: mockContext.resolveEmbeddingConfig,
}));

import embeddingIndexOrchestrator from "../embedding-index-orchestrator";

describe("EmbeddingIndexOrchestrator(video-note)", () => {
  beforeEach(() => {
    mockContext.metaStore.clear();
    mockContext.fakeIndexDb.exec.mockClear();
    mockContext.fakeIndexDb.prepare.mockClear();
    mockContext.mainContentQueueMock.reconcileByPolicy.mockClear();
    mockContext.vibeLearningQueueMock.handleEmbeddingSwitchByPolicy.mockClear();
    mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy.mockClear();
    mockContext.resolveEmbeddingConfig.mockReset();
    mockContext.resolveEmbeddingConfig.mockReturnValue({
      configId: "embedding-config-a",
      providerType: "local_python",
      modelName: "model-a",
      dimensions: 1024,
      distance: 0.6,
      fingerprint: "fp-a",
      batchSize: 8,
    });
  });

  it("embedding 指纹变化时，video-note 队列应按重建策略执行", async () => {
    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "model_switch",
    );

    expect(
      mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        dimensions: 1024,
        fingerprintChanged: true,
        reason: "model_switch",
      }),
    );
  });

  it("embedding 指纹未变化时，video-note 队列不应重复重建", async () => {
    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "model_switch",
    );
    mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy.mockClear();

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "model_switch",
    );

    expect(
      mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        dimensions: 1024,
        fingerprintChanged: false,
        reason: "model_switch",
      }),
    );
  });
});
