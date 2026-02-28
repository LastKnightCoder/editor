import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import userSettingModule, { SettingChangedPayload } from "./user-setting";
import mainContentVecIndexQueue, {
  MainContentReconcileReason,
} from "./main-content-vec-index-queue";
import vibeLearningIndexQueue from "./vibe-learning-index-queue";
import {
  resolveEmbeddingConfig,
  type ResolvedEmbeddingConfig,
} from "../utils/embedding-config";

const MAIN_CONTENT_FINGERPRINT_KEY = "main_content_embedding_fingerprint";
const VL_FINGERPRINT_KEY = "vl_embedding_fingerprint";

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

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      // 数据库切换时，立即中止旧数据库的 embedding 工作（不等 reconcileChain）
      if (reason === "switch") {
        mainContentVecIndexQueue.abortCurrentRun();
        vibeLearningIndexQueue.abortCurrentRun();
      }

      this.enqueueReconcile({
        type: "db_connected",
        dbName,
        reason,
      });
    });

    userSettingModule.onSettingChanged((payload) => {
      this.enqueueReconcile({
        type: "setting_changed",
        payload,
      });
    });

    setImmediate(() => {
      this.enqueueReconcile({ type: "startup" });
    });

    log.info("[EmbeddingIndexOrchestrator] Module initialized");
  }

  private enqueueReconcile(event: ReconcileEvent) {
    this.reconcileChain = this.reconcileChain
      .then(() => this.handleEvent(event))
      .catch((error) => {
        log.error(
          "[EmbeddingIndexOrchestrator] reconcile event failed:",
          error,
        );
      });
  }

  private async handleEvent(event: ReconcileEvent) {
    if (event.type === "startup") {
      const dbName = databaseModule.getCurrentDatabaseName();
      // 如果 db_connected 已经处理过同一个数据库，跳过 startup 避免重复 reconcile
      if (dbName === this.lastReconciledDbName) {
        log.info(
          `[EmbeddingIndexOrchestrator] Skip startup, already reconciled: ${dbName}`,
        );
        return;
      }
      const setting = await userSettingModule.getSettingSnapshot();
      await this.reconcileForCurrentDb(dbName, setting, "startup_reconcile");
      return;
    }

    if (event.type === "db_connected") {
      const setting = await userSettingModule.getSettingSnapshot();
      const reason: MainContentReconcileReason =
        event.reason === "connect" ? "startup_reconcile" : "db_switch";
      await this.reconcileForCurrentDb(event.dbName, setting, reason);
      return;
    }

    const { oldSetting, newSetting } = event.payload;
    const oldConfig = resolveEmbeddingConfig(oldSetting);
    const newConfig = resolveEmbeddingConfig(newSetting);

    // 仅在 embedding 生效配置指纹变化时触发 reconcile。
    if (!oldConfig && !newConfig) {
      log.debug(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding config unchanged (both invalid)",
      );
      return;
    }

    if (
      oldConfig &&
      newConfig &&
      oldConfig.fingerprint === newConfig.fingerprint
    ) {
      log.debug(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding fingerprint unchanged",
      );
      return;
    }

    if (oldConfig && !newConfig) {
      log.warn(
        "[EmbeddingIndexOrchestrator] Skip setting_changed: embedding config became invalid",
      );
      return;
    }

    if (!newConfig) {
      return;
    }

    const reason = this.getSettingChangeReason(oldConfig, newConfig);
    await this.reconcileForCurrentDb(
      databaseModule.getCurrentDatabaseName(),
      newSetting,
      reason,
    );
  }

  private getSettingChangeReason(
    oldConfig: ResolvedEmbeddingConfig | null,
    newConfig: ResolvedEmbeddingConfig,
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
    reason: MainContentReconcileReason,
  ) {
    const indexDb = databaseModule.getIndexDatabase(mainDbName);
    if (!databaseModule.getDatabase(mainDbName) || !indexDb) {
      log.info(
        `[EmbeddingIndexOrchestrator] Skip reconcile, database not connected: ${mainDbName}`,
      );
      return;
    }

    const resolvedConfig = resolveEmbeddingConfig(setting);
    if (!resolvedConfig) {
      log.warn(
        `[EmbeddingIndexOrchestrator] Skip reconcile for ${mainDbName}, embedding config invalid`,
      );
      return;
    }

    this.ensureMetaTable(indexDb);

    const mainFingerprint = this.getMetaValue(
      indexDb,
      MAIN_CONTENT_FINGERPRINT_KEY,
    );
    const vlFingerprint = this.getMetaValue(indexDb, VL_FINGERPRINT_KEY);
    const mainFingerprintChanged =
      mainFingerprint !== resolvedConfig.fingerprint;
    const vlFingerprintChanged = vlFingerprint !== resolvedConfig.fingerprint;

    const mainResult = await mainContentVecIndexQueue.reconcileByPolicy({
      mainDbName,
      embeddingConfig: resolvedConfig,
      fingerprintChanged: mainFingerprintChanged,
      autoIndex: resolvedConfig.providerType === "local_python",
      reason,
    });

    if (!mainResult.stale) {
      this.setMetaValue(
        indexDb,
        MAIN_CONTENT_FINGERPRINT_KEY,
        resolvedConfig.fingerprint,
      );
    }

    const vlResult = await vibeLearningIndexQueue.handleEmbeddingSwitchByPolicy(
      {
        mainDbName,
        dimensions: resolvedConfig.dimensions,
        fingerprintChanged: vlFingerprintChanged,
        providerType: resolvedConfig.providerType,
        reason,
      },
    );

    if (vlResult.reinitOk || !vlFingerprintChanged) {
      this.setMetaValue(
        indexDb,
        VL_FINGERPRINT_KEY,
        resolvedConfig.fingerprint,
      );
    }

    this.lastReconciledDbName = mainDbName;

    log.info(
      `[EmbeddingIndexOrchestrator] Reconcile finished: db=${mainDbName}, reason=${reason}, mainChanged=${mainFingerprintChanged}, vlChanged=${vlFingerprintChanged}, mainQueued=${mainResult.queued}, mainIndexed=${mainResult.indexed}, vlQueued=${vlResult.queued}, vlReinitOk=${vlResult.reinitOk}`,
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
    const row = db
      .prepare("SELECT value FROM vec_index_meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
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
    `,
    ).run(key, value, now);
  }
}

export default new EmbeddingIndexOrchestrator();
