import log from "electron-log";
import { promises as fs } from "node:fs";
import type { Pdf } from "@/types";
import type { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import pdfIndexQueue from "./pdf-index-queue";
import PdfTable from "./tables/pdf";

const STARTUP_RECONCILE_DELAY_MS = 5000;

type ReconcileEvent =
  | {
      type: "startup";
    }
  | {
      type: "db_connected";
      dbName: string;
      reason: DatabaseConnectReason;
    };

class PdfIndexOrchestrator implements Module {
  name = "pdf-index-orchestrator";
  private reconcileChain: Promise<void> = Promise.resolve();
  private lastReconciledDbName: string | null = null;

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      this.enqueueReconcile({
        type: "db_connected",
        dbName,
        reason,
      });
    });

    setTimeout(() => {
      this.enqueueReconcile({ type: "startup" });
    }, STARTUP_RECONCILE_DELAY_MS);

    log.info("[PdfIndexOrchestrator] Module initialized");
  }

  private enqueueReconcile(event: ReconcileEvent) {
    this.reconcileChain = this.reconcileChain
      .then(() => this.handleEvent(event))
      .catch((error) => {
        log.error("[PdfIndexOrchestrator] reconcile event failed:", error);
      });
  }

  private async handleEvent(event: ReconcileEvent) {
    if (event.type === "startup") {
      const dbName = databaseModule.getCurrentDatabaseName();
      if (dbName === this.lastReconciledDbName) {
        log.info(
          `[PdfIndexOrchestrator] Skip startup, already reconciled: ${dbName}`,
        );
        return;
      }
      await this.reconcileForCurrentDb(dbName, "startup_reconcile");
      return;
    }

    if (event.reason === "connect") {
      await this.waitForStartupDelay("db_connected:connect");
    }

    const reason =
      event.reason === "connect"
        ? "startup_reconcile"
        : event.reason === "sync_upload_reconnect"
          ? "sync_upload_reconnect"
          : event.reason === "sync_download_reconnect"
            ? "sync_download_reconnect"
            : "db_switch";
    await this.reconcileForCurrentDb(event.dbName, reason);
  }

  private async waitForStartupDelay(trigger: string) {
    log.info(
      `[PdfIndexOrchestrator] Delay reconcile: trigger=${trigger}, delayMs=${STARTUP_RECONCILE_DELAY_MS}`,
    );
    await new Promise<void>((resolve) => {
      setTimeout(resolve, STARTUP_RECONCILE_DELAY_MS);
    });
  }

  private async reconcileForCurrentDb(mainDbName: string, reason: string) {
    const db = databaseModule.getDatabase(mainDbName);
    if (!db) {
      log.info(
        `[PdfIndexOrchestrator] Skip reconcile, database not connected: ${mainDbName}`,
      );
      return;
    }

    const pdfs = PdfTable.getPdfList(db);
    let ready = 0;
    let skipped = 0;
    let failed = 0;

    for (const pdf of pdfs) {
      const resolvedPath = await this.resolvePdfPath(pdf);
      if (!resolvedPath) {
        skipped += 1;
        continue;
      }

      try {
        const status = await pdfIndexQueue.ensureIndex({
          pdfId: pdf.id,
          resolvedPath,
          fileName: pdf.fileName,
          mainDbName,
        });
        if (status.state === "ready") {
          ready += 1;
        } else if (status.state === "failed") {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        log.warn(
          `[PdfIndexOrchestrator] ensure index failed: db=${mainDbName}, pdfId=${pdf.id}, fileName=${pdf.fileName}, error=${error}`,
        );
      }
    }

    this.lastReconciledDbName = mainDbName;
    log.info(
      `[PdfIndexOrchestrator] Reconcile finished: db=${mainDbName}, reason=${reason}, total=${pdfs.length}, ready=${ready}, skipped=${skipped}, failed=${failed}`,
    );
  }

  private async resolvePdfPath(pdf: Pdf): Promise<string | null> {
    const candidatePath = String(pdf.filePath || "").trim();
    if (!candidatePath) {
      if (!pdf.isLocal && pdf.remoteUrl) {
        log.info(
          `[PdfIndexOrchestrator] Skip remote PDF without local cache path: pdfId=${pdf.id}, fileName=${pdf.fileName}`,
        );
      }
      return null;
    }

    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      if (!pdf.isLocal && pdf.remoteUrl) {
        log.info(
          `[PdfIndexOrchestrator] Skip remote PDF because cache path is missing: pdfId=${pdf.id}, fileName=${pdf.fileName}, path=${candidatePath}`,
        );
        return null;
      }
      log.warn(
        `[PdfIndexOrchestrator] Skip PDF because local file is missing: pdfId=${pdf.id}, fileName=${pdf.fileName}, path=${candidatePath}`,
      );
      return null;
    }
  }
}

export default new PdfIndexOrchestrator();
