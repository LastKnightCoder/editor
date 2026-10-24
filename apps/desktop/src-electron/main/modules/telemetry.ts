import { app } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import log from "electron-log";
import { VersionClient } from "@tau/analytics/client";
import { Module } from "../types/module";
import PathUtil from "../utils/PathUtil";
import { FileAnalyticsStorage } from "../utils/analytics-storage";

const VERSION_ENDPOINT = "https://analytics.taunote.app/v1/versions";
const RETRY_DELAYS_MS = [20_000, 60_000, 300_000];

class TelemetryModule implements Module {
  name = "telemetry";
  private client: VersionClient | null = null;

  async init(): Promise<void> {
    if (
      (!app.isPackaged && process.env.TAU_TELEMETRY_DEBUG !== "1") ||
      process.env.TAU_TELEMETRY_DISABLED === "1"
    )
      return;
    this.client = new VersionClient({
      endpoint: process.env.TAU_ANALYTICS_ENDPOINT ?? VERSION_ENDPOINT,
      environment: app.isPackaged ? "production" : "development",
      id: randomUUID,
      storage: new FileAnalyticsStorage(
        path.join(
          PathUtil.getAppDir(),
          app.isPackaged ? "analytics.json" : "analytics.development.json"
        )
      ),
    });
    try {
      await this.client.initialize();
    } catch {
      this.client = null;
      log.warn("version reporting storage unavailable");
      return;
    }
    void this.reportVersion();
  }

  private async reportVersion(attempt = 0): Promise<void> {
    try {
      await this.client?.report(app.getVersion());
    } catch {
      if (attempt >= RETRY_DELAYS_MS.length) {
        log.warn("version reporting deferred until next launch");
        return;
      }
      setTimeout(() => void this.reportVersion(attempt + 1), RETRY_DELAYS_MS[attempt]).unref();
    }
  }
}

export default new TelemetryModule();
