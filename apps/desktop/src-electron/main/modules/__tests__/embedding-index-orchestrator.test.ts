import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockContext = vi.hoisted(() => {
  const metaStore = new Map<string, string>();
  const fakeIndexDb = {
    exec: vi.fn(),
    prepare: vi.fn((sql: string) => {
      if (sql.includes("SELECT value FROM vec_index_meta WHERE key = ?")) {
        return {
          get: (key: string) => (metaStore.has(key) ? { value: metaStore.get(key) } : undefined),
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
      getIndexRebuildState: vi.fn((_dbName: string, _target?: string) => "ready"),
      onDatabaseWrite: vi.fn(),
    },
    userSettingModuleMock: {
      onSettingChanged: vi.fn(),
      getSettingSnapshot: vi.fn(),
    },
    mainContentQueueMock: {
      abortCurrentRun: vi.fn(),
      isRunning: vi.fn(() => false),
      getIndexStats: vi.fn(async () => null),
      getCurrentProgress: vi.fn(() => null),
      getLastRun: vi.fn(() => null),
      onProgress: vi.fn(),
      reconcileByPolicy: vi.fn(async () => ({
        stale: false,
        queued: 0,
        indexed: 0,
        failed: 0,
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
    pluginEmbeddingsRelayMock: {
      isReady: vi.fn(() => true),
      onProvidersChanged: vi.fn(() => () => {}),
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

vi.mock("../local-inference", () => ({
  default: {
    isEmbeddingModelReady: vi.fn(() => true),
    embedTexts: vi.fn(),
    embeddingHealth: vi.fn(),
  },
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

vi.mock("../../services/plugin-embeddings", () => ({
  pluginEmbeddingsRelay: mockContext.pluginEmbeddingsRelayMock,
}));

import embeddingIndexOrchestrator, {
  IDLE_INDEX_DELAY_MS,
  isMainContentWriteEvent,
} from "../embedding-index-orchestrator";
import { MAIN_CHUNK_BUILD_KEY, mainEmbeddingFingerprint } from "@/entity/chunk-version";

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
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue("ready");
    mockContext.resolveEmbeddingConfig.mockReset();
    mockContext.resolveEmbeddingConfig.mockReturnValue({
      provider: "local",
      modelName: "model-a",
      dimensions: 1024,
      distance: 0.6,
      fingerprint: "fp-a",
      batchSize: 8,
      model: "model-a",
    });
  });

  it("embedding 指纹变化时，video-note 队列应按重建策略执行", async () => {
    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb("data.db", {}, "model_switch");

    expect(mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        dimensions: 1024,
        fingerprintChanged: true,
        reason: "model_switch",
      })
    );
  });

  it("远端升级部分失败后保留进度，下次启动只补失败项", async () => {
    const fingerprint = mainEmbeddingFingerprint("fp-plugin");
    mockContext.resolveEmbeddingConfig.mockReturnValue({
      provider: "plugin",
      pluginId: "test.embedding",
      fingerprint: "fp-plugin",
      dimensions: 3,
      model: "remote",
    });
    mockContext.metaStore.set("main_content_embedding_fingerprint", "old");
    mockContext.mainContentQueueMock.reconcileByPolicy.mockImplementationOnce(async () => {
      mockContext.metaStore.set(MAIN_CHUNK_BUILD_KEY, fingerprint);
      return { queued: 2, indexed: 1, failed: 1, stale: false };
    });
    const orchestrator = embeddingIndexOrchestrator as any;
    await orchestrator.reconcileForCurrentDb("data.db", {}, "startup_reconcile");
    expect(mockContext.metaStore.get("main_content_embedding_fingerprint")).toBe("old");
    expect(mockContext.metaStore.get(MAIN_CHUNK_BUILD_KEY)).toBe(fingerprint);
    mockContext.mainContentQueueMock.reconcileByPolicy.mockResolvedValueOnce({
      queued: 1,
      indexed: 1,
      failed: 0,
      stale: false,
    });
    await orchestrator.reconcileForCurrentDb("data.db", {}, "startup_reconcile");
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenLastCalledWith(
      expect.objectContaining({ fingerprintChanged: false, autoIndex: true })
    );
    expect(mockContext.metaStore.get("main_content_embedding_fingerprint")).toBe(fingerprint);
    expect(mockContext.metaStore.get(MAIN_CHUNK_BUILD_KEY)).toBe("");
    await orchestrator.reconcileForCurrentDb("data.db", {}, "startup_reconcile");
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledTimes(2);
  });

  it("embedding 指纹未变化时，video-note 队列不应重复重建", async () => {
    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb("data.db", {}, "model_switch");
    mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy.mockClear();

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb("data.db", {}, "model_switch");

    expect(mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        dimensions: 1024,
        fingerprintChanged: false,
        reason: "model_switch",
      })
    );
  });

  it("上传重连且索引已 ready、指纹未变化时，应跳过所有 reconcile", async () => {
    mockContext.metaStore.set(
      "main_content_embedding_fingerprint",
      mainEmbeddingFingerprint("fp-a")
    );
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue("ready");

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect"
    );

    expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();
    expect(mockContext.vibeLearningQueueMock.handleEmbeddingSwitchByPolicy).not.toHaveBeenCalled();
    expect(mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy).not.toHaveBeenCalled();
  });

  it("下载重连即使指纹未变化也应继续 reconcile", async () => {
    mockContext.metaStore.set(
      "main_content_embedding_fingerprint",
      mainEmbeddingFingerprint("fp-a")
    );
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue("ready");

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_download_reconnect"
    );

    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_download_reconnect",
      })
    );
  });

  it("上传重连时若索引状态不是 ready，则仍应执行 reconcile", async () => {
    mockContext.metaStore.set(
      "main_content_embedding_fingerprint",
      mainEmbeddingFingerprint("fp-a")
    );
    mockContext.databaseModuleMock.getIndexRebuildState.mockReturnValue("pending");

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect"
    );

    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_upload_reconnect",
      })
    );
  });

  it("上传重连时应只依据向量索引状态决定是否跳过", async () => {
    mockContext.metaStore.set(
      "main_content_embedding_fingerprint",
      mainEmbeddingFingerprint("fp-a")
    );
    mockContext.databaseModuleMock.getIndexRebuildState.mockImplementation(
      (_dbName: string, target?: string) => (target === "vec" ? "pending" : "ready")
    );

    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "sync_upload_reconnect"
    );

    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        mainDbName: "data.db",
        fingerprintChanged: false,
        reason: "sync_upload_reconnect",
      })
    );
  });

  describe("编辑后空闲补索引", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockContext.userSettingModuleMock.getSettingSnapshot.mockResolvedValue({});
      mockContext.mainContentQueueMock.isRunning.mockReturnValue(false);
    });

    afterEach(() => {
      (embeddingIndexOrchestrator as any).clearIdleIndex();
      vi.useRealTimers();
    });

    const flush = async () => {
      await vi.runOnlyPendingTimersAsync();
      await (embeddingIndexOrchestrator as any).reconcileChain;
    };

    it("只识别会改变正文的写命令", () => {
      expect(isMainContentWriteEvent("content:update")).toBe(true);
      expect(isMainContentWriteEvent("update-card")).toBe(true);
      expect(isMainContentWriteEvent("get-all-cards")).toBe(false);
      expect(isMainContentWriteEvent("update-article-is-top")).toBe(false);
    });

    it("连续写入会顺延，停止编辑后只跑一轮增量索引", async () => {
      const orchestrator = embeddingIndexOrchestrator as any;
      orchestrator.scheduleIdleIndex("data.db");
      await vi.advanceTimersByTimeAsync(IDLE_INDEX_DELAY_MS - 1000);
      orchestrator.scheduleIdleIndex("data.db");
      await vi.advanceTimersByTimeAsync(IDLE_INDEX_DELAY_MS - 1000);

      expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      await orchestrator.reconcileChain;

      expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledTimes(1);
      expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "content_idle", autoIndex: true })
      );
    });

    it("插件提供方不自动补索引", async () => {
      mockContext.resolveEmbeddingConfig.mockReturnValue({
        provider: "plugin",
        pluginId: "test.embedding",
        model: "text-embedding-3-small",
        dimensions: 1536,
        fingerprint: "fp-plugin",
      });
      (embeddingIndexOrchestrator as any).scheduleIdleIndex("data.db");
      await flush();

      expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();
    });

    it("已有一轮在跑时顺延到下一个空闲窗口", async () => {
      mockContext.mainContentQueueMock.isRunning.mockReturnValue(true);
      const orchestrator = embeddingIndexOrchestrator as any;
      orchestrator.scheduleIdleIndex("data.db");
      await flush();

      expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();
      expect(orchestrator.idleIndexTimer).not.toBeNull();
    });
  });
});

describe("EmbeddingIndexOrchestrator(插件提供方)", () => {
  beforeEach(() => {
    mockContext.metaStore.clear();
    mockContext.mainContentQueueMock.reconcileByPolicy.mockClear();
    mockContext.vibeLearningQueueMock.handleEmbeddingSwitchByPolicy.mockClear();
    mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy.mockClear();
    mockContext.mainContentQueueMock.isRunning.mockReturnValue(false);
    mockContext.userSettingModuleMock.getSettingSnapshot.mockResolvedValue({});
    mockContext.pluginEmbeddingsRelayMock.isReady.mockReset();
    mockContext.pluginEmbeddingsRelayMock.isReady.mockReturnValue(false);
    mockContext.resolveEmbeddingConfig.mockReset();
    mockContext.resolveEmbeddingConfig.mockReturnValue({
      provider: "plugin",
      pluginId: "test.embedding",
      model: "m",
      dimensions: 3,
      distance: 0.6,
      fingerprint: "fp-plugin",
    });
  });

  it("插件未就绪时 reconcile 跳过且不落指纹", async () => {
    await (embeddingIndexOrchestrator as any).reconcileForCurrentDb(
      "data.db",
      {},
      "startup_reconcile"
    );

    expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();
    expect(mockContext.vibeLearningQueueMock.handleEmbeddingSwitchByPolicy).not.toHaveBeenCalled();
    expect(mockContext.videoNoteQueueMock.handleEmbeddingSwitchByPolicy).not.toHaveBeenCalled();
    expect(mockContext.metaStore.get("main_content_embedding_fingerprint")).toBeUndefined();
  });

  it("插件未就绪时手动索引被拒绝，就绪后可发起", async () => {
    await expect(embeddingIndexOrchestrator.startManualIndex()).resolves.toEqual({
      started: false,
      error: "嵌入插件未就绪",
    });
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();

    mockContext.pluginEmbeddingsRelayMock.isReady.mockReturnValue(true);
    await expect(embeddingIndexOrchestrator.startManualIndex()).resolves.toEqual({ started: true });
    await (embeddingIndexOrchestrator as any).reconcileChain;
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalled();
  });

  it("provider 未就绪翻转为就绪时恢复 reconcile，重复通知不重复恢复", async () => {
    const orchestrator = embeddingIndexOrchestrator as any;
    await orchestrator.reconcileForCurrentDb("data.db", {}, "startup_reconcile");
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).not.toHaveBeenCalled();

    mockContext.pluginEmbeddingsRelayMock.isReady.mockReturnValue(true);
    // handleProvidersChanged 内部异步读取设置后再排队 reconcile，先等内部 promise 落定
    orchestrator.handleProvidersChanged();
    await new Promise(resolve => setTimeout(resolve, 0));
    await orchestrator.reconcileChain;
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledTimes(1);

    // 就绪状态未再翻转时，后续 providers 变化不触发恢复
    orchestrator.handleProvidersChanged();
    await new Promise(resolve => setTimeout(resolve, 0));
    await orchestrator.reconcileChain;
    expect(mockContext.mainContentQueueMock.reconcileByPolicy).toHaveBeenCalledTimes(1);
  });

  it("getIndexStatus 的 providerReady 按提供方类型取值", async () => {
    mockContext.pluginEmbeddingsRelayMock.isReady.mockReturnValue(false);
    await expect(embeddingIndexOrchestrator.getIndexStatus()).resolves.toMatchObject({
      provider: "plugin",
      providerReady: false,
    });

    mockContext.pluginEmbeddingsRelayMock.isReady.mockReturnValue(true);
    await expect(embeddingIndexOrchestrator.getIndexStatus()).resolves.toMatchObject({
      providerReady: true,
    });
  });
});
