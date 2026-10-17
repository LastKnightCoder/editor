import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import userSettingModule, { SettingChangedPayload } from "./user-setting";
import mainContentVecIndexQueue, {
  MainContentReconcileReason,
  type MainContentIndexStats,
  type MainContentVecIndexProgress,
} from "./main-content-vec-index-queue";
import vibeLearningIndexQueue from "./vibe-learning-index-queue";
import localInference from "./local-inference";
import videoNoteIndexQueue from "./video-note-index-queue";
import { resolveEmbeddingConfig, type ResolvedEmbeddingConfig } from "../utils/embedding-config";
import {
  MAIN_CHUNK_BUILD_KEY,
  mainEmbeddingFingerprint,
  needsMainChunkUpgrade,
} from "@/entity/chunk-version";
import { IndexRebuildState } from "./main-content-index-db";
import { EXCERPT_WRITE_EVENTS } from "./tables/excerpt";

const MAIN_CONTENT_FINGERPRINT_KEY = "main_content_embedding_fingerprint";
const VL_FINGERPRINT_KEY = "vl_embedding_fingerprint";
const VIDEO_NOTE_FINGERPRINT_KEY = "video_note_embedding_fingerprint";
const STARTUP_RECONCILE_DELAY_MS = 5000;
const EMBEDDING_INDEX_PROGRESS_CHANNEL = "embedding-index-progress";
/** 停止写入多久后自动补索引 */
export const IDLE_INDEX_DELAY_MS = 2 * 60 * 1000;

const MAIN_CONTENT_WRITE_EVENTS = new Set([
  "content:update",
  "create-card",
  "create-card-from-project-item",
  "update-card",
  "create-article",
  "create-article-from-project-item",
  "update-article",
  "update-project-item",
  "add-root-project-item",
  "add-child-project-item",
  "create-diary-entry",
  "update-diary-entry",
  "create-diary-segment",
  "update-diary-segment",
  "create-diary-moment",
  // 外部材料（KL-037）：摘录、PDF 标注、剪藏
  ...EXCERPT_WRITE_EVENTS,
  "add-pdf-annotation",
  "update-pdf-annotation",
  "delete-pdf-annotation",
  "delete-pdf",
  "web-clip:create",
  "web-clip:update",
  "lineage:record",
  // 主对话的提问只进向量（KL-064）：每轮结束会话行会更新
  "chat-session:update",
  "chat-session:delete",
]);

/** 会改变卡片 / 文章 / 项目文档 / 日记正文或外部材料的写命令 */
export const isMainContentWriteEvent = (eventName: string) =>
  MAIN_CONTENT_WRITE_EVENTS.has(eventName);

export interface EmbeddingIndexStatus {
  mainDbName: string;
  configValid: boolean;
  providerType: ResolvedEmbeddingConfig["providerType"] | null;
  model: string | null;
  /** 该模型是否会被后台自动索引（仅本地模型） */
  autoIndex: boolean;
  stats: MainContentIndexStats | null;
  running: MainContentVecIndexProgress | null;
  lastRun: MainContentVecIndexProgress | null;
  rebuildState: IndexRebuildState | null;
}

type ReconcileEvent =
  | {
      type: "startup";
    }
  | {
      type: "db_connected";
      dbName: string;
      reason: DatabaseConnectReason;
    }
  | {
      type: "setting_changed";
      payload: SettingChangedPayload;
    };

class EmbeddingIndexOrchestrator implements Module {
  name = "embedding-index-orchestrator";
  private reconcileChain: Promise<void> = Promise.resolve();
  private lastReconciledDbName: string | null = null;
  private idleIndexTimer: ReturnType<typeof setTimeout> | null = null;
  private idleIndexDbName: string | null = null;

  private async waitForStartupDelay(trigger: string) {
    log.info(
      `[EmbeddingIndexOrchestrator] Delay startup reconcile: trigger=${trigger}, delayMs=${STARTUP_RECONCILE_DELAY_MS}`
    );
    await new Promise<void>(resolve => {
      setTimeout(resolve, STARTUP_RECONCILE_DELAY_MS);
    });
  }

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      // 数据库切换时，立即中止旧数据库的 embedding 工作（不等 reconcileChain）
      if (reason === "switch") {
        this.clearIdleIndex();
        mainContentVecIndexQueue.abortCurrentRun();
        vibeLearningIndexQueue.abortCurrentRun();
        videoNoteIndexQueue.abortCurrentRun();
      }

      this.enqueueReconcile({
        type: "db_connected",
        dbName,
        reason,
      });
    });

    userSettingModule.onSettingChanged(payload => {
      this.enqueueReconcile({
        type: "setting_changed",
        payload,
      });
    });

    setTimeout(() => {
      this.enqueueReconcile({ type: "startup" });
    }, STARTUP_RECONCILE_DELAY_MS);

    databaseModule.onDatabaseWrite((dbName, eventName) => {
      if (isMainContentWriteEvent(eventName)) {
        this.scheduleIdleIndex(dbName);
      }
    });

    this.registerIpc();

    log.info("[EmbeddingIndexOrchestrator] Module initialized");
  }

  /**
   * 内容写入后的空闲补索引：每次写入都把计时器往后推，连续编辑期间不会触发，
   * 停止编辑 IDLE_INDEX_DELAY_MS 后跑一轮增量索引（只处理有变化的文档）。
   * 仅本地模型生效，API 模型按量计费，仍由用户手动发起。
   */
  private scheduleIdleIndex(dbName: string) {
    if (this.idleIndexTimer) {
      clearTimeout(this.idleIndexTimer);
    }
    this.idleIndexDbName = dbName;
    this.idleIndexTimer = setTimeout(() => {
      void this.runIdleIndex();
    }, IDLE_INDEX_DELAY_MS);
  }

  private clearIdleIndex() {
    if (this.idleIndexTimer) {
      clearTimeout(this.idleIndexTimer);
    }
    this.idleIndexTimer = null;
    this.idleIndexDbName = null;
  }

  private async runIdleIndex() {
    const dbName = this.idleIndexDbName;
    this.clearIdleIndex();
    if (!dbName || dbName !== databaseModule.getCurrentDatabaseName()) {
      return;
    }
    // 已有一轮在跑（启动 / 同步 / 手动）：等它结束后再补，避免排队叠加
    if (mainContentVecIndexQueue.isRunning()) {
      this.scheduleIdleIndex(dbName);
      return;
    }
    const setting = await userSettingModule.getSettingSnapshot();
    const resolvedConfig = resolveEmbeddingConfig(setting);
    if (
      !resolvedConfig ||
      resolvedConfig.providerType !== "local_python" ||
      !localInference.isEmbeddingModelReady({
        modelDir: resolvedConfig.localModelDir,
        modelName: resolvedConfig.model,
      })
    ) {
      return;
    }
    log.info(`[EmbeddingIndexOrchestrator] Idle index after content writes: db=${dbName}`);
    this.reconcileChain = this.reconcileChain
      .then(() => this.runIncrementalIndex(dbName, resolvedConfig, "content_idle"))
      .catch(error => {
        log.error("[EmbeddingIndexOrchestrator] idle index failed:", error);
      });
  }

  /**
   * 本地向量模型下载完成后由 embedding-model-manager 调用，
   * 恢复此前因模型缺失而跳过的索引重建
   */
  notifyEmbeddingModelReady() {
    this.reconcileChain = this.reconcileChain
      .then(async () => {
        const dbName = databaseModule.getCurrentDatabaseName();
        if (!dbName) {
          return;
        }
        const setting = await userSettingModule.getSettingSnapshot();
        await this.reconcileForCurrentDb(dbName, setting, "model_switch");
      })
      .catch(error => {
        log.error("[EmbeddingIndexOrchestrator] model_ready reconcile failed:", error);
      });
  }

  /** 设置页「索引状态」：覆盖统计 + 进行中的进度 + 上一轮记录 */
  async getIndexStatus(): Promise<EmbeddingIndexStatus> {
    const mainDbName = databaseModule.getCurrentDatabaseName();
    const setting = await userSettingModule.getSettingSnapshot();
    const resolvedConfig = resolveEmbeddingConfig(setting);
    const stats = await mainContentVecIndexQueue.getIndexStats(mainDbName);
    const indexDb = databaseModule.getIndexDatabase(mainDbName);
    const running = mainContentVecIndexQueue.getCurrentProgress();
    return {
      mainDbName,
      configValid: !!resolvedConfig,
      providerType: resolvedConfig?.providerType ?? null,
      model: resolvedConfig?.model ?? null,
      autoIndex: resolvedConfig?.providerType === "local_python",
      stats,
      running: running && running.mainDbName === mainDbName ? running : null,
      lastRun: indexDb ? mainContentVecIndexQueue.getLastRun(indexDb) : null,
      rebuildState: indexDb ? databaseModule.getIndexRebuildState(mainDbName, "vec") : null,
    };
  }

  /**
   * 用户手动发起一轮主内容增量索引（只补未索引 / 内容已更新的文档）。
   * API 模型不会自动索引，手动发起时同样会执行（由用户显式触发）。
   */
  async startManualIndex(): Promise<{ started: boolean; error?: string }> {
    if (mainContentVecIndexQueue.isRunning()) {
      return { started: false, error: "索引正在进行中" };
    }
    const mainDbName = databaseModule.getCurrentDatabaseName();
    const setting = await userSettingModule.getSettingSnapshot();
    const resolvedConfig = resolveEmbeddingConfig(setting);
    if (!resolvedConfig) {
      return { started: false, error: "嵌入模型配置无效，请先启用一个模型" };
    }
    if (
      resolvedConfig.providerType === "local_python" &&
      !localInference.isEmbeddingModelReady({
        modelDir: resolvedConfig.localModelDir,
        modelName: resolvedConfig.model,
      })
    ) {
      return { started: false, error: "本地向量模型尚未下载" };
    }
    this.clearIdleIndex();

    this.reconcileChain = this.reconcileChain
      .then(() => this.runIncrementalIndex(mainDbName, resolvedConfig, "manual"))
      .catch(error => {
        log.error("[EmbeddingIndexOrchestrator] manual index failed:", error);
      });
    return { started: true };
  }

  private async runIncrementalIndex(
    mainDbName: string,
    resolvedConfig: ResolvedEmbeddingConfig,
    reason: "manual" | "content_idle"
  ) {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(
      mainDbName,
      `embedding:${reason}`
    );
    const indexDb = databaseModule.getIndexDatabase(mainDbName);
    if (!ensureResult || !databaseModule.getDatabase(mainDbName) || !indexDb) {
      log.info(
        `[EmbeddingIndexOrchestrator] Skip ${reason} index, database not connected: ${mainDbName}`
      );
      return;
    }
    this.ensureMetaTable(indexDb);
    const fingerprintChanged =
      this.getMetaValue(indexDb, MAIN_CONTENT_FINGERPRINT_KEY) !==
        mainEmbeddingFingerprint(resolvedConfig.fingerprint) &&
      this.getMetaValue(indexDb, MAIN_CHUNK_BUILD_KEY) !==
        mainEmbeddingFingerprint(resolvedConfig.fingerprint);
    const result = await mainContentVecIndexQueue.reconcileByPolicy({
      mainDbName,
      embeddingConfig: resolvedConfig,
      fingerprintChanged,
      autoIndex: true,
      reason,
    });
    if (!result.stale && result.failed === 0) {
      this.setMetaValue(
        indexDb,
        MAIN_CONTENT_FINGERPRINT_KEY,
        mainEmbeddingFingerprint(resolvedConfig.fingerprint)
      );
      this.setMetaValue(indexDb, MAIN_CHUNK_BUILD_KEY, "");
    }
    log.info(
      `[EmbeddingIndexOrchestrator] Incremental index finished: db=${mainDbName}, reason=${reason}, queued=${result.queued}, indexed=${result.indexed}, stale=${result.stale}`
    );
  }

  private registerIpc() {
    ipcMain.handle("embedding-index-get-status", () => this.getIndexStatus());
    ipcMain.handle("embedding-index-start-manual", () => this.startManualIndex());
    mainContentVecIndexQueue.onProgress(progress => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send(EMBEDDING_INDEX_PROGRESS_CHANNEL, progress);
        }
      }
    });
  }

  private enqueueReconcile(event: ReconcileEvent) {
    this.reconcileChain = this.reconcileChain
      .then(() => this.handleEvent(event))
      .catch(error => {
        log.error("[EmbeddingIndexOrchestrator] reconcile event failed:", error);
      });
  }

  private async handleEvent(event: ReconcileEvent) {
    if (event.type === "startup") {
      const dbName = databaseModule.getCurrentDatabaseName();
      // 如果 db_connected 已经处理过同一个数据库，跳过 startup 避免重复 reconcile
      if (dbName === this.lastReconciledDbName) {
        log.info(`[EmbeddingIndexOrchestrator] Skip startup, already reconciled: ${dbName}`);
        return;
      }
      const setting = await userSettingModule.getSettingSnapshot();
      await this.reconcileForCurrentDb(dbName, setting, "startup_reconcile");
      return;
    }

    if (event.type === "db_connected") {
      if (event.reason === "connect") {
        await this.waitForStartupDelay("db_connected:connect");
      }
      const setting = await userSettingModule.getSettingSnapshot();
      const reason: MainContentReconcileReason =
        event.reason === "connect"
          ? "startup_reconcile"
          : event.reason === "sync_upload_reconnect"
            ? "sync_upload_reconnect"
            : event.reason === "sync_download_reconnect"
              ? "sync_download_reconnect"
              : "db_switch";
      await this.reconcileForCurrentDb(event.dbName, setting, reason);
      return;
    }

    const { oldSetting, newSetting } = event.payload;
    const oldConfig = resolveEmbeddingConfig(oldSetting);
    const newConfig = resolveEmbeddingConfig(newSetting);

    // 仅在 embedding 生效配置指纹变化时触发 reconcile。
    if (!oldConfig && !newConfig) {
      log.debug(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding config unchanged (both invalid)"
      );
      return;
    }

    if (oldConfig && newConfig && oldConfig.fingerprint === newConfig.fingerprint) {
      log.debug(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding fingerprint unchanged"
      );
      return;
    }

    if (oldConfig && !newConfig) {
      log.warn(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding config became invalid"
      );
      return;
    }

    if (!newConfig) {
      return;
    }

    const reason = this.getSettingChangeReason(oldConfig, newConfig);
    await this.reconcileForCurrentDb(databaseModule.getCurrentDatabaseName(), newSetting, reason);
  }

  private getSettingChangeReason(
    oldConfig: ResolvedEmbeddingConfig | null,
    newConfig: ResolvedEmbeddingConfig
  ): MainContentReconcileReason {
    if (!oldConfig) {
      return "config_switch";
    }

    if (
      oldConfig.configId !== newConfig.configId ||
      oldConfig.providerType !== newConfig.providerType
    ) {
      return "config_switch";
    }

    return "model_switch";
  }

  private async reconcileForCurrentDb(
    mainDbName: string,
    setting: Record<string, any>,
    reason: MainContentReconcileReason
  ) {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(
      mainDbName,
      `embedding:${reason}`
    );
    const indexDb = databaseModule.getIndexDatabase(mainDbName);
    if (!ensureResult || !databaseModule.getDatabase(mainDbName) || !indexDb) {
      log.info(
        `[EmbeddingIndexOrchestrator] Skip reconcile, database not connected: ${mainDbName}`
      );
      return;
    }

    const resolvedConfig = resolveEmbeddingConfig(setting);
    if (!resolvedConfig) {
      log.warn(
        `[EmbeddingIndexOrchestrator] Skip reconcile for ${mainDbName}, embedding config invalid`
      );
      return;
    }

    // 本地向量模型未下载时跳过本轮索引（fingerprint 不落库，
    // 下载完成后下一次 reconcile 会自动恢复重建），避免逐条任务报错
    if (
      resolvedConfig.providerType === "local_python" &&
      !localInference.isEmbeddingModelReady({
        modelDir: resolvedConfig.localModelDir,
        modelName: resolvedConfig.model,
      })
    ) {
      log.warn(
        `[EmbeddingIndexOrchestrator] 本地向量模型未下载，跳过索引重建（${resolvedConfig.model}）；请在「设置 → 向量模型」下载，完成后将自动继续`
      );
      return;
    }

    this.ensureMetaTable(indexDb);

    const mainFingerprint = this.getMetaValue(indexDb, MAIN_CONTENT_FINGERPRINT_KEY);
    const resumeMainBuild =
      this.getMetaValue(indexDb, MAIN_CHUNK_BUILD_KEY) ===
      mainEmbeddingFingerprint(resolvedConfig.fingerprint);
    const vlFingerprint = this.getMetaValue(indexDb, VL_FINGERPRINT_KEY);
    const videoNoteFingerprint = this.getMetaValue(indexDb, VIDEO_NOTE_FINGERPRINT_KEY);
    const mainFingerprintChanged =
      mainFingerprint !== mainEmbeddingFingerprint(resolvedConfig.fingerprint) && !resumeMainBuild;
    const vlFingerprintChanged = vlFingerprint !== resolvedConfig.fingerprint;
    const videoNoteFingerprintChanged = videoNoteFingerprint !== resolvedConfig.fingerprint;
    const rebuildState = databaseModule.getIndexRebuildState(mainDbName, "vec");

    if (
      this.shouldSkipUploadReconnectReconcile(
        mainDbName,
        reason,
        rebuildState,
        mainFingerprintChanged || resumeMainBuild
      )
    ) {
      this.lastReconciledDbName = mainDbName;
      log.info(
        `[EmbeddingIndexOrchestrator] Skip reconcile after upload reconnect: db=${mainDbName}, reason=${reason}, rebuildState=${rebuildState}, mainChanged=${mainFingerprintChanged}, vlChanged=${vlFingerprintChanged}, videoNoteChanged=${videoNoteFingerprintChanged}`
      );
      return;
    }

    const shouldSkipMainStartupReconcile =
      reason === "startup_reconcile" && !mainFingerprintChanged && !resumeMainBuild;

    const mainResult = shouldSkipMainStartupReconcile
      ? {
          generation: -1,
          reason,
          reinitialized: false,
          queued: 0,
          indexed: 0,
          failed: 0,
          stale: false,
          autoIndex:
            resolvedConfig.providerType === "local_python" ||
            needsMainChunkUpgrade(mainFingerprint) ||
            resumeMainBuild,
        }
      : await mainContentVecIndexQueue.reconcileByPolicy({
          mainDbName,
          embeddingConfig: resolvedConfig,
          fingerprintChanged: mainFingerprintChanged,
          autoIndex:
            resolvedConfig.providerType === "local_python" ||
            needsMainChunkUpgrade(mainFingerprint) ||
            resumeMainBuild,
          reason,
        });

    if (shouldSkipMainStartupReconcile) {
      log.info(
        `[EmbeddingIndexOrchestrator] Skip main content startup reconcile: db=${mainDbName}, reason=${reason}, fingerprintChanged=${mainFingerprintChanged}`
      );
    }

    if (!mainResult.stale && mainResult.failed === 0) {
      this.setMetaValue(
        indexDb,
        MAIN_CONTENT_FINGERPRINT_KEY,
        mainEmbeddingFingerprint(resolvedConfig.fingerprint)
      );
      this.setMetaValue(indexDb, MAIN_CHUNK_BUILD_KEY, "");
    }

    const vlResult = await vibeLearningIndexQueue.handleEmbeddingSwitchByPolicy({
      mainDbName,
      dimensions: resolvedConfig.dimensions,
      fingerprintChanged: vlFingerprintChanged,
      providerType: resolvedConfig.providerType,
      reason,
    });

    if (vlResult.reinitOk || !vlFingerprintChanged) {
      this.setMetaValue(indexDb, VL_FINGERPRINT_KEY, resolvedConfig.fingerprint);
    }

    const videoNoteResult = await videoNoteIndexQueue.handleEmbeddingSwitchByPolicy({
      mainDbName,
      dimensions: resolvedConfig.dimensions,
      fingerprintChanged: videoNoteFingerprintChanged,
      providerType: resolvedConfig.providerType,
      reason,
    });

    if (videoNoteResult.reinitOk || !videoNoteFingerprintChanged) {
      this.setMetaValue(indexDb, VIDEO_NOTE_FINGERPRINT_KEY, resolvedConfig.fingerprint);
    }

    this.lastReconciledDbName = mainDbName;

    log.info(
      `[EmbeddingIndexOrchestrator] Reconcile finished: db=${mainDbName}, reason=${reason}, mainChanged=${mainFingerprintChanged}, vlChanged=${vlFingerprintChanged}, videoNoteChanged=${videoNoteFingerprintChanged}, mainQueued=${mainResult.queued}, mainIndexed=${mainResult.indexed}, vlQueued=${vlResult.queued}, vlReinitOk=${vlResult.reinitOk}, videoNoteQueued=${videoNoteResult.queued}, videoNoteReinitOk=${videoNoteResult.reinitOk}`
    );
  }

  private ensureMetaTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vec_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      )
    `);
  }

  private getMetaValue(db: Database.Database, key: string): string | null {
    const row = db.prepare("SELECT value FROM vec_index_meta WHERE key = ?").get(key) as
      { value: string } | undefined;
    return row?.value || null;
  }

  private setMetaValue(db: Database.Database, key: string, value: string) {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO vec_index_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `
    ).run(key, value, now);
  }

  private shouldSkipUploadReconnectReconcile(
    mainDbName: string,
    reason: MainContentReconcileReason,
    rebuildState: IndexRebuildState,
    mainFingerprintChanged: boolean
  ): boolean {
    if (reason !== "sync_upload_reconnect") {
      return false;
    }
    if (mainFingerprintChanged) {
      log.info(
        `[EmbeddingIndexOrchestrator] Keep reconcile after upload reconnect because fingerprint changed: db=${mainDbName}`
      );
      return false;
    }
    if (rebuildState !== "ready") {
      log.info(
        `[EmbeddingIndexOrchestrator] Keep reconcile after upload reconnect because rebuildState=${rebuildState}: db=${mainDbName}`
      );
      return false;
    }
    return true;
  }
}

export default new EmbeddingIndexOrchestrator();
