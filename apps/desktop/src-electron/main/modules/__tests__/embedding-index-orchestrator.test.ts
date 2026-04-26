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
      ensureIndexDatabaseReady: vi.fn(async () => ({
        migrationState: "done",
        rebuildState: "ready",
      })),
      getDatabase: vi.fn(() => ({ name: "data.db" })),
      getIndexDatabase: vi.fn(() => fakeIndexDb),
      getCurrentDatabaseName: vi.fn(() => "data.db"),
      getIndexRebuildState: vi.fn(
        (_dbName: string, _target?: string) => "ready",
      ),
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
    mockContext.databaseModuleMock.ensureIndexDatabaseReady.mockClear();
    mockContext.databaseModuleMock.getIndexRebuildState.mockReset();
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue(
      "ready",
    );
    mockContext.resolveEmbeddingConfig.mockReset();
    mockContext.resolveEmbeddingConfig.mockReturnValue({
      configId: "embedding-config-a",
      providerType: "local_python",
      modelName: "model-a",
      dimensions: 1024,
      distance: 0.6,
      fingerprint: "fp-a",
      batchSize: 8,
      model: "model-a",
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

  it("上传重连且索引已 ready、指纹未变化时，应跳过所有 reconcile", async () => {
    mockContext.metaStore.set("main_content_embedding_fingerprint", "fp-a");
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue(
      "ready",
    );

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect",
    );

    expect(
      mockContext.mainContentQueueMock.reconcileByPolicy,
    ).not.toHaveBeenCalled();
    expect(
      mockContext.vibeLearningQueueMock.handleEmbeddingSwitchByPolicy,
    ).not.toHaveBeenCalled();
    expect(
      mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy,
    ).not.toHaveBeenCalled();
  });

  it("下载重连即使指纹未变化也应继续 reconcile", async () => {
    mockContext.metaStore.set("main_content_embedding_fingerprint", "fp-a");
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue(
      "ready",
    );

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_download_reconnect",
    );

    expect(
      mockContext.mainContentQueueMock.reconcileByPolicy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_download_reconnect",
      }),
    );
  });

  it("上传重连时若索引状态不是 ready，则仍应执行 reconcile", async () => {
    mockContext.metaStore.set("main_content_embedding_fingerprint", "fp-a");
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue(
      "pending",
    );

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect",
    );

    expect(
      mockContext.mainContentQueueMock.reconcileByPolicy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_upload_reconnect",
      }),
    );
  });

  it("上传重连时应只依据向量索引状态决定是否跳过", async () => {
    mockContext.metaStore.set("main_content_embedding_fingerprint", "fp-a");
    mockContext.databaseModuleMock.getIndexRebuildState.mockImplementation(
      (_dbName: string, target?: string) =>
        target === "vec" ? "pending" : "ready",
    );

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect",
    );

    expect(
      mockContext.mainContentQueueMock.reconcileByPolicy,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_upload_reconnect",
      }),
    );
  });
});
