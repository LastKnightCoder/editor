import { ipcMain } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import OpenAI from "openai";
import log from "electron-log";
import type { EmbeddingProviderType } from "@/types/embedding";
import { Module } from "../types/module";
import databaseModule from "./database";
import videoNoteIndexDBManager, { type VideoNoteIndexChunk } from "./video-note-index-db";
import localInference from "./local-inference";
import { DEFAULT_LOCAL_EMBEDDING_DISTANCE, LOCAL_EMBEDDING_CONFIG_ID } from "@/constants/embedding";
import { runSearchPipeline } from "./search-core/pipeline";
import { createVideoNoteAdapter } from "./search-core/video-note-adapter";
import { LocalQueryExpander, NoopExpander } from "./search-core/expander";
import { LocalReranker, NoopReranker } from "./search-core/reranker";
import { readSearchModelProviderConfig } from "../utils/search-model-config";
import PathUtil from "../utils/PathUtil";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

interface EmbeddingSettingConfig {
  id: string;
  providerType?: EmbeddingProviderType;
  apiKey?: string;
  baseUrl?: string;
  localModelDir?: string;
  batchSize?: number;
  devicePolicy?: "auto" | "cpu" | "cuda";
  currentModel: string;
  models: Array<{
    name: string;
    contextLength: number;
    distance?: number;
  }>;
}

interface EmbeddingConfig {
  providerType: EmbeddingProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  dimensions: number;
  distance: number;
  batchSize: number;
  devicePolicy: "auto" | "cpu" | "cuda";
  localModelDir?: string;
}

interface SettingForEmbedding {
  embeddingProvider?: {
    currentConfigId?: string;
    configs?: EmbeddingSettingConfig[];
  };
}

type EmbeddingSwitchReason =
  | "config_switch"
  | "model_switch"
  | "db_switch"
  | "startup_reconcile"
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

interface IndexTask {
  mainDbName: string;
  videoNoteId: number;
  generation: number;
}

interface HandleEmbeddingSwitchByPolicyParams {
  mainDbName: string;
  dimensions: number;
  fingerprintChanged: boolean;
  providerType: EmbeddingProviderType;
  reason: EmbeddingSwitchReason;
}

interface HandleEmbeddingSwitchByPolicyResult {
  reinitOk: boolean;
  queued: number;
  droppedPending: number;
  previousGeneration: number;
  currentGeneration: number;
}

type IndexVideoNoteResult = "done" | "retry";

class VideoNoteIndexQueue implements Module {
  name = "video-note-index-queue";
  private queue: IndexTask[] = [];
  private queueGeneration = 0;
  private isProcessing = false;
  private cachedEmbeddingConfig: EmbeddingConfig | null | undefined = undefined;
  private recoveryNeededDbNames: Set<string> = new Set();
  private static readonly RECOVER_YIELD_EVERY = 20;

  async init() {
    ipcMain.handle("video-note-search-content", async (_event, params) => {
      return this.searchContent(params);
    });

    ipcMain.handle(
      "video-note-rebuild-after-embedding-switch",
      async (
        _event,
        params: {
          dimensions: number;
          reason?: EmbeddingSwitchReason;
          mainDbName?: string;
        }
      ) => {
        return this.rebuildQueueForEmbeddingSwitch(params);
      }
    );

    ipcMain.handle(
      "video-note-index-statuses",
      async (
        _event,
        params: {
          mainDbName: string;
          videoNoteIds: number[];
        }
      ) => {
        const { mainDbName, videoNoteIds } = params;
        const result: Record<number, { indexed: boolean }> = {};
        for (const videoNoteId of videoNoteIds) {
          result[videoNoteId] = {
            indexed: videoNoteIndexDBManager.checkIndexExists(mainDbName, videoNoteId),
          };
        }
        return result;
      }
    );

    databaseModule.onDatabaseConnected((dbName, reason) => {
      const shouldRecover =
        reason !== "sync_upload_reconnect" || this.recoveryNeededDbNames.has(dbName);

      if (shouldRecover) {
        this.checkAndRecoverVideoNotes(dbName)
          .then(() => {
            this.recoveryNeededDbNames.delete(dbName);
            if (this.hasQueuedTasksForDb(dbName)) {
              void this.processQueue();
            }
          })
          .catch(error => {
            log.error("[VideoNoteIndexQueue] recover failed:", error);
          });
        return;
      }

      if (this.hasQueuedTasksForDb(dbName)) {
        log.info(`[VideoNoteIndexQueue] Resume queued tasks after upload reconnect: db=${dbName}`);
        void this.processQueue();
        return;
      }

      log.info(`[VideoNoteIndexQueue] Skip recover after upload reconnect: db=${dbName}`);
    });

    log.info("[VideoNoteIndexQueue] Module initialized");
  }

  private isStale(task: Pick<IndexTask, "generation">): boolean {
    return task.generation !== this.queueGeneration;
  }

  private dequeueForCurrentGeneration(): IndexTask | null {
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      if (task.generation !== this.queueGeneration) {
        continue;
      }
      return task;
    }
    return null;
  }

  private hasQueuedTasksForDb(mainDbName: string): boolean {
    return this.queue.some(
      task => task.mainDbName === mainDbName && task.generation === this.queueGeneration
    );
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      while (true) {
        const task = this.dequeueForCurrentGeneration();
        if (!task) {
          break;
        }
        if (this.isStale(task)) {
          continue;
        }
        try {
          const result = await this.indexVideoNote(task);
          if (result === "retry") {
            this.queue.unshift(task);
            log.info(
              `[VideoNoteIndexQueue] Defer task until database reconnects: db=${task.mainDbName}, videoNoteId=${task.videoNoteId}`
            );
            break;
          }
        } catch (error) {
          this.recoveryNeededDbNames.add(task.mainDbName);
          log.error(
            `[VideoNoteIndexQueue] index failed: videoNoteId=${task.videoNoteId}, error=${error}`
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  enqueueTask(mainDbName: string, videoNoteId: number): void {
    const existing = this.queue.find(
      task =>
        task.mainDbName === mainDbName &&
        task.videoNoteId === videoNoteId &&
        task.generation === this.queueGeneration
    );
    if (!existing) {
      this.queue.push({
        mainDbName,
        videoNoteId,
        generation: this.queueGeneration,
      });
    }
    void this.processQueue();
  }

  abortCurrentRun(): void {
    this.queueGeneration += 1;
    this.queue = [];
    log.info(`[VideoNoteIndexQueue] Abort current run, generation=${this.queueGeneration}`);
  }

  cleanupVideoNoteArtifacts(mainDbName: string, videoNoteId: number): void {
    this.queue = this.queue.filter(
      task =>
        !(
          task.mainDbName === mainDbName &&
          task.videoNoteId === videoNoteId &&
          task.generation === this.queueGeneration
        )
    );
    videoNoteIndexDBManager.deleteDatabase(mainDbName, videoNoteId);
  }

  private async indexVideoNote(task: IndexTask): Promise<IndexVideoNoteResult> {
    const db = databaseModule.getDatabase(task.mainDbName);
    if (!db) {
      return "retry";
    }

    const row = db
      .prepare("SELECT transcript_segments FROM video_notes WHERE id = ? LIMIT 1")
      .get(task.videoNoteId) as { transcript_segments?: string } | undefined;
    const segments = this.parseTranscriptSegments(row?.transcript_segments);
    if (segments.length === 0) {
      videoNoteIndexDBManager.removeIndex(task.mainDbName, task.videoNoteId);
      return "done";
    }

    const chunks: VideoNoteIndexChunk[] = segments
      .map((segment, index) => ({
        chunkIndex: index,
        startMs: segment.start,
        endMs: segment.end,
        text: segment.text?.trim() || "",
      }))
      .filter(segment => !!segment.text);

    const embeddingConfig = await this.getEmbeddingConfig();
    if (!embeddingConfig) {
      videoNoteIndexDBManager.createIndex(task.mainDbName, task.videoNoteId, chunks);
      return "done";
    }

    const batchSize = embeddingConfig.batchSize || 8;
    for (let i = 0; i < chunks.length; i += batchSize) {
      if (this.isStale(task)) {
        return "done";
      }
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await this.embedTexts(
        batch.map(item => item.text),
        embeddingConfig
      );
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j] && embeddings[j].length > 0) {
          batch[j].embedding = embeddings[j];
        }
      }
    }

    videoNoteIndexDBManager.createIndex(task.mainDbName, task.videoNoteId, chunks);
    return "done";
  }

  private async getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
    if (this.cachedEmbeddingConfig !== undefined) {
      return this.cachedEmbeddingConfig;
    }
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      const settingContent = await fs.readFile(settingPath, "utf-8");
      const setting: SettingForEmbedding = JSON.parse(settingContent);
      const { embeddingProvider } = setting;
      if (!embeddingProvider || !embeddingProvider.currentConfigId) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const currentConfig = embeddingProvider.configs?.find(
        item => item.id === embeddingProvider.currentConfigId
      );
      if (!currentConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const modelConfig = currentConfig.models?.find(
        model => model.name === currentConfig.currentModel
      );
      if (!modelConfig) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const resolvedProviderType: EmbeddingProviderType =
        currentConfig.providerType === "local_python" ||
        currentConfig.id === LOCAL_EMBEDDING_CONFIG_ID
          ? "local_python"
          : "remote_openai";

      if (
        resolvedProviderType === "remote_openai" &&
        (!currentConfig.apiKey || !currentConfig.baseUrl)
      ) {
        this.cachedEmbeddingConfig = null;
        return null;
      }

      const distance =
        modelConfig.distance ||
        (resolvedProviderType === "local_python" ? DEFAULT_LOCAL_EMBEDDING_DISTANCE : 0.6);

      this.cachedEmbeddingConfig = {
        providerType: resolvedProviderType,
        apiKey: currentConfig.apiKey,
        baseUrl: currentConfig.baseUrl,
        model: currentConfig.currentModel,
        dimensions: modelConfig.contextLength,
        distance,
        batchSize: currentConfig.batchSize || 8,
        devicePolicy: currentConfig.devicePolicy || "auto",
        localModelDir:
          currentConfig.localModelDir || join(app.getPath("userData"), "embedding-models"),
      };

      videoNoteIndexDBManager.setVecDimensions(modelConfig.contextLength);
      return this.cachedEmbeddingConfig;
    } catch (error) {
      log.error(`[VideoNoteIndexQueue] load embedding config failed: ${error}`);
      this.cachedEmbeddingConfig = null;
      return null;
    }
  }

  private async embedTexts(texts: string[], embeddingConfig: EmbeddingConfig): Promise<number[][]> {
    if (!texts.length) {
      return [];
    }

    if (embeddingConfig.providerType === "local_python") {
      const result = await localInference.embedTexts(texts, {
        modelDir: embeddingConfig.localModelDir,
        modelName: embeddingConfig.model,
        batchSize: embeddingConfig.batchSize,
        devicePolicy: embeddingConfig.devicePolicy,
      });
      return result.embeddings || [];
    }

    if (!embeddingConfig.apiKey || !embeddingConfig.baseUrl) {
      return [];
    }

    const client = new OpenAI({
      apiKey: embeddingConfig.apiKey,
      baseURL: embeddingConfig.baseUrl,
    });
    const result = await client.embeddings.create({
      model: embeddingConfig.model,
      input: texts,
      dimensions: embeddingConfig.dimensions,
    });
    return result.data.map(item => item.embedding);
  }

  clearEmbeddingConfigCache(): void {
    this.cachedEmbeddingConfig = undefined;
  }

  async checkAndRecoverVideoNotes(
    mainDbName: string,
    options: { forceEmbedding?: boolean } = {}
  ): Promise<void> {
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      return;
    }

    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='video_notes'")
      .get();
    if (!tableExists) {
      return;
    }

    const rows = db.prepare("SELECT id, transcript_segments FROM video_notes").all() as Array<{
      id: number;
      transcript_segments?: string;
    }>;

    let processed = 0;
    for (const row of rows) {
      const hasSegments = this.parseTranscriptSegments(row.transcript_segments).length > 0;
      if (!hasSegments) {
        continue;
      }
      if (options.forceEmbedding) {
        this.enqueueTask(mainDbName, row.id);
        continue;
      }
      const indexed = videoNoteIndexDBManager.checkIndexExists(mainDbName, row.id);
      if (!indexed) {
        this.enqueueTask(mainDbName, row.id);
      }
      processed += 1;
      await yieldEvery(processed, VideoNoteIndexQueue.RECOVER_YIELD_EVERY);
    }
    await yieldToEventLoop();
  }

  private async reinitAllVecTables(dimensions: number, mainDbName: string): Promise<boolean> {
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      return false;
    }
    const rows = db.prepare("SELECT id FROM video_notes").all() as Array<{
      id: number;
    }>;
    videoNoteIndexDBManager.setVecDimensions(dimensions);
    let ok = true;
    let processed = 0;
    for (const row of rows) {
      const exists = videoNoteIndexDBManager.checkIndexExists(mainDbName, row.id);
      if (!exists) {
        continue;
      }
      const reinitOk = videoNoteIndexDBManager.reinitVecTable(mainDbName, row.id, dimensions);
      if (!reinitOk) {
        ok = false;
      }
      processed += 1;
      await yieldEvery(processed, VideoNoteIndexQueue.RECOVER_YIELD_EVERY);
    }
    await yieldToEventLoop();
    return ok;
  }

  private parseTranscriptSegments(
    raw: string | undefined
  ): Array<{ text: string; start: number; end: number }> {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter(
        item =>
          item &&
          typeof item.text === "string" &&
          typeof item.start === "number" &&
          typeof item.end === "number"
      );
    } catch {
      return [];
    }
  }

  async handleEmbeddingSwitchByPolicy(
    params: HandleEmbeddingSwitchByPolicyParams
  ): Promise<HandleEmbeddingSwitchByPolicyResult> {
    const previousGeneration = this.queueGeneration;
    this.queueGeneration += 1;
    const currentGeneration = this.queueGeneration;
    const droppedPending = this.queue.length;
    this.queue = [];
    this.clearEmbeddingConfigCache();

    let reinitOk = true;
    if (params.fingerprintChanged) {
      reinitOk = await this.reinitAllVecTables(Math.floor(params.dimensions), params.mainDbName);
    }
    if (reinitOk) {
      await this.checkAndRecoverVideoNotes(params.mainDbName, {
        forceEmbedding: params.fingerprintChanged,
      });
    }
    return {
      reinitOk,
      queued: this.queue.length,
      droppedPending,
      previousGeneration,
      currentGeneration,
    };
  }

  async rebuildQueueForEmbeddingSwitch(params: {
    dimensions: number;
    reason?: EmbeddingSwitchReason;
    mainDbName?: string;
  }): Promise<{
    reinitOk: boolean;
    queued: number;
    droppedPending: number;
    previousGeneration: number;
    currentGeneration: number;
  }> {
    const targetDbName = params.mainDbName || databaseModule.getCurrentDatabaseName();
    return this.handleEmbeddingSwitchByPolicy({
      mainDbName: targetDbName,
      dimensions: params.dimensions,
      fingerprintChanged: true,
      providerType: "local_python",
      reason: params.reason || "model_switch",
    });
  }

  async searchContent(params: {
    videoNoteId: number;
    mainDbName: string;
    query: string;
    limit?: number;
  }): Promise<
    Array<{
      videoNoteId: number;
      start: number;
      end: number;
      text: string;
      score: number;
      rrfScore?: number;
      rerankScore?: number;
    }>
  > {
    const { videoNoteId, mainDbName, query, limit = 5 } = params;
    if (!query?.trim()) {
      return [];
    }

    try {
      const embeddingConfig = await this.getEmbeddingConfig();
      const searchModelConfig = await readSearchModelProviderConfig();
      const expander =
        searchModelConfig.enableExpander && searchModelConfig.queryExpanderModel
          ? new LocalQueryExpander({
              modelDir: searchModelConfig.localModelDir,
              modelName: searchModelConfig.queryExpanderModel,
              devicePolicy: searchModelConfig.devicePolicy,
              maxAlternatives: 2,
            })
          : new NoopExpander(
              searchModelConfig.enableExpander
                ? "未配置本地 query expansion 模型"
                : "query expansion 已禁用"
            );

      const reranker =
        searchModelConfig.enableReranker && searchModelConfig.rerankerModel
          ? new LocalReranker({
              modelDir: searchModelConfig.localModelDir,
              modelName: searchModelConfig.rerankerModel,
              batchSize: searchModelConfig.batchSize,
              devicePolicy: searchModelConfig.devicePolicy,
            })
          : new NoopReranker(
              searchModelConfig.enableReranker ? "未配置本地 reranker 模型" : "reranker 已禁用"
            );

      const adapter = createVideoNoteAdapter();
      const { results } = await runSearchPipeline({
        query,
        limit,
        context: {
          videoNoteId,
          mainDbName,
          vector: embeddingConfig
            ? {
                distance: embeddingConfig.distance,
                embedQuery: async (queryText: string) => {
                  try {
                    const res = await this.embedTexts([queryText], embeddingConfig);
                    return res[0] || null;
                  } catch (error) {
                    log.error(`[VideoNoteIndexQueue] embed query failed: ${error}`);
                    return null;
                  }
                },
              }
            : null,
        },
        adapter,
        expander,
        reranker,
      });

      return results.map(item => ({
        videoNoteId: item.videoNoteId,
        start: item.start,
        end: item.end,
        text: item.text,
        score: item.score,
        rrfScore: item.rrfScore,
        rerankScore: item.rerankScore,
      }));
    } catch (error) {
      log.error(`[VideoNoteIndexQueue] search failed: ${error}`);
      return [];
    }
  }
}

const videoNoteIndexQueue = new VideoNoteIndexQueue();
export default videoNoteIndexQueue;
