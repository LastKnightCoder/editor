import log from "electron-log";
import type { Module } from "../types/module";
import databaseModule from "./database";
import memoryReconcileQueue, {
  type MemoryReconcileReason,
} from "./memory-reconcile-queue";
import memoryService from "./memory-service";
import pythonService from "./python-service";

const STARTUP_RECONCILE_DELAY_MS = 5000;
const INTERVAL_RECONCILE_MS = 3 * 60 * 1000;

type ReconcileEvent =
  | { type: "startup" }
  | {
      type: "db_connected";
      dbName: string;
      reason:
        | "connect"
        | "switch"
        | "reconnect"
        | "sync_upload_reconnect"
        | "sync_download_reconnect";
    };

class MemoryOrchestrator implements Module {
  name = "memory-orchestrator";
  private reconcileChain: Promise<void> = Promise.resolve();
  private lastReconciledDbName: string | null = null;

  async init(): Promise<void> {
    await pythonService.init();
    pythonService.onServerReady(() => {
      const dbName = databaseModule.getCurrentDatabaseName();
      if (!dbName) {
        return;
      }
      this.enqueue({
        type: "db_connected",
        dbName,
        reason: "reconnect",
      });
    });

    databaseModule.onDatabaseConnected((dbName, reason) => {
      if (reason === "switch") {
        memoryReconcileQueue.abortCurrentRun();
        if (this.lastReconciledDbName && this.lastReconciledDbName !== dbName) {
          memoryService.unloadDatabase(this.lastReconciledDbName);
        }
      }
      this.enqueue({ type: "db_connected", dbName, reason });
    });

    setTimeout(() => {
      this.enqueue({ type: "startup" });
    }, STARTUP_RECONCILE_DELAY_MS);

    setInterval(() => {
      const dbName = databaseModule.getCurrentDatabaseName();
      if (!dbName) {
        return;
      }
      this.enqueue({
        type: "db_connected",
        dbName,
        reason: "reconnect",
      });
    }, INTERVAL_RECONCILE_MS);

    log.info("[MemoryOrchestrator] Module initialized");
  }

  private enqueue(event: ReconcileEvent): void {
    this.reconcileChain = this.reconcileChain
      .then(() => this.handleEvent(event))
      .catch((error) => {
        log.error("[MemoryOrchestrator] reconcile event failed:", error);
      });
  }

  private async handleEvent(event: ReconcileEvent): Promise<void> {
    if (event.type === "startup") {
      const dbName = databaseModule.getCurrentDatabaseName();
      if (!dbName) {
        return;
      }
      if (dbName === this.lastReconciledDbName) {
        log.info(
          `[MemoryOrchestrator] Skip startup, already reconciled: ${dbName}`,
        );
        return;
      }
      await this.reconcileForCurrentDb(dbName, "startup_reconcile");
      return;
    }

    const reason: MemoryReconcileReason =
      event.reason === "switch"
        ? "db_switch"
        : event.reason === "sync_upload_reconnect"
          ? "sync_upload_reconnect"
          : event.reason === "sync_download_reconnect"
            ? "sync_download_reconnect"
            : "interval_reconcile";
    await this.reconcileForCurrentDb(event.dbName, reason);
  }

  private async reconcileForCurrentDb(
    mainDbName: string,
    reason: MemoryReconcileReason,
  ): Promise<void> {
    if (!databaseModule.getDatabase(mainDbName)) {
      log.info(
        `[MemoryOrchestrator] Skip reconcile, database not connected: ${mainDbName}`,
      );
      return;
    }

    await memoryReconcileQueue.reconcileByPolicy(mainDbName, reason);
    this.lastReconciledDbName = mainDbName;
  }
}

export default new MemoryOrchestrator();
